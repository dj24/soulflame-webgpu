//EAAAAABAGQATAMP1KD8NAAQAAAAAACBACQAAZmYmPwAAAAA/AQQAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArkdhPg==

use crate::camera::CameraTarget;
use crate::dnd::PendingVxm;
use crate::vxm::{PaletteColor, VxmAsset};
use bevy::asset::Assets;
use bevy::core::Name;
use bevy::math::Vec3;
use bevy::prelude::{Commands, ResMut, Transform};
use fastnoise2::SafeNode;

pub fn create_vxm_from_noise(mut commands: Commands, mut vxm_assets: ResMut<Assets<VxmAsset>>) {
    let start_time = std::time::Instant::now();

    let (x_size, y_size, z_size) = (128, 128, 128);
    let encoded_node_tree = "EAAAAABAGQATAMP1KD8NAAQAAAAAACBACQAAZmYmPwAAAAA/AQQAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArkdhPg==";
    let node = SafeNode::from_encoded_node_tree(encoded_node_tree).unwrap();

    // Allocate a buffer of enough size to hold all output data.
    let mut noise_out = vec![0.0; (x_size * y_size * z_size) as usize];

    node.gen_uniform_grid_3d(
        &mut noise_out,
        0,   // x offset
        -64, // y offset
        0,
        x_size,
        y_size,
        z_size,
        0.01, // frequency
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

    let vxm = VxmAsset {
        vox_count: 1,
        size: [x_size as u8, y_size as u8, z_size as u8],
        palette,
        voxel_array,
    };

    let vxm_handle = vxm_assets.add(vxm);

    commands.spawn((
        Name::new("Terrain 0,0"),
        PendingVxm(vxm_handle),
        Transform::from_scale(Vec3::new(0.02, 0.02, 0.02)),
        CameraTarget(Vec3::new(
            128.0 * 0.5 * 0.02,
            128.0 * 0.5 * 0.02,
            128.0 * 0.5 * 0.02,
        )),
    ));

    println!("Terrain creation took {:?}", start_time.elapsed());
}
