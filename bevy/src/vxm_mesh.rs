use crate::custom_shader_instancing::{InstanceData, InstanceMaterialData};
use crate::dnd::PendingVxm;
use crate::vxm::{Voxel, VxmAsset};
use bevy::asset::{AssetEvent, Assets, RenderAssetUsages};
use bevy::color::palettes::basic::{PURPLE, RED, WHITE};
use bevy::log::info;
use bevy::pbr::wireframe::WireframeConfig;
use bevy::pbr::{ExtendedMaterial, MaterialExtension, MeshMaterial3d, OpaqueRendererMethod};
use bevy::prelude::*;
use bevy::render::mesh::{Indices, MeshVertexAttribute, PrimitiveTopology};
use bevy::render::render_resource::{AsBindGroup, ShaderRef, VertexFormat};
use bevy::render::storage::ShaderStorageBuffer;
use bevy::render::view::NoFrustumCulling;

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
            [0.0, 0.0, 0.0], // Bottom-left
            [1.0, 0.0, 0.0], // Bottom-right
            [0.0, 1.0, 0.0], // Top-left
            [1.0, 1.0, 0.0], // Top-right
        ],
        CubeFace::Front => vec![
            [0.0, 0.0, 1.0], // Bottom-left
            [1.0, 0.0, 1.0], // Bottom-right
            [0.0, 1.0, 1.0], // Top-left
            [1.0, 1.0, 1.0], // Top-right
        ],
        CubeFace::Top => vec![
            [0.0, 1.0, 0.0], // Back-left
            [1.0, 1.0, 0.0], // Back-right
            [0.0, 1.0, 1.0], // Front-left
            [1.0, 1.0, 1.0], // Front-right
        ],
        CubeFace::Bottom => vec![
            [0.0, 0.0, 0.0], // Back-left
            [1.0, 0.0, 0.0], // Back-right
            [0.0, 0.0, 1.0], // Front-left
            [1.0, 0.0, 1.0], // Front-right
        ],
        CubeFace::Left => vec![
            [0.0, 0.0, 1.0], // Front-bottom
            [0.0, 0.0, 0.0], // Back-bottom
            [0.0, 1.0, 1.0], // Front-top
            [0.0, 1.0, 0.0], // Back-top
        ],
        CubeFace::Right => vec![
            [1.0, 0.0, 1.0], // Front-bottom
            [1.0, 0.0, 0.0], // Back-bottom
            [1.0, 1.0, 1.0], // Front-top
            [1.0, 1.0, 0.0], // Back-top
        ],
    }
}

fn get_cube_face_vertex_indices() -> Vec<u32> {
    vec![0, 1, 2, 0, 2, 3]
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
const FACE_CHECKS: [[i32; 3]; 6] = [
    [0, 0, 1],
    [0, 0, -1],
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
    [-1, 0, 0],
];

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
pub fn create_mesh_from_voxels(voxels: &VxmAsset) -> Mesh {
    let mut indices = Vec::new();

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
                let mut instance_data: Vec<InstanceData> = vec![];
                let palette = &vxm.palette;
                let mut visited_voxels = vec![vec![vec![false; vxm.size[2] as usize]; vxm.size[1] as usize]; vxm.size[0] as usize];

                // TODO: Greedy mesh in 2 dimensions
                for x in 0..vxm.size[0] as usize {
                    for y in 0..vxm.size[1] as usize {
                        for z in 0..vxm.size[2] as usize {
                            if visited_voxels[x][y][z] {
                                continue;
                            }
                            let palette_index = vxm.voxel_array[x][y][z];
                            visited_voxels[x][y][z] = true;
                            if palette_index == -1 {
                                continue;
                            }
                            let color = &palette[palette_index as usize];
                            let mut x_extent = 1u8;
                            for greedy_x in x..vxm.size[0] as usize {
                                let palette_index = vxm.voxel_array[greedy_x][y][z];
                                // TODO: add face checks here
                                if palette_index == -1 || palette_index != palette_index {
                                    break;
                                }
                                visited_voxels[greedy_x][y][z] = true;
                                x_extent += 1;
                            }
                            instance_data.push(InstanceData {
                                position: [x as u8, y as u8, z as u8],
                                x_extent,
                                y_extent: 1u8,
                                color: [color.r, color.g, color.b],
                            });
                        }
                    }
                }

                let quad = meshes.add(
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
                let end_time = start_time.elapsed();
                info!(
                    "{:?} size model created {:?} instances using {:?}kb in {:?}ms",
                    vxm.size,
                    instance_data.len(),
                    (size_of::<InstanceData>() * instance_data.len()) / 1024,
                    end_time.as_millis()
                );

                commands.entity(entity).remove::<PendingVxm>();
                commands.spawn((
                    NoFrustumCulling,
                    Mesh3d(quad),
                    InstanceMaterialData(instance_data),
                    Transform::from_scale(Vec3::splat(0.02)),
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
        app.insert_resource(WireframeConfig {
            global: true,
            default_color: Color::from(PURPLE),
        });
        app.add_plugins(MaterialPlugin::<
            ExtendedMaterial<StandardMaterial, MyExtension>,
        >::default());
    }
}
