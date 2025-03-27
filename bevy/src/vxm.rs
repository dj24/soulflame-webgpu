use std::convert::TryInto;
use std::error::Error;
use std::fs::File;
use std::io::{BufReader, Read, Seek};
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
    pub vox_count: usize,
    pub size: [u8; 3],
    pub palette: Vec<PaletteColor>,
    pub voxel_array: Vec<Vec<Vec<i16>>>,
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
                    // let z = scale[1] - ((i as u32 / scale[2]) % scale[1]);
                    // let y = i as u32 % scale[2];
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

        let size = [
            (bounds_max[0] - bounds_min[0] + 1) as u8,
            (bounds_max[1] - bounds_min[1] + 1) as u8,
            (bounds_max[2] - bounds_min[2] + 1) as u8,
        ];

        let x_dim = size[0] as usize;
        let y_dim = size[1] as usize;
        let z_dim = size[2] as usize;

        let mut voxel_array = vec![vec![vec![-1i16; z_dim]; y_dim]; x_dim];

        voxels.iter_mut().for_each(|voxel| {
            voxel.x -= bounds_min[0];
            voxel.y -= bounds_min[1];
            voxel.z -= bounds_min[2];
            voxel_array[voxel.x as usize][voxel.y as usize][voxel.z as usize] = voxel.c as i16;
        });

        info!("imported vxm asset in {:?}ms", start_time.elapsed().as_millis());

        Ok(VxmAsset {
            vox_count: voxels.len(),
            size,
            palette,
            voxel_array
        })
    }

    fn extensions(&self) -> &[&str] {
        &["vxm"]
    }
}

#[derive(Debug)]
pub struct Voxel {
    pub x: u32,
    pub y: u32,
    pub z: u32,
    pub c: u8,
}

#[derive(Debug)]
pub struct PaletteColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
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