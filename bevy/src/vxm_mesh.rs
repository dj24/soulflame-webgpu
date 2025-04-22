use crate::custom_shader_instancing::{
    InstanceData, InstanceMaterialData, InstanceMaterialDataKey,
};
use crate::dnd::PendingVxm;
use crate::vxm::VxmAsset;
use bevy::asset::{Assets, RenderAssetUsages};
use bevy::color::palettes::basic::PURPLE;
use bevy::log::info;
use bevy::pbr::wireframe::WireframeConfig;
use bevy::pbr::{ExtendedMaterial, MaterialExtension};
use bevy::prelude::*;
use bevy::render::mesh::{Indices, PrimitiveTopology};
use bevy::render::primitives::Aabb;
use bevy::render::render_resource::{AsBindGroup, ShaderRef};
use bevy::render::storage::ShaderStorageBuffer;
use bevy::render::view::NoFrustumCulling;
use rayon::prelude::*;
use std::rc::Rc;
use std::sync::Arc;

enum CubeFace {
    Front,
    Back,
    Top,
    Bottom,
    Left,
    Right,
}

fn get_cube_face_vertex_positions(cube_face: CubeFace) -> Vec<[f32; 3]> {
    match cube_face {
        CubeFace::Back => vec![
            [1.0, 0.0, 0.0], // Bottom-right
            [0.0, 0.0, 0.0], // Bottom-left
            [1.0, 1.0, 0.0], // Top-right
            [0.0, 1.0, 0.0], // Top-left
        ],
        CubeFace::Front => vec![
            [0.0, 0.0, 1.0], // Bottom-left
            [1.0, 0.0, 1.0], // Bottom-right
            [0.0, 1.0, 1.0], // Top-left
            [1.0, 1.0, 1.0], // Top-right
        ],
        CubeFace::Top => vec![
            [1.0, 1.0, 0.0], // Back-right
            [0.0, 1.0, 0.0], // Back-left
            [1.0, 1.0, 1.0], // Front-right
            [0.0, 1.0, 1.0], // Front-left
        ],
        CubeFace::Bottom => vec![
            [0.0, 0.0, 0.0], // Back-left
            [1.0, 0.0, 0.0], // Back-right
            [0.0, 0.0, 1.0], // Front-left
            [1.0, 0.0, 1.0], // Front-right
        ],
        CubeFace::Left => vec![
            [0.0, 0.0, 0.0], // Back-bottom
            [0.0, 0.0, 1.0], // Front-bottom
            [0.0, 1.0, 0.0], // Back-top
            [0.0, 1.0, 1.0], // Front-top
        ],
        CubeFace::Right => vec![
            [1.0, 0.0, 1.0], // Front-bottom
            [1.0, 0.0, 0.0], // Back-bottom
            [1.0, 1.0, 1.0], // Front-top
            [1.0, 1.0, 0.0], // Back-top
        ],
    }
}

fn get_cube_face_normals(cube_face: CubeFace) -> Vec<[f32; 3]> {
    match cube_face {
        CubeFace::Back => vec![[0.0, 0.0, -1.0]].repeat(4),
        CubeFace::Front => vec![[0.0, 0.0, 1.0]].repeat(4),
        CubeFace::Top => vec![[0.0, 1.0, 0.0]].repeat(4),
        CubeFace::Bottom => vec![[0.0, -1.0, 0.0]].repeat(4),
        CubeFace::Left => vec![[-1.0, 0.0, 0.0]].repeat(4),
        CubeFace::Right => vec![[1.0, 0.0, 0.0]].repeat(4),
    }
}

/**
Ideal data layout per face:
32bit: position + palette index + side
x: 7bits
y: 7bits
z: 7bits
palette index: 8bits
side: 3bits

Current per vertex
32bitx3: position
32bitx3: normal
32bitx4: colour

Total per face: 40 bytes
*/

