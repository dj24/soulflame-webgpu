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

fn get_cube_vertex_positions() -> Vec<[f32; 3]> {
    vec![
        // Front face
        [0.0, 0.0, 1.0], // Bottom-left
        [1.0, 0.0, 1.0], // Bottom-right
        [1.0, 1.0, 1.0], // Top-right
        [0.0, 1.0, 1.0], // Top-left
        // Back face
        [0.0, 0.0, 0.0], // Bottom-left
        [1.0, 0.0, 0.0], // Bottom-right
        [1.0, 1.0, 0.0], // Top-right
        [0.0, 1.0, 0.0], // Top-left
        // Top face
        [0.0, 1.0, 0.0], // Back-left
        [1.0, 1.0, 0.0], // Back-right
        [1.0, 1.0, 1.0], // Front-right
        [0.0, 1.0, 1.0], // Front-left
        // Bottom face
        [0.0, 0.0, 0.0], // Back-left
        [1.0, 0.0, 0.0], // Back-right
        [1.0, 0.0, 1.0], // Front-right
        [0.0, 0.0, 1.0], // Front-left
        // Left face
        [1.0, 0.0, 1.0], // Front-bottom
        [1.0, 0.0, 0.0], // Back-bottom
        [1.0, 1.0, 0.0], // Back-top
        [1.0, 1.0, 1.0], // Front-top
        // Right face
        [0.0, 0.0, 1.0], // Front-bottom
        [0.0, 0.0, 0.0], // Back-bottom
        [0.0, 1.0, 0.0], // Back-top
        [0.0, 1.0, 1.0], // Front-top
    ]
}

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
            [1.0, 1.0, 0.0], // Top-right
            [0.0, 1.0, 0.0], // Top-left
        ],
        CubeFace::Front => vec![
            [0.0, 0.0, 1.0], // Bottopub pub m-left
            [1.0, 0.0, 1.0], // Bottom-right
            [1.0, 1.0, 1.0], // Top-right
            [0.0, 1.0, 1.0], // Top-left
        ],
        CubeFace::Top => vec![
            [0.0, 1.0, 0.0], // Back-left
            [1.0, 1.0, 0.0], // Back-right
            [1.0, 1.0, 1.0], // Front-right
            [0.0, 1.0, 1.0], // Front-left
        ],
        CubeFace::Bottom => vec![
            [0.0, 0.0, 0.0], // Back-left
            [1.0, 0.0, 0.0], // Back-right
            [1.0, 0.0, 1.0], // Front-right
            [0.0, 0.0, 1.0], // Front-left
        ],
        CubeFace::Left => vec![
            [0.0, 0.0, 1.0], // Front-bottom
            [0.0, 0.0, 0.0], // Back-bottom
            [0.0, 1.0, 0.0], // Back-top
            [0.0, 1.0, 1.0], // Front-top
        ],
        CubeFace::Right => vec![
            [1.0, 0.0, 1.0], // Front-bottom
            [1.0, 0.0, 0.0], // Back-bottom
            [1.0, 1.0, 0.0], // Back-top
            [1.0, 1.0, 1.0], // Front-top
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

fn get_cube_vertex_indices() -> Vec<u32> {
    vec![
        // Front face
        0, 1, 2, 0, 2, 3, // Back face
        4, 6, 5, 4, 7, 6, // Top face
        8, 10, 9, 8, 11, 10, // Bottom face
        12, 13, 14, 12, 14, 15, // Left face
        16, 17, 18, 16, 18, 19, // Right face
        20, 22, 21, 20, 23, 22,
    ]
}

fn get_cube_normals() -> Vec<[f32; 3]> {
    vec![
        // Front face
        [0.0, 0.0, 1.0],
        [0.0, 0.0, 1.0],
        [0.0, 0.0, 1.0],
        [0.0, 0.0, 1.0],
        // Back face
        [0.0, 0.0, -1.0],
        [0.0, 0.0, -1.0],
        [0.0, 0.0, -1.0],
        [0.0, 0.0, -1.0],
        // Top face
        [0.0, 1.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 1.0, 0.0],
        // Bottom face
        [0.0, -1.0, 0.0],
        [0.0, -1.0, 0.0],
        [0.0, -1.0, 0.0],
        [0.0, -1.0, 0.0],
        // Left face
        [1.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        // Right face
        [-1.0, 0.0, 0.0],
        [-1.0, 0.0, 0.0],
        [-1.0, 0.0, 0.0],
        [-1.0, 0.0, 0.0],
    ]
}

fn add_face(
    voxels: &VxmAsset,
    voxel: &Voxel,
    positions_in: &Vec<[f32; 3]>,
    normals_in: &Vec<[f32; 3]>,
    indices_in: &Vec<u32>,
    positions_out: &mut Vec<[f32; 3]>,
    normals_out: &mut Vec<[f32; 3]>,
    colors_out: &mut Vec<[f32; 4]>,
    indices_out: &mut Vec<u32>,
) {
    let base_index = positions_out.len() as u32;
    for vertex in positions_in {
        positions_out.push([
            vertex[0] + voxel.x as f32 - voxels.size[0] as f32 / 2.0,
            vertex[1] + voxel.y as f32 - voxels.size[1] as f32 / 2.0,
            vertex[2] + voxel.z as f32 - voxels.size[2] as f32 / 2.0,
        ]);
        colors_out.push([
            voxels.palette[voxel.c as usize].r as f32 / 255.0,
            voxels.palette[voxel.c as usize].g as f32 / 255.0,
            voxels.palette[voxel.c as usize].b as f32 / 255.0,
            voxels.palette[voxel.c as usize].a as f32 / 255.0,
        ]);
    }
    for normal in normals_in {
        normals_out.push(*normal);
    }
    for index in indices_in {
        indices_out.push(index + base_index);
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
pub fn create_mesh_from_voxels(voxels: &VxmAsset) -> Mesh {
    let mut indices = Vec::new();

    for voxel in &voxels.voxels {
        for _ in 0..6 {
            &indices.push(indices.len() as u32); // Increment index
        }
    }

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
    mut vxm_assets: ResMut<Assets<VxmAsset>>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ExtendedMaterial<StandardMaterial, MyExtension>>>,
    mut buffers: ResMut<Assets<ShaderStorageBuffer>>,
) {
    for (entity, pending_vxm, transform) in pending_vxms.iter() {
        match vxm_assets.get(&pending_vxm.0) {
            Some(vxm) => {
                let mut instance_data: Vec<InstanceData> = vec![];

                for voxel in &vxm.voxels {
                    instance_data.push(InstanceData {
                        position: Vec3::new(voxel.x as f32, voxel.y as f32, voxel.z as f32),
                        scale: 1.0,
                        color: [
                            voxel.x as f32 / vxm.size[0] as f32,
                            voxel.y as f32 / vxm.size[1] as f32,
                            voxel.z as f32 / vxm.size[2] as f32,
                            1.0,
                        ],
                    });
                }

                info!(
                    "{:?} instances using {:?}kb",
                    instance_data.len(),
                    (size_of_val(&instance_data) * instance_data.len()) / 1024
                );

                commands.entity(entity).remove::<PendingVxm>();
                commands.spawn((
                    NoFrustumCulling,
                    Mesh3d(meshes.add(Cuboid::new(1.0, 1.0, 1.0))),
                    InstanceMaterialData(instance_data),
                    Transform::from_scale(Vec3::splat(1.0)),
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
