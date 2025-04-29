//EAAAAABAGQATAMP1KD8NAAQAAAAAACBACQAAZmYmPwAAAAA/AQQAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArkdhPg==

use crate::camera::CameraTarget;
use crate::dnd::PendingVxm;
use crate::vxm::{PaletteColor, VxmAsset};
use bevy::app::{App, FixedUpdate, Plugin};
use bevy::asset::Assets;
use bevy::core::Name;
use bevy::math::Vec3;
use bevy::prelude::{Commands, ResMut, Resource, Transform};
use fastnoise2::SafeNode;

#[derive(Resource)]
pub struct ChunkQueue(Vec<(i32, i32, i32)>);

// TODO: fix
impl Default for ChunkQueue {
    fn default() -> Self {
        let mut queue = vec![];
        for x in -4..5 {
            for z in -4..5 {
                queue.push((x, 0, z));
            }
        }
        Self(queue)
    }
}
const TERRAIN_SIZE: i32 = 32;

pub fn create_vxm_from_noise(x_pos: i32, y_pos: i32, z_pos: i32) -> VxmAsset {
    let start_time = std::time::Instant::now();

    let (x_size, y_size, z_size) = (TERRAIN_SIZE, 255, TERRAIN_SIZE);
    let encoded_node_tree = "EAAAAABAGQATAMP1KD8NAAQAAAAAACBACQAAZmYmPwAAAAA/AQQAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArkdhPg==";
    let node = SafeNode::from_encoded_node_tree(encoded_node_tree).unwrap();

    // Allocate a buffer of enough size to hold all output data.
    let mut noise_out = vec![0.0; (x_size * y_size * z_size) as usize];

    node.gen_uniform_grid_3d(
        &mut noise_out,
        x_pos * x_size,                // x offset
        (y_pos * y_size) - y_size / 2, // y offset
        z_pos * z_size,
        x_size,
        y_size,
        z_size,
        0.005, // frequency
        1337, // seed
    );

    let palette = vec![PaletteColor {
        r: 255,
        g: 0,
        b: 0,
        a: 0,
    }];
    let mut voxel_array =
        vec![vec![vec![-1i16; z_size as usize]; y_size as usize]; x_size as usize];

    noise_out.iter().enumerate().for_each(|(i, value)| {
        let x = i as u32 / (y_size as u32 * z_size as u32);
        // let z = scale[1] - ((i as u32 / scale[2]) % scale[1]);
        // let y = i as u32 % scale[2];
        let y = y_size as u32 - ((i as u32 / z_size as u32) % y_size as u32) - 1;
        let z = i as u32 % z_size as u32;

        if *value > 0.0 {
            voxel_array[x as usize][y as usize][z as usize] = 0;
        }
    });

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