// TODO: update this to use instancing
pub fn create_mesh_from_voxels(_: &VxmAsset) -> Mesh {
    let indices = Vec::new();

    // for voxel in &voxels.voxels {
    //     for _ in 0..6 {
    //         &indices.push(indices.len() as u32); // Increment index
    //     }
    // }

    let bytes = indices.len() * 4;
    let kb = bytes as f64 / 1024.0;
    let mb = kb / 1024.0;

    if mb > 0.5 {
        info!("Memory usage {:?}mb", format!("{:.1}", mb));
    } else {
        info!("Memory usage {:?}kb", format!("{:.1}", kb));
    }

    info!("index count / 6 {:?}", indices.len() / 6);

    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, vec![[0.0, 0.0, 0.0]])
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, vec![[0.0, 0.0, 0.0]])
    .with_inserted_indices(Indices::U32(indices))
}

fn generate_instance_data_z(vxm: &VxmAsset, is_front_face: bool) -> Vec<InstanceData> {
    (0..vxm.size[2] as usize)
        .into_par_iter()
        .flat_map(|z| {
            let mut slice_instance_data =
                Vec::with_capacity(vxm.size[0] as usize * vxm.size[1] as usize / 4); // Estimate 25% of slice will have visible faces
            let mut visited_voxels = vec![vec![false; vxm.size[1] as usize]; vxm.size[0] as usize];

            for x in 0..vxm.size[0] as usize {
                for y in 0..vxm.size[1] as usize {
                    if visited_voxels[x][y] {
                        continue;
                    }

                    // Check if face is hidden (different logic for front vs back)
                    let is_face_hidden = if is_front_face {
                        z < (vxm.size[2] - 1) as usize && vxm.voxel_array[x][y][z + 1] != -1
                    } else {
                        z > 0 && vxm.voxel_array[x][y][z - 1] != -1
                    };

                    if is_face_hidden {
                        continue;
                    }

                    let palette_index = vxm.voxel_array[x][y][z];
                    if palette_index == -1 {
                        continue;
                    }

                    let color = &vxm.palette[palette_index as usize];
                    let mut x_extent = 1u8;
                    let mut y_extent = 1u8;
                    let max_extent_y = vxm.size[1] as usize - y;
                    let max_extent_x = vxm.size[0] as usize - x;

                    // Create a closure for checking voxels
                    let check_voxel = |x: usize, y: usize| {
                        let is_face_hidden = if is_front_face {
                            z < (vxm.size[2] - 1) as usize && vxm.voxel_array[x][y][z + 1] != -1
                        } else {
                            z > 0 && vxm.voxel_array[x][y][z - 1] != -1
                        };

                        vxm.voxel_array[x][y][z] == -1
                            || vxm.voxel_array[x][y][z] != palette_index
                            || visited_voxels[x][y]
                            || is_face_hidden
                    };

                    let mut is_x_extendable = true;
                    let mut is_y_extendable = true;

                    while (is_x_extendable || is_y_extendable)
                        && ((x_extent as usize) < max_extent_x)
                        && ((y_extent as usize) < max_extent_y)
                    {
                        is_x_extendable = !(0..y_extent as usize)
                            .any(|dy| check_voxel(x + x_extent as usize, y + dy));
                        if is_x_extendable {
                            x_extent += 1;
                        }

                        is_y_extendable = !(0..x_extent as usize)
                            .any(|dx| check_voxel(x + dx, y + y_extent as usize));
                        if is_y_extendable {
                            y_extent += 1;
                        }
                    }

                    for dx in 0..x_extent as usize {
                        let row = &mut visited_voxels[x + dx];
                        row[y..y + y_extent as usize].fill(true);
                    }

                    slice_instance_data.push(InstanceData {
                        position: [x as u8, y as u8, z as u8],
                        width: x_extent,
                        height: y_extent,
                        color: [color.r, color.g, color.b],
                    });
                }
            }
            slice_instance_data
        })
        .collect()
}

