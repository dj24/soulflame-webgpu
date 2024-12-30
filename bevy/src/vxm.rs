use std::convert::TryInto;
use std::error::Error;
use std::fs::File;
use std::io::{BufReader, Read, Seek};
use std::simd::{u32x4, Simd};
use bevy::app::{App, Plugin, Update};
use bevy::log::info;
use bevy::prelude::{EventReader, FileDragAndDrop};
use bevy::prelude::*;
use bevy::{
    asset::{io::Reader, AssetLoader, LoadContext},
    prelude::*,
    reflect::TypePath,
    pbr::wireframe::{NoWireframe, Wireframe, WireframeColor, WireframeConfig, WireframePlugin},
};
use bevy::asset::RenderAssetUsages;
use bevy::render::mesh::{Indices, PrimitiveTopology};
use thiserror::Error;

#[derive(Asset, TypePath, Debug)]
pub struct VxmAsset {
    vox_count: usize,
    size: [u32; 3],
    voxels: Vec<Voxel>,
    palette: Vec<PaletteColor>,
}

#[derive(Default)]
pub struct VxmAssetLoader;

/// Possible errors that can be produced by [`VxmAssetLoader`]
#[non_exhaustive]
#[derive(Debug, Error)]
pub enum VxmAssetLoaderError {
    /// An [IO](std::io) Error
    #[error("Could not load asset: {0}")]
    Io(#[from] std::io::Error),
    /// A FromUtf8Error
    #[error("Could not convert bytes to string: {0}")]
    FromUtf8Error(#[from] std::string::FromUtf8Error),
    /// A FromVxmError
    #[error("Could not convert bytes to voxels")]
    FromVxmError,
}
impl AssetLoader for VxmAssetLoader {
    type Asset = VxmAsset;
    type Settings = ();
    type Error = VxmAssetLoaderError;
    async fn load(
        &self,
        reader: &mut dyn Reader,
        _settings: &(),
        _load_context: &mut LoadContext<'_>,
    ) -> Result<Self::Asset, Self::Error> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).await?;

        let mut reader = CustomByteReader::new(bytes);

        let mut start_time = std::time::Instant::now();
        // Read magic
        let magic = String::from_utf8(vec![reader.read_u8(), reader.read_u8(), reader.read_u8(), reader.read_u8()])?;

        if !["VXMC", "VXMA"].contains(&magic.as_str()) {
            return Err(VxmAssetLoaderError::FromVxmError);
        }

        let version = match magic.chars().nth(3).unwrap() {
            '0'..='9' => magic.chars().nth(3).unwrap() as u8 - b'0',
            'A'..='C' => 10 + magic.chars().nth(3).unwrap() as u8 - b'A',
            _ => return Err(VxmAssetLoaderError::FromVxmError),
        };

        if !(11..=12).contains(&version) {
            return Err(VxmAssetLoaderError::FromVxmError);
        }

        let mut scale = [&reader.read_u32(), &reader.read_u32(), &reader.read_u32()];
        let mut normalised_pivot = [reader.read_f32(), reader.read_f32(), reader.read_f32()];

        let surface = reader.read_u8();
        if surface > 0 {
            reader.seek_relative(28); // Skip surface data
            let skip_width = reader.read_u32();
            let skip_height = reader.read_u32();
            reader.seek_relative((skip_width * skip_height * 4) as usize);
        }

        if version >= 8 {
            reader.seek_relative(16); // Skip LOD scale and pivot data
        }

        let lod_levels = reader.read_u32();
        for _ in 0..lod_levels {
            let texture_dim_x = reader.read_u32();
            let texture_dim_y = reader.read_u32();
            if texture_dim_x > 2048 || texture_dim_y > 2048 {
                return Err(VxmAssetLoaderError::FromVxmError);
            }
            let size = reader.read_u32();
            reader.seek_relative(size as usize);

            for _ in 0..6 {
                let quad_amount = reader.read_u32();
                let size_of_quad_vertex = 20;
                let bytes_to_skip = quad_amount * size_of_quad_vertex * 4;
                reader.seek_relative(bytes_to_skip as usize);
            }
        }

        reader.seek_relative(256 * 4); // pallet data rgba
        reader.seek_relative(256 * 4); // pallet data rgba emissive
        let chunk_amount = reader.read_u8();
        for _ in 0..chunk_amount {
            reader.seek_relative(1024); // chunk id
            reader.read_u8(); // chunk offset
            reader.read_u8(); // chunk length
        }

        let material_amount = reader.read_u8();

        start_time = std::time::Instant::now();
        let mut palette = Vec::new();
        for _ in 0..material_amount {
            let blue = reader.read_u8();
            let green = reader.read_u8();
            let red = reader.read_u8();
            let alpha = reader.read_u8();
            let emissive = reader.read_u8();
            palette.push(PaletteColor { r: red, g: green, b: blue, a: alpha });
        }

        let max_layers = if version >= 12 { reader.read_u8() } else { 1 };
        let mut bounds_min = [u32::MAX, u32::MAX, u32::MAX];
        let mut bounds_max = [0, 0, 0];
        let mut voxels = Vec::new();

        start_time = std::time::Instant::now();
        for _ in 0..max_layers {
            let mut idx = 0;
            let mut layer_name = String::new();
            if version >= 12 {
                loop {
                    let byte = reader.read_u8();
                    if byte == 0x00 {
                        break;
                    }
                    layer_name.push(byte as char);
                }
                reader.read_u8(); // Layer visibility
            }

            let mut foo = 0;
            loop {
                foo += 1;
                let length = reader.read_u8();

                if length == 0 {
                    break;
                }

                let mat_idx = reader.read_u8();
                if mat_idx == 0xff {
                    idx += length as usize;
                    continue;
                }

                for i in idx..(idx + length as usize) {
                    let x = i as u32 / (scale[1] * scale[2]);
                    let y = (i as u32 / scale[2]) % scale[1];
                    let z = i as u32 % scale[2];
                    bounds_min[0] = bounds_min[0].min(x);
                    bounds_min[1] = bounds_min[1].min(y);
                    bounds_min[2] = bounds_min[2].min(z);

                    bounds_max[0] = bounds_max[0].max(x);
                    bounds_max[1] = bounds_max[1].max(y);
                    bounds_max[2] = bounds_max[2].max(z);
                    voxels.push(Voxel { x, y, z, c: mat_idx });
                }
                idx += length as usize;
            }
        }

        start_time = std::time::Instant::now();
        voxels.iter_mut().for_each(|voxel| {
            voxel.x -= bounds_min[0];
            voxel.y -= bounds_min[1];
            voxel.z -= bounds_min[2];
        });

        let size = [
            bounds_max[0] - bounds_min[0] + 1,
            bounds_max[1] - bounds_min[1] + 1,
            bounds_max[2] - bounds_min[2] + 1,
        ];

        Ok(VxmAsset {
            vox_count: voxels.len(),
            size,
            voxels,
            palette,
        })
    }

