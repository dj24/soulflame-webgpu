use crate::custom_shader_instancing::{InstanceData, InstanceMaterialData};
use crate::vxm::{PendingVxm, VxmAsset};
use bevy::asset::{Assets, RenderAssetUsages};
use bevy::log::info;
use bevy::prelude::*;
use bevy::render::mesh::{Indices, PrimitiveTopology};
use bevy::render::primitives::Aabb;
use rayon::prelude::*;
use std::sync::Arc;
use crate::color_conversion::get_hsl_voxel;

enum CubeFace {
    Front,
    Back,
    Top,
    Bottom,
    Left,
    Right,
}

#[derive(Component)]
pub enum MeshedVoxelsFace {
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

pub fn create_mesh_from_voxels(_: &VxmAsset) -> Mesh {
    let indices = Vec::new();

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
                        z < (vxm.size[2] - 1) as usize
                            && is_solid_voxel(vxm.voxel_array[x][y][z + 1])
                    } else {
                        z > 0 && is_solid_voxel(vxm.voxel_array[x][y][z - 1])
                    };

                    if is_face_hidden {
                        continue;
                    }

                    let voxel = vxm.voxel_array[x][y][z];
                    if !is_solid_voxel(voxel) {
                        continue;
                    }

                    let mut x_extent = 1u8;
                    let mut y_extent = 1u8;
                    let max_extent_y = vxm.size[1] as usize - y;
                    let max_extent_x = vxm.size[0] as usize - x;

                    // Create a closure for checking voxels
                    let check_voxel = |x: usize, y: usize| {
                        let is_face_hidden = if is_front_face {
                            z < (vxm.size[2] - 1) as usize
                                && is_solid_voxel(vxm.voxel_array[x][y][z + 1])
                        } else {
                            z > 0 && is_solid_voxel(vxm.voxel_array[x][y][z - 1])
                        };

                        !is_solid_voxel(vxm.voxel_array[x][y][z])
                            || vxm.voxel_array[x][y][z] != voxel
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

                    let (r, g, b) = get_hsl_voxel(voxel);

                    slice_instance_data.push(InstanceData {
                        position: [x as u8, y as u8, z as u8],
                        width: x_extent,
                        height: y_extent,
                        color: [r as u8, g as u8, b as u8],
                    });
                }
            }
            slice_instance_data
        })
        .collect()
}

// Checks if 1st bit of 16 bit value is 1
fn is_solid_voxel(voxel: u16) -> bool {
    (voxel >> 15) & 0x01 == 1
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
                        x < (vxm.size[0] - 1) as usize
                            && is_solid_voxel(vxm.voxel_array[x + 1][y][z])
                    } else {
                        x > 0 && is_solid_voxel(vxm.voxel_array[x - 1][y][z])
                    };

                    if is_face_hidden {
                        continue;
                    }

                    let voxel = vxm.voxel_array[x][y][z];
                    if !is_solid_voxel(voxel) {
                        continue;
                    }

                    let mut z_extent = 1u8;
                    let mut y_extent = 1u8;
                    let max_extent_y = vxm.size[1] as usize - y;
                    let max_extent_z = vxm.size[2] as usize - z;

                    // Create a closure for checking voxels
                    let check_voxel = |z: usize, y: usize| {
                        let is_face_hidden = if is_right_face {
                            x < (vxm.size[0] - 1) as usize
                                && is_solid_voxel(vxm.voxel_array[x + 1][y][z])
                        } else {
                            x > 0 && is_solid_voxel(vxm.voxel_array[x - 1][y][z])
                        };

                        !is_solid_voxel(vxm.voxel_array[x][y][z])
                            || vxm.voxel_array[x][y][z] != voxel
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

                    let (r, g, b) = get_hsl_voxel(voxel);

                    slice_instance_data.push(InstanceData {
                        position: [x as u8, y as u8, z as u8],
                        width: y_extent,
                        height: z_extent,
                        color: [r as u8, g as u8, b as u8],
                    });
                }
            }
            slice_instance_data
        })
        .collect()
}

fn generate_instance_data_y(vxm: &VxmAsset, is_top_face: bool) -> Vec<InstanceData> {
    (0..vxm.size[1] as usize)
        .into_par_iter()
        .flat_map(|y| {
            let mut slice_instance_data =
                Vec::with_capacity(vxm.size[2] as usize * vxm.size[0] as usize / 4); // Estimate 25% of slice will have visible faces
            let mut visited_voxels = vec![vec![false; vxm.size[2] as usize]; vxm.size[0] as usize];

            for x in 0..vxm.size[0] as usize {
                for z in 0..vxm.size[2] as usize {
                    if visited_voxels[x][z] {
                        continue;
                    }

                    // Check if face is hidden (different logic for front vs back)
                    let is_face_hidden = if is_top_face {
                        y < (vxm.size[1] - 1) as usize
                            && is_solid_voxel(vxm.voxel_array[x][y + 1][z])
                    } else {
                        y > 0 && is_solid_voxel(vxm.voxel_array[x][y - 1][z])
                    };

                    if is_face_hidden {
                        continue;
                    }

                    let voxel = vxm.voxel_array[x][y][z];
                    if !is_solid_voxel(voxel) {
                        continue;
                    }

                    let mut x_extent = 1u8;
                    let mut z_extent = 1u8;
                    let max_extent_z = vxm.size[2] as usize - z;
                    let max_extent_x = vxm.size[0] as usize - x;

                    // Create a closure for checking voxels
                    let check_voxel = |x: usize, z: usize| {
                        let is_face_hidden = if is_top_face {
                            y < (vxm.size[1] - 1) as usize
                                && is_solid_voxel(vxm.voxel_array[x][y + 1][z])
                        } else {
                            y > 0 && is_solid_voxel(vxm.voxel_array[x][y - 1][z])
                        };

                        !is_solid_voxel(vxm.voxel_array[x][y][z])
                            || vxm.voxel_array[x][y][z] != voxel
                            || visited_voxels[x][z]
                            || is_face_hidden
                    };

                    let mut is_x_extendable = true;
                    let mut is_z_extendable = true;

                    while (is_x_extendable || is_z_extendable)
                        && ((x_extent as usize) < max_extent_x)
                        && ((z_extent as usize) < max_extent_z)
                    {
                        is_x_extendable = !(0..z_extent as usize)
                            .any(|dz| check_voxel(x + x_extent as usize, z + dz));
                        if is_x_extendable {
                            x_extent += 1;
                        }

                        is_z_extendable = !(0..x_extent as usize)
                            .any(|dx| check_voxel(x + dx, z + z_extent as usize));
                        if is_z_extendable {
                            z_extent += 1;
                        }
                    }

                    for dx in 0..x_extent as usize {
                        let row = &mut visited_voxels[x + dx];
                        row[z..z + z_extent as usize].fill(true);
                    }

                    let (r, g, b) = get_hsl_voxel(voxel);

                    slice_instance_data.push(InstanceData {
                        position: [x as u8, y as u8, z as u8],
                        width: x_extent,
                        height: z_extent,
                        color: [r as u8, g as u8, b as u8],
                    });
                }
            }
            slice_instance_data
        })
        .collect()
}