fn generate_instance_data_x(vxm: &VxmAsset, is_right_face: bool) -> Vec<InstanceData> {
    (0..vxm.size[0] as usize)
        .into_par_iter()
        .flat_map(|x| {
            let mut slice_instance_data =
                Vec::with_capacity(vxm.size[2] as usize * vxm.size[1] as usize / 4); // Estimate 25% of slice will have visible faces
            let mut visited_voxels = vec![vec![false; vxm.size[1] as usize]; vxm.size[2] as usize];

            for z in 0..vxm.size[2] as usize {
                for y in 0..vxm.size[1] as usize {
                    if visited_voxels[z][y] {
                        continue;
                    }

                    // Check if face is hidden (different logic for front vs back)
                    let is_face_hidden = if is_right_face {
                        x < (vxm.size[0] - 1) as usize && vxm.voxel_array[x + 1][y][z] != -1
                    } else {
                        x > 0 && vxm.voxel_array[x - 1][y][z] != -1
                    };

                    if is_face_hidden {
                        continue;
                    }

                    let palette_index = vxm.voxel_array[x][y][z];
                    if palette_index == -1 {
                        continue;
                    }

                    let color = &vxm.palette[palette_index as usize];
                    let mut z_extent = 1u8;
                    let mut y_extent = 1u8;
                    let max_extent_y = vxm.size[1] as usize - y;
                    let max_extent_z = vxm.size[2] as usize - z;

                    // Create a closure for checking voxels
                    let check_voxel = |z: usize, y: usize| {
                        let is_face_hidden = if is_right_face {
                            x < (vxm.size[0] - 1) as usize && vxm.voxel_array[x + 1][y][z] != -1
                        } else {
                            x > 0 && vxm.voxel_array[x - 1][y][z] != -1
                        };

                        vxm.voxel_array[x][y][z] == -1
                            || vxm.voxel_array[x][y][z] != palette_index
                            || visited_voxels[z][y]
                            || is_face_hidden
                    };

                    let mut is_z_extendable = true;
                    let mut is_y_extendable = true;

                    while (is_z_extendable || is_y_extendable)
                        && ((z_extent as usize) < max_extent_z)
                        && ((y_extent as usize) < max_extent_y)
                    {
                        is_z_extendable = !(0..y_extent as usize)
                            .any(|dy| check_voxel(z + z_extent as usize, y + dy));
                        if is_z_extendable {
                            z_extent += 1;
                        }

                        is_y_extendable = !(0..z_extent as usize)
                            .any(|dz| check_voxel(z + dz, y + y_extent as usize));
                        if is_y_extendable {
                            y_extent += 1;
                        }
                    }

                    for dz in 0..z_extent as usize {
                        let row = &mut visited_voxels[z + dz];
                        row[y..y + y_extent as usize].fill(true);
                    }

                    slice_instance_data.push(InstanceData {
                        position: [x as u8, y as u8, z as u8],
                        width: z_extent,
                        height: y_extent,
                        color: [color.r, color.g, color.b],
                    });
                }
            }
            slice_instance_data
        })
        .collect()
}

