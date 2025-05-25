use crate::color_conversion::{
     create_hsl_voxel,
};
use crate::vxm::{PendingVxm, VxmAsset};
use bevy::app::{App, Update, Plugin};
use bevy::asset::Assets;
use bevy::math::Vec3;
use bevy::prelude::{Commands, Name, ResMut, Resource, Transform};
use fastnoise2::{generator::prelude::*, SafeNode};
use std::collections::VecDeque;

#[derive(Resource)]
pub struct ChunkQueue(VecDeque<(i32, i32, i32)>);

// TODO: fix
impl Default for ChunkQueue {
    fn default() -> Self {
        let mut queue = VecDeque::new();
        for r in 0..16 {
            for x in (-r)..(r + 1) {
                for z in (-r)..(r + 1) {
                    if !queue.contains(&(x, 0, z)) {
                        queue.push_back((x, 0, z));
                    }
                }
            }
        }
        Self(queue)
    }
}
const TERRAIN_SIZE: i32 = 64;

const SCALE_FACTOR: i32 = 2048;

fn create_node() -> GeneratorWrapper<SafeNode> {
    opensimplex2().fbm(0.65, 0.5, 6, 2.5).build()
}

fn lerp(from: f32, to: f32, t: f32) -> f32 {
    from + (to - from) * t
}

pub fn create_vxm_from_noise(x_pos: i32, y_pos: i32, z_pos: i32) -> VxmAsset {
    let start_time = std::time::Instant::now();

    let (x_size, y_size, z_size) = (TERRAIN_SIZE, 255, TERRAIN_SIZE);
    let node = create_node();
    let terrain_colour_node =
        SafeNode::from_encoded_node_tree("DwAEAAAAAAAAQAcAAAAAAD8AAAAAAA==").unwrap();

    let mut noise_out = vec![0.0; (x_size * z_size) as usize];

    let mut colour_noise_out = vec![0.0; (x_size * z_size) as usize];

    let mut voxel_array = vec![vec![vec![0u16; z_size as usize]; y_size as usize]; x_size as usize];

    for x in 0..x_size {
        for z in 0..z_size {
            let i = (x * z_size + z) as usize;
            let offset_x = x + x_pos * x_size;
            let offset_z = z + z_pos * z_size;
            noise_out[i] = node.gen_single_2d(
                (offset_x as f32 / SCALE_FACTOR as f32),
                (offset_z as f32 / SCALE_FACTOR as f32),
                1337,
            );
            colour_noise_out[i] = terrain_colour_node.gen_single_2d(
                offset_x as f32 / 4.0,
                offset_z as f32 / 4.0,
                1337,
            );
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
                    let colour_noise = (colour_noise_out[i] * 0.5) + 0.5;
                    let grass_r = 0.1 - colour_noise * (1.0 / 32.0);
                    let grass_g = 0.5 - colour_noise * (4.0 / 32.0);
                    let grass_b = 0.1 - colour_noise * (2.0 / 32.0);

                    let dirt_r = 0.3 - colour_noise * (1.0 / 32.0);
                    let dirt_g = 0.2 - colour_noise * (1.0 / 32.0);
                    let dirt_b = 0.1 - colour_noise * (1.0 / 32.0);

                    let stone_r = 0.2f32 - colour_noise * (1.0 / 32.0);
                    let stone_g = 0.2f32 - colour_noise * (1.0 / 32.0);
                    let stone_b = 0.2f32 - colour_noise * (1.0 / 32.0);

                    let sand_r = 0.9f32 - colour_noise * (4.0 / 32.0);
                    let sand_g = 0.8f32 - colour_noise * (6.0 / 32.0);
                    let sand_b = 0.5f32 - colour_noise * (3.0 / 32.0);

                    let snow_threshold = 0.75 - colour_noise * (2.0 / 32.0);
                    let sand_threshold = 0.4;
                    let water_threshold = 0.35;
                    let is_top_block = normalized_value < normalized_y + (1.0 / y_size as f32);

                    let is_snow = normalized_value > snow_threshold && is_top_block;
                    let is_sand = normalized_value < sand_threshold;
                    let is_stone = !is_top_block;
                    let is_water = normalized_value < water_threshold;

                    let snow = 0.9 - colour_noise * 0.1;

                    let t = normalized_y;

                    let (r, g, b) = match (is_snow, is_sand, is_water, is_stone) {
                        (true, _, _, _) => (snow, snow, snow),
                        (_, _, true, _) => (0.0, 0.05, 0.5),
                        (_, true, _, _) => (sand_r, sand_g, sand_b),
                        (_, _, _, true) => (stone_r, stone_g, stone_b),
                        _ => (
                            lerp(grass_r, dirt_r, t),
                            lerp(grass_g, dirt_g, t),
                            lerp(grass_b, dirt_b, t),
                        ),
                    };

                    voxel_array[x as usize][y as usize][z as usize] = create_hsl_voxel(r, g, b);
                }
            }
        }
    }

    println!("Terrain creation took {:?}", start_time.elapsed());

    VxmAsset {
        size: [x_size as u8, y_size as u8, z_size as u8],
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
    let (x_pos, y_pos, z_pos) = chunk_queue.0.pop_front().unwrap();
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
            // CameraTarget(Vec3::new(
            //     TERRAIN_SIZE as f32 * 0.5,
            //     255. * 0.5,
            //     TERRAIN_SIZE as f32 * 0.5,
            // )),
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
        app.add_systems(Update, terrain_system);
    }
}
