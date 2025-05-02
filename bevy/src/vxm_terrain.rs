//EAAAAABAGQATAMP1KD8NAAQAAAAAACBACQAAZmYmPwAAAAA/AQQAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArkdhPg==

use crate::camera::CameraTarget;
use crate::dnd::PendingVxm;
use crate::vxm::{PaletteColor, VxmAsset};
use bevy::app::{App, FixedUpdate, Plugin};
use bevy::asset::Assets;
use bevy::core::Name;
use bevy::math::Vec3;
use bevy::prelude::{Commands, ResMut, Resource, Transform};
use fastnoise2::{generator::prelude::*, SafeNode};

#[derive(Resource)]
pub struct ChunkQueue(Vec<(i32, i32, i32)>);

// TODO: fix
impl Default for ChunkQueue {
    fn default() -> Self {
        let mut queue = vec![];
        for x in -8..9 {
            for z in -8..9 {
                queue.push((x, 0, z));
            }
        }
        Self(queue)
    }
}
const TERRAIN_SIZE: i32 = 32;

const SCALE_FACTOR: i32 = 512;

fn create_node() -> GeneratorWrapper<SafeNode> {
    (opensimplex2().fbm(0.65, 0.5, 4, 2.5).domain_scale(0.66)).build()
}

pub fn create_vxm_from_noise(x_pos: i32, y_pos: i32, z_pos: i32) -> VxmAsset {
    let start_time = std::time::Instant::now();

    let (x_size, y_size, z_size) = (TERRAIN_SIZE, 255, TERRAIN_SIZE);
    let node = create_node();

    let mut noise_out = vec![0.0; (x_size * z_size) as usize];

    let palette = vec![PaletteColor {
        r: 255,
        g: 0,
        b: 0,
        a: 0,
    }];
    let mut voxel_array =
        vec![vec![vec![-1i16; z_size as usize]; y_size as usize]; x_size as usize];

    for x in 0..x_size {
        for z in 0..z_size {
            let i = (x * z_size + z) as usize;
            let offset_x = x + x_pos * x_size;
            let offset_z = z + z_pos * z_size;
            let value = node.gen_single_2d(
                (offset_x as f32 / SCALE_FACTOR as f32),
                (offset_z as f32 / SCALE_FACTOR as f32),
                1337,
            );
            noise_out[i] = value;
        }
    }

    for x in 0..x_size {
        for y in 0..y_size {
            for z in 0..z_size {
                let i = (x * z_size + z) as usize;
                let value = noise_out[i];
                let normalized_value = (value * 0.5) + 0.5;
                let normalized_y = y as f32 / y_size as f32;
                if normalized_value > normalized_y {
                    voxel_array[x as usize][y as usize][z as usize] = 0;
                }
            }
        }
    }

    println!("Terrain creation took {:?}", start_time.elapsed());

    VxmAsset {
        vox_count: 1,
        size: [x_size as u8, y_size as u8, z_size as u8],
        palette,
        voxel_array,
    }
}

fn terrain_system(
    mut commands: Commands,
    mut chunk_queue: ResMut<ChunkQueue>,
    mut vxm_assets: ResMut<Assets<VxmAsset>>,
) {
    if chunk_queue.0.len() == 0 {
        return;
    }
    let (x_pos, y_pos, z_pos) = chunk_queue.0.pop().unwrap();
    let vxm = create_vxm_from_noise(x_pos, y_pos, z_pos);
    let vxm_handle = vxm_assets.add(vxm);
    if x_pos == 0 && z_pos == 0 {
        commands.spawn((
            Name::new(format!("Terrain {} {}", x_pos, z_pos)),
            PendingVxm(vxm_handle),
            Transform::from_translation(Vec3::new(
                (TERRAIN_SIZE * x_pos) as f32,
                0.0,
                (TERRAIN_SIZE * z_pos) as f32,
            )),
            CameraTarget(Vec3::new(
                TERRAIN_SIZE as f32 * 0.5,
                255. * 0.5,
                TERRAIN_SIZE as f32 * 0.5,
            )),
        ));
    } else {
        commands.spawn((
            Name::new(format!("Terrain {} {}", x_pos, z_pos)),
            PendingVxm(vxm_handle),
            Transform::from_translation(Vec3::new(
                (TERRAIN_SIZE * x_pos) as f32,
                0.0,
                (TERRAIN_SIZE * z_pos) as f32,
            )),
        ));
    }
}

pub struct VoxelTerrainPlugin;

impl Plugin for VoxelTerrainPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ChunkQueue>();
        app.add_systems(FixedUpdate, terrain_system);
    }
}