fn generate_instance_data_y(vxm: &VxmAsset, is_top_face: bool) -> Vec<InstanceData> {
    (0..vxm.size[0] as usize)
        .into_par_iter()
        .flat_map(|y| {
            let mut slice_instance_data =
                Vec::with_capacity(vxm.size[2] as usize * vxm.size[0] as usize / 4); // Estimate 25% of slice will have visible faces
            let mut visited_voxels = vec![vec![false; vxm.size[0] as usize]; vxm.size[2] as usize];

            for x in 0..vxm.size[0] as usize {
                for z in 0..vxm.size[2] as usize {
                    if visited_voxels[x][y] {
                        continue;
                    }

                    // Check if face is hidden (different logic for front vs back)
                    let is_face_hidden = if is_top_face {
                        y < (vxm.size[1] - 1) as usize && vxm.voxel_array[x][y + 1][z] != -1
                    } else {
                        y > 0 && vxm.voxel_array[x][y - 1][z] != -1
                    };

                    if is_face_hidden {
                        continue;
                    }

                    let palette_index = vxm.voxel_array[x][y][z];
                    if palette_index == -1 {
                        continue;
                    }

                    let color = &vxm.palette[palette_index as usize];
                    let mut x_extent = 1u8;
                    let mut y_extent = 1u8;
                    let max_extent_y = vxm.size[1] as usize - y;
                    let max_extent_x = vxm.size[0] as usize - x;

                    // Create a closure for checking voxels
                    let check_voxel = |x: usize, y: usize| {
                        let is_face_hidden = if is_top_face {
                            y < (vxm.size[1] - 1) as usize && vxm.voxel_array[x][y + 1][z] != -1
                        } else {
                            y > 0 && vxm.voxel_array[x][y - 1][z] != -1
                        };

                        vxm.voxel_array[x][y][z] == -1
                            || vxm.voxel_array[x][y][z] != palette_index
                            || visited_voxels[x][y]
                            || is_face_hidden
                    };

                    let mut is_x_extendable = true;
                    let mut is_y_extendable = true;

                    while (is_x_extendable || is_y_extendable)
                        && ((x_extent as usize) < max_extent_x)
                        && ((y_extent as usize) < max_extent_y)
                    {
                        is_x_extendable = !(0..y_extent as usize)
                            .any(|dy| check_voxel(x + x_extent as usize, y + dy));
                        if is_x_extendable {
                            x_extent += 1;
                        }

                        is_y_extendable = !(0..x_extent as usize)
                            .any(|dz| check_voxel(z + dz, y + y_extent as usize));
                        if is_y_extendable {
                            y_extent += 1;
                        }
                    }

                    for dx in 0..x_extent as usize {
                        let row = &mut visited_voxels[x + dx];
                        row[y..y + y_extent as usize].fill(true);
                    }

                    slice_instance_data.push(InstanceData {
                        position: [x as u8, y as u8, z as u8],
                        width: x_extent,
                        height: y_extent,
                        color: [color.r, color.g, color.b],
                    });
                }
            }
            slice_instance_data
        })
        .collect()
}

