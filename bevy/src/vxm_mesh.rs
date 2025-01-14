use bevy::asset::{AssetEvent, Assets, RenderAssetUsages};
use bevy::color::palettes::basic::{RED, WHITE};
use bevy::log::info;
use bevy::pbr::{ExtendedMaterial, MaterialExtension, MeshMaterial3d, OpaqueRendererMethod};
use bevy::prelude::*;
use bevy::render::mesh::{Indices, PrimitiveTopology};
use bevy::render::render_resource::{AsBindGroup, ShaderRef};
use crate::vxm::VxmAsset;

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

fn get_cube_vertex_indices() -> Vec<u32> {
    vec![
        // Front face
        0, 1, 2, 0, 2, 3,
        // Back face
        4, 6, 5, 4, 7, 6,
        // Top face
        8, 10, 9, 8, 11, 10,
        // Bottom face
        12, 13, 14, 12, 14, 15,
        // Left face
        16, 17, 18, 16, 18, 19,
        // Right face
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

pub fn create_mesh_from_voxels(voxels: &VxmAsset, flip_z_axis: bool) -> Mesh {
    let mut positions = Vec::new();
    let mut indices = Vec::new();
    let mut normals = Vec::new();
    let mut colours = Vec::new();
    let mut voxel_index = 0;
    let cube_vertex_indices = get_cube_vertex_indices();
    let cube_vertex_positions = get_cube_vertex_positions();
    let cube_normals = get_cube_normals();

    for voxel in &voxels.voxels {
        for vertex in &cube_vertex_positions {
            positions.push([
                vertex[0] + voxel.x as f32 - voxels.size[0] as f32 / 2.0,
                vertex[1] + voxel.y as f32 - voxels.size[1] as f32 / 2.0,
                vertex[2] + voxel.z as f32 - voxels.size[2] as f32 / 2.0,
            ]);
            colours.push([
                voxels.palette[voxel.c as usize].r as f32 / 255.0,
                voxels.palette[voxel.c as usize].g as f32 / 255.0,
                voxels.palette[voxel.c as usize].b as f32 / 255.0,
                voxels.palette[voxel.c as usize].a as f32 / 255.0,
            ]);
        }
        for normal in &cube_normals {
            normals.push(*normal);
        }
        for index in &cube_vertex_indices {
            indices.push(index + voxel_index * cube_vertex_positions.len() as u32);
        }
        voxel_index += 1;
    }

    let bytes = positions.len() * 3 * 4 + normals.len() * 3 * 4 + colours.len() * 4 + indices.len();
    let mb = indices.len() as f64 / 1024.0 / 1024.0;
    info!("Memory usgage {:?}", mb);


    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::default())
        .with_inserted_attribute(
            Mesh::ATTRIBUTE_POSITION,
            positions
        )
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
        .with_inserted_indices(Indices::U32(indices))
        .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colours)
}

pub fn create_mesh_on_vxm_import_system(
    vxm_assets: Res<Assets<VxmAsset>>,
    mut events: EventReader<AssetEvent<VxmAsset>>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ExtendedMaterial<StandardMaterial, MyExtension>>>,
) {
    // Log voxel count to debug for now
    for event in events.read() {
        match event {
            AssetEvent::LoadedWithDependencies { id } => {
                match vxm_assets.get(*id) {
                    Some(vxm_asset) => {
                        info!("Loaded vxm containing {:?} voxels", vxm_asset.vox_count);
                        commands.spawn((
                            Mesh3d(meshes.add(create_mesh_from_voxels(&vxm_asset, true))),
                            MeshMaterial3d(materials.add(ExtendedMaterial {
                                base: StandardMaterial {
                                    base_color: WHITE.into(),
                                    opaque_render_method: OpaqueRendererMethod::Auto,
                                    ..Default::default()
                                },
                                extension: MyExtension { color: LinearRgba::BLUE},
                            })),
                            Transform::from_scale(Vec3::new(0.03,0.03,0.03)),
                            // Wireframe
                        ));
                    }
                    _ => {}
                }
            }
            AssetEvent::Added { id } => {
                info!("Added {:?}", id);
            }
            AssetEvent::Unused { id } => {
                info!("Unused {:?}", id);
            }
            AssetEvent::Modified { id } => {
                info!("Modified {:?}", id);
            }
            AssetEvent::Removed { id } => {
                info!("Removed {:?}", id);
            }
        }
    }
}

/// This example uses a shader source file from the assets subdirectory
const SHADER_ASSET_PATH: &str = "shaders/custom_material.wgsl";

#[derive(Asset, AsBindGroup, Reflect, Debug, Clone)]
struct MyExtension {
    // We need to ensure that the bindings of the base material and the extension do not conflict,
    // so we start from binding slot 100, leaving slots 0-99 for the base material.
    #[uniform(100)]
    color: LinearRgba,
}

impl MaterialExtension for MyExtension {
    fn fragment_shader() -> ShaderRef {
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
        // app.add_systems(Update, create_mesh_on_vxm_import_system);
    }
}