    fn extensions(&self) -> &[&str] {
        &["vxm"]
    }
}

#[derive(Debug)]
struct Voxel {
    x: u32,
    y: u32,
    z: u32,
    c: u8,
}

#[derive(Debug)]
struct PaletteColor {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
}

struct CustomByteReader {
    bytes: Vec<u8>,
    index: usize,
}

impl CustomByteReader {
    fn new(bytes: Vec<u8>) -> Self {
        CustomByteReader { bytes, index: 0 }
    }

    fn read_u8(&mut self) -> u8 {
        let byte = self.bytes[self.index as usize];
        self.index += 1;
        byte
    }

    fn read_u32(&mut self) -> u32 {
        let bytes: [u8; 4] = self.bytes[self.index..self.index + 4].try_into().unwrap();
        self.index += 4;
        u32::from_le_bytes(bytes)
    }


    fn read_f32(&mut self) -> f32 {
        let bytes: [u8; 4] = self.bytes[self.index..self.index + 4].try_into().unwrap();
        self.index += 4;
        f32::from_le_bytes(bytes)
    }

    fn seek_relative(&mut self, amount: usize) {
        self.index += amount;
    }
}


fn file_drag_and_drop_system(
    mut events: EventReader<FileDragAndDrop>,
    mut commands: Commands,
    ass: Res<AssetServer>
) {
    for event in events.read() {
        if let FileDragAndDrop::DroppedFile { window, path_buf } = event {
            let file_path = path_buf.to_str().unwrap().to_string();
            if file_path.ends_with(".vxm") {
                let voxels: Handle<VxmAsset> = ass.load(&file_path);
                commands.spawn(
                    VoxelObject(voxels),
                );
            }
        }
    }
}

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

fn create_mesh_from_voxels(voxels: &VxmAsset) -> Mesh {
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
                vertex[0] + voxel.x as f32,
                vertex[1] + voxel.y as f32,
                vertex[2] + voxel.z as f32,
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
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::default())
    // Add 4 vertices, each with its own position attribute (coordinate in
    // 3D space), for each of the corners of the parallelogram.
    .with_inserted_attribute(
        Mesh::ATTRIBUTE_POSITION,
        positions
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_indices(Indices::U32(indices))
    .with_inserted_attribute(Mesh::ATTRIBUTE_COLOR, colours)
}

#[derive(Component)]
struct VoxelObject(Handle<VxmAsset>);

fn print_voxel_count_on_load_system(
    vxm_assets: Res<Assets<VxmAsset>>,
    mut events: EventReader<AssetEvent<VxmAsset>>,
    ass: Res<AssetServer>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Log voxel count to debug for now
    for event in events.read() {
        match event {
            AssetEvent::LoadedWithDependencies { id } => {
                match vxm_assets.get(*id) {
                    Some(vxm_asset) => {
                        info!("Loaded vxm containing {:?} voxels", vxm_asset.vox_count);
                        commands.spawn((
                            Mesh3d(meshes.add(create_mesh_from_voxels(&vxm_asset))),
                            MeshMaterial3d(materials.add(Color::srgb(1., 1., 1.))),
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

pub struct VxmImportPlugin;

impl Plugin for VxmImportPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(WireframePlugin);
        app.add_systems(Update, file_drag_and_drop_system);
        app.add_systems(Update, print_voxel_count_on_load_system);
    }
}