pub fn create_mesh_on_vxm_import_system(
    pending_vxms: Query<(Entity, &PendingVxm, &Transform)>,
    vxm_assets: ResMut<Assets<VxmAsset>>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
) {
    for (entity, pending_vxm, transform) in pending_vxms.iter() {
        match vxm_assets.get(&pending_vxm.0) {
            Some(vxm) => {
                let start_time = std::time::Instant::now();

                let (
                    (left_instance_data, right_instance_data),
                    (front_instance_data, back_instance_data),
                ) = rayon::join(
                    || {
                        rayon::join(
                            || generate_instance_data_x(vxm, false),
                            || generate_instance_data_x(vxm, true),
                        )
                    },
                    || {
                        rayon::join(
                            || generate_instance_data_z(vxm, true),
                            || generate_instance_data_z(vxm, false),
                        )
                    },
                );

                let (top_instance_data, bottom_instance_data) = rayon::join(
                    || generate_instance_data_y(vxm, true),
                    || generate_instance_data_y(vxm, false),
                );

                let front_quad = meshes.add(
                    Mesh::new(
                        PrimitiveTopology::TriangleStrip,
                        RenderAssetUsages::RENDER_WORLD,
                    )
                    .with_inserted_indices(Indices::U16(vec![0, 1, 2, 3]))
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_POSITION,
                        get_cube_face_vertex_positions(CubeFace::Front),
                    )
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_NORMAL,
                        get_cube_face_normals(CubeFace::Front),
                    ),
                );

                let back_quad = meshes.add(
                    Mesh::new(
                        PrimitiveTopology::TriangleStrip,
                        RenderAssetUsages::RENDER_WORLD,
                    )
                    .with_inserted_indices(Indices::U16(vec![0, 1, 2, 3]))
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_POSITION,
                        get_cube_face_vertex_positions(CubeFace::Back),
                    )
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_NORMAL,
                        get_cube_face_normals(CubeFace::Back),
                    ),
                );

                let top_quad = meshes.add(
                    Mesh::new(
                        PrimitiveTopology::TriangleStrip,
                        RenderAssetUsages::RENDER_WORLD,
                    )
                    .with_inserted_indices(Indices::U16(vec![0, 1, 2, 3])) // Reverse the winding order
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_POSITION,
                        get_cube_face_vertex_positions(CubeFace::Top),
                    )
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_NORMAL,
                        get_cube_face_normals(CubeFace::Top), // Use Bottom normals to reverse direction
                    ),
                );

                let bottom_quad = meshes.add(
                    Mesh::new(
                        PrimitiveTopology::TriangleStrip,
                        RenderAssetUsages::RENDER_WORLD,
                    )
                    .with_inserted_indices(Indices::U16(vec![0, 1, 2, 3])) // Reverse the winding order
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_POSITION,
                        get_cube_face_vertex_positions(CubeFace::Bottom),
                    )
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_NORMAL,
                        get_cube_face_normals(CubeFace::Bottom), // Use Bottom normals to reverse direction
                    ),
                );

                let left_quad = meshes.add(
                    Mesh::new(
                        PrimitiveTopology::TriangleStrip,
                        RenderAssetUsages::RENDER_WORLD,
                    )
                    .with_inserted_indices(Indices::U16(vec![0, 1, 2, 3]))
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_POSITION,
                        get_cube_face_vertex_positions(CubeFace::Left),
                    )
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_NORMAL,
                        get_cube_face_normals(CubeFace::Left),
                    ),
                );

                let right_quad = meshes.add(
                    Mesh::new(
                        PrimitiveTopology::TriangleStrip,
                        RenderAssetUsages::RENDER_WORLD,
                    )
                    .with_inserted_indices(Indices::U16(vec![0, 1, 2, 3])) // Reverse the winding order
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_POSITION,
                        get_cube_face_vertex_positions(CubeFace::Right),
                    )
                    .with_inserted_attribute(
                        Mesh::ATTRIBUTE_NORMAL,
                        get_cube_face_normals(CubeFace::Right), // Use Right normals to reverse direction
                    ),
                );

                let end_time = start_time.elapsed();
                info!(
                    "{:?} size model created {:?} instances using {:?}kb in {:?}ms",
                    vxm.size,
                    front_instance_data.len(),
                    (size_of::<InstanceData>() * front_instance_data.len()) / 1024,
                    end_time.as_micros() as f32 / 1000.0
                );

                commands.entity(entity).remove::<PendingVxm>();
                commands
                    .entity(entity)
                    .insert((
                        InheritedVisibility::default(),
                        Aabb::from_min_max(
                            Vec3::ZERO,
                            Vec3::new(vxm.size[0] as f32, vxm.size[1] as f32, vxm.size[2] as f32),
                        ),
                    ))
                    .with_child((
                        Mesh3d(front_quad),
                        InstanceMaterialData(Arc::new(front_instance_data.clone())),
                    ))
                    .with_child((
                        Mesh3d(back_quad),
                        InstanceMaterialData(Arc::new(back_instance_data.clone())),
                    ))
                    .with_child((
                        Mesh3d(right_quad),
                        InstanceMaterialData(Arc::new(right_instance_data.clone())),
                    ))
                    .with_child((
                        Mesh3d(left_quad),
                        InstanceMaterialData(Arc::new(left_instance_data.clone())),
                    ))
                    .with_child((
                        Mesh3d(top_quad),
                        InstanceMaterialData(Arc::new(top_instance_data.clone())),
                    ))
                    .with_child((
                        Mesh3d(bottom_quad),
                        InstanceMaterialData(Arc::new(bottom_instance_data.clone())),
                    ));
            }
            None => {}
        }
    }
}

/// This example uses a shader source file from the assets subdirectory
const SHADER_ASSET_PATH: &str = "shaders/custom_material.wgsl";

#[derive(Asset, AsBindGroup, Reflect, Debug, Clone)]
pub struct MyExtension {
    // We need to ensure that the bindings of the base material and the extension do not conflict,
    // so we start from binding slot 100, leaving slots 0-99 for the base material.
    #[storage(100, read_only)]
    pub faces: Handle<ShaderStorageBuffer>,
}

impl MaterialExtension for MyExtension {
    fn deferred_vertex_shader() -> ShaderRef {
        SHADER_ASSET_PATH.into()
    }

    fn deferred_fragment_shader() -> ShaderRef {
        SHADER_ASSET_PATH.into()
    }
}

pub struct VxmMeshPlugin;

impl Plugin for VxmMeshPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(MaterialPlugin::<
            ExtendedMaterial<StandardMaterial, MyExtension>,
        >::default());
    }
}
