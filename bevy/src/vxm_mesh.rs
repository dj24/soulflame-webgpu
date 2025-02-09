use crate::instancing::setup_instancing;
use crate::vxm::{Voxel, VxmAsset};
use bevy::asset::{AssetEvent, Assets, RenderAssetUsages};
use bevy::color::palettes::basic::{PURPLE, RED, WHITE};
use bevy::log::info;
use bevy::pbr::{ExtendedMaterial, MaterialExtension, MeshMaterial3d, OpaqueRendererMethod};
use bevy::pbr::wireframe::WireframeConfig;
use bevy::prelude::*;
use bevy::render::mesh::{Indices, MeshVertexAttribute, PrimitiveTopology};
use bevy::render::render_resource::{AsBindGroup, ShaderRef, VertexFormat};
use crate::instancing::CustomMaterialPlugin;

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
            [0.0, 0.0, 1.0], // Bottom-left
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

fn get_cube_face_vertex_indices() -> Vec<u16> {
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

fn get_cube_vertex_indices() -> Vec<u16> {
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
    indices_in: &Vec<u16>,
    positions_out: &mut Vec<[f32; 3]>,
    normals_out: &mut Vec<[f32; 3]>,
    colors_out: &mut Vec<[f32; 4]>,
    indices_out: &mut Vec<u16>,
) {
    let base_index = positions_out.len() as u16;
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
    let mut positions = Vec::new();
    let mut indices = Vec::new();
    let mut normals = Vec::new();
    let mut colours = Vec::new();

    let cube_vertex_indices = get_cube_face_vertex_indices().repeat(6);

    let cube_vertex_positions_top = get_cube_face_vertex_positions(CubeFace::Top);
    let cube_normals_top = get_cube_face_normals(CubeFace::Top);

    let cube_vertex_positions_front = get_cube_face_vertex_positions(CubeFace::Front);
    let cube_normals_front = get_cube_face_normals(CubeFace::Front);

    let cube_vertex_positions_back = get_cube_face_vertex_positions(CubeFace::Back);
    let cube_normals_back = get_cube_face_normals(CubeFace::Back);

    let cube_vertex_positions_bottom = get_cube_face_vertex_positions(CubeFace::Bottom);
    let cube_normals_bottom = get_cube_face_normals(CubeFace::Bottom);

    let cube_vertex_positions_left = get_cube_face_vertex_positions(CubeFace::Left);
    let cube_normals_left = get_cube_face_normals(CubeFace::Left);

    let cube_vertex_positions_right = get_cube_face_vertex_positions(CubeFace::Right);
    let cube_normals_right = get_cube_face_normals(CubeFace::Right);

    for voxel in &voxels.voxels {
        // TODO: check face visibility
        let x = voxel.x as usize;
        let y = voxel.y as usize;
        let z = voxel.z as usize;

        //Top
        if y ==(voxels.size[1] - 1) as usize || voxels.voxel_array[x][y + 1][z] == -1 {
            add_face(
                voxels,
                voxel,
                &cube_vertex_positions_top,
                &cube_normals_top,
                &cube_vertex_indices,
                &mut positions,
                &mut normals,
                &mut colours,
                &mut indices,
            );
        }
        //Bottom
        if y == 0 || voxels.voxel_array[x][y - 1][z] == -1 {
            //Bottom
            add_face(
                voxels,
                voxel,
                &cube_vertex_positions_bottom,
                &cube_normals_bottom,
                &cube_vertex_indices,
                &mut positions,
                &mut normals,
                &mut colours,
                &mut indices,
            );
        }
        //Left
        if x == 0 || voxels.voxel_array[x - 1][y][z] == -1 {
            add_face(
                voxels,
                voxel,
                &cube_vertex_positions_left,
                &cube_normals_left,
                &cube_vertex_indices,
                &mut positions,
                &mut normals,
                &mut colours,
                &mut indices,
            );
        }
        //Right
        if x ==(voxels.size[0] - 1) as usize || voxels.voxel_array[x + 1][y][z] == -1 {

            add_face(
                voxels,
                voxel,
                &cube_vertex_positions_right,
                &cube_normals_right,
                &cube_vertex_indices,
                &mut positions,
                &mut normals,
                &mut colours,
                &mut indices,
            );
        }
        //Front
        if z ==(voxels.size[2] - 1) as usize || voxels.voxel_array[x][y][z + 1] == -1 {
            add_face(
                voxels,
                voxel,
                &cube_vertex_positions_front,
                &cube_normals_front,
                &cube_vertex_indices,
                &mut positions,
                &mut normals,
                &mut colours,
                &mut indices,
            );
        }
        //Back
        if z == 0 || voxels.voxel_array[x][y][z - 1] == -1 {
            add_face(
                voxels,
                voxel,
                &cube_vertex_positions_back,
                &cube_normals_back,
                &cube_vertex_indices,
                &mut positions,
                &mut normals,
                &mut colours,
                &mut indices,
            );
        }
    }

    let bytes =
        positions.len() * 3 * 4 + normals.len() * 3 * 4 + colours.len() * 4 * 4 + indices.len() * 2;
    let kb = bytes as f64 / 1024.0;
    let mb = kb / 1024.0;

    if mb > 0.5 {
        info!("Memory usage {:?}mb", format!("{:.1}", mb));
    } else {
        info!("Memory usage {:?}kb", format!("{:.1}", kb));
    }

    let custom_attribute = MeshVertexAttribute::new("Vertex_CustomAttribute", 123, VertexFormat::Uint8x4);
    let custom_items = vec![[123u8, 123u8, 123u8, 123u8]];

    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_indices(Indices::U16(indices))
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colours)
    // .with_inserted_attribute(custom_attribute, custom_items) // TODO: store position and colour in here
}

pub fn create_mesh_on_vxm_import_system(
    vxm_assets: Res<Assets<VxmAsset>>,
    mut events: EventReader<AssetEvent<VxmAsset>>,
) {
    // Log voxel count to debug for now
    for event in events.read() {
        match event {
            AssetEvent::LoadedWithDependencies { id } => match vxm_assets.get(*id) {
                Some(vxm_asset) => {
                    info!("Loaded vxm containing {:?} voxels", vxm_asset.vox_count);
                }
                _ => {}
            },
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
pub struct MyExtension {
    // We need to ensure that the bindings of the base material and the extension do not conflict,
    // so we start from binding slot 100, leaving slots 0-99 for the base material.
    #[uniform(100)]
    pub(crate) color: LinearRgba,
}

impl MaterialExtension for MyExtension {
    fn deferred_fragment_shader() -> ShaderRef {
        SHADER_ASSET_PATH.into()
    }
}

pub struct VxmMeshPlugin;

impl Plugin for VxmMeshPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(WireframeConfig {
            global: true,
            default_color: Color::from(PURPLE)
        });
        app.add_plugins(MaterialPlugin::<
            ExtendedMaterial<StandardMaterial, MyExtension>,
        >::default());
        // app.add_plugins(CustomMaterialPlugin);
        // app.add_systems(Startup, setup_instancing);
    }
}
