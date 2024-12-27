

use std::convert::TryInto;
use std::error::Error;
use std::fs::File;
use std::io::{BufReader, Read, Seek};
use std::simd::{u32x4, Simd};
use bevy::app::{App, Plugin, Update};
use bevy::log::info;
use bevy::prelude::{EventReader, FileDragAndDrop};
use bevy::prelude::*;

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

#[derive(Debug)]
struct Voxels {
    vox_count: usize,
    size: [u32; 3],
    voxels: Vec<Voxel>,
    palette: Vec<PaletteColor>,
}

struct CustomByteReader {
    reader: BufReader<File>,
}

impl CustomByteReader {
    fn new(buf_reader: BufReader<File>) -> Self {
        CustomByteReader { reader: buf_reader }
    }

    fn read_u8(&mut self) -> u8 {
        let mut buffer = [0; 1];
        self.reader.read_exact(&mut buffer).unwrap();
        buffer[0]
    }

    fn read_u32(&mut self) -> u32 {
        let mut buffer = [0; 4];
        self.reader.read_exact(&mut buffer).unwrap();
        u32::from_le_bytes(buffer)
    }

    fn read_f32(&mut self) -> f32 {
        let mut buffer = [0; 4];
        self.reader.read_exact(&mut buffer).unwrap();
        f32::from_le_bytes(buffer)
    }

    fn seek_relative(&mut self, amount: usize) {
        self.reader.seek_relative(amount as i64).unwrap();
    }
}

fn convert_vxm(file_path: &String) -> Result<Voxels, Box<dyn Error>> {
    let mut start_time = std::time::Instant::now();
    let file = File::open(file_path)?;
    info!("Time taken to open file: {:?}", start_time.elapsed());

    let mut reader = CustomByteReader::new(BufReader::new(file));

    start_time = std::time::Instant::now();
    // Read magic
    let magic = String::from_utf8(vec![reader.read_u8(), reader.read_u8(), reader.read_u8(), reader.read_u8()])?;

    if !["VXMC", "VXMA"].contains(&magic.as_str()) {
        return Err(format!("Incorrect magic: {}", magic).into());
    }

    let version = match magic.chars().nth(3).unwrap() {
        '0'..='9' => magic.chars().nth(3).unwrap() as u8 - b'0',
        'A'..='C' => 10 + magic.chars().nth(3).unwrap() as u8 - b'A',
        _ => return Err("Unsupported version found".into()),
    };

    if !(11..=12).contains(&version) {
        return Err(format!("Unsupported version found ({})", version).into());
    }
    info!("Time taken to init: {:?}", start_time.elapsed());

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
            return Err("Size of texture exceeds the max allowed value".into());
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
    info!("Time taken to read palette: {:?}", start_time.elapsed());

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
    info!("Time taken to read voxels: {:?}", start_time.elapsed());

    start_time = std::time::Instant::now();
    voxels.iter_mut().for_each(|voxel| {
        voxel.x -= bounds_min[0];
        voxel.y -= bounds_min[1];
        voxel.z -= bounds_min[2];
    });
    info!("Time taken to adjust voxel positions: {:?}", start_time.elapsed());

    let size = [
        bounds_max[0] - bounds_min[0] + 1,
        bounds_max[1] - bounds_min[1] + 1,
        bounds_max[2] - bounds_min[2] + 1,
    ];

    Ok(Voxels {
        vox_count: voxels.len(),
        size,
        voxels,
        palette,
    })
}


fn file_drag_and_drop_system(
    mut events: EventReader<FileDragAndDrop>,
    mut commands: Commands,
    ass: Res<AssetServer>
) {
    // Log voxel count to debug for now
    for event in events.read() {
        if let FileDragAndDrop::DroppedFile { window, path_buf } = event {
            let file_path = path_buf.to_str().unwrap().to_string();
            if file_path.ends_with(".vxm") {
                let start_time = std::time::Instant::now();
                let voxels = convert_vxm(&file_path);
                match voxels {
                    Ok(voxels) => {
                        info!("Time taken: {:?}", start_time.elapsed());
                        info!("Voxel count: {}", voxels.vox_count);
                    }
                    Err(e) => {
                        info!("Error: {}", e);
                    }
                }
            }
            if file_path.ends_with(".glb") {
                let my_gltf = ass.load(file_path);

                // to position our 3d model, simply use the Transform
                // in the SceneBundle
                commands.spawn(SceneBundle {
                    scene: my_gltf,
                    transform: Transform::from_xyz(2.0, 0.0, -5.0),
                    ..Default::default()
                });
            }
        }
    }
}

pub struct VxmImportPlugin;

impl Plugin for VxmImportPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, file_drag_and_drop_system);
    }
}