#[derive(Component)]
pub struct MeshedVoxels;

/// Removes PendingVxm to signify that the mesh has been created
pub fn create_mesh_on_vxm_import_system(
    pending_vxms: Query<(Entity, &PendingVxm, &Transform)>,
    vxm_assets: ResMut<Assets<VxmAsset>>,
    mut commands: Commands,
) {
    for (entity, pending_vxm, _) in pending_vxms.iter() {
        match vxm_assets.get(&pending_vxm.0) {
            Some(vxm) => {
                let start_time = std::time::Instant::now();

                let create_y_data = || {
                    rayon::join(
                        || generate_instance_data_z(vxm, true),
                        || generate_instance_data_z(vxm, false),
                    )
                };

                let create_x_data = || {
                    rayon::join(
                        || generate_instance_data_x(vxm, true),
                        || generate_instance_data_x(vxm, false),
                    )
                };

                let create_z_data = || {
                    rayon::join(
                        || generate_instance_data_y(vxm, true),
                        || generate_instance_data_y(vxm, false),
                    )
                };

                let ((x_data, z_data), y_data) =
                    rayon::join(|| rayon::join(create_x_data, create_z_data), create_y_data);

                let (front_instance_data, back_instance_data) = y_data;
                let (right_instance_data, left_instance_data) = x_data;
                let (top_instance_data, bottom_instance_data) = z_data;


                let instance_count = front_instance_data.len()
                    + back_instance_data.len()
                    + left_instance_data.len()
                    + right_instance_data.len()
                    + top_instance_data.len()
                    + bottom_instance_data.len();
                let end_time = start_time.elapsed();

                info!(
                    "{:?} size mesh created {:?} instances using {:?}kb in {:?}ms",
                    vxm.size,
                    instance_count,
                    (size_of::<InstanceData>() * instance_count) / 1024,
                    end_time.as_micros() as f32 / 1000.0
                );

                if instance_count == 0 {
                    info!("No instances created, skipping mesh creation");
                    return;
                }

                let aabb = Aabb::from_min_max(
                    Vec3::ZERO,
                    Vec3::new(vxm.size[0] as f32, vxm.size[1] as f32, vxm.size[2] as f32),
                );

                commands.entity(entity).remove::<PendingVxm>();
                commands
                    .entity(entity)
                    .insert((InheritedVisibility::default(), aabb,  MeshedVoxels))
                    .with_child((
                        Name::new("Front face instance data"),
                        MeshedVoxelsFace::Front,
                        InstanceMaterialData(Arc::new(front_instance_data.clone())),
                        aabb,
                        Transform::from_xyz(0.0,0.0,0.0)
                    ))
                    .with_child((
                        Name::new("Back face instance data"),
                        MeshedVoxelsFace::Back,
                        InstanceMaterialData(Arc::new(back_instance_data.clone())),
                        aabb,
                        Transform::from_xyz(0.0,0.0,0.0)
                    ))
                    .with_child((
                        Name::new("Right face instance data"),
                        MeshedVoxelsFace::Right,
                        InstanceMaterialData(Arc::new(right_instance_data.clone())),
                        aabb,
                        Transform::from_xyz(0.0,0.0,0.0)
                    ))
                    .with_child((
                        Name::new("Left face instance data"),
                        MeshedVoxelsFace::Left,
                        InstanceMaterialData(Arc::new(left_instance_data.clone())),
                        aabb,
                        Transform::from_xyz(0.0,0.0,0.0)
                    ))
                    .with_child((
                        Name::new("Top face instance data"),
                        MeshedVoxelsFace::Top,
                        InstanceMaterialData(Arc::new(top_instance_data.clone())),
                        aabb,
                        Transform::from_xyz(0.0,0.0,0.0)
                    ))
                    .with_child((
                        Name::new("Bottom face instance data"),
                        MeshedVoxelsFace::Bottom,
                        InstanceMaterialData(Arc::new(bottom_instance_data.clone())),
                        aabb,
                        Transform::from_xyz(0.0,0.0,0.0)
                    ));
            }
            None => {}
        }
    }
}