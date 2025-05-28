mod camera;
mod color_conversion;
mod custom_shader_instancing;
mod dnd;
mod render;
mod replace_body_part_meshes;
mod set_animation_clip_keyboard;
mod spawn_player;
mod vxm;
mod vxm_mesh;
mod vxm_terrain;

use crate::camera::{CameraTarget, ThirdPersonCameraPlugin};
use crate::render::main::VoxelRenderPlugin;
use crate::vxm::{PendingVxm, VxmAsset, VxmAssetLoader};
use bevy::color::palettes::css::WHITE;
use bevy::diagnostic::FrameCountPlugin;
use bevy::ecs::error::info;
use bevy::log::LogPlugin;
use bevy::prelude::light_consts::lux;
use bevy::prelude::*;
use bevy::render::camera::CameraProjectionPlugin;
use bevy::state::app::StatesPlugin;
use bevy::time::TimePlugin;
use crate::vxm_mesh::{create_mesh_on_vxm_import_system, MeshedVoxels};

fn exit_on_esc_system(keyboard_input: Res<ButtonInput<KeyCode>>, mut exit: EventWriter<AppExit>) {
    info!("Exit on ESC system");
    if keyboard_input.just_pressed(KeyCode::Escape) {
        exit.send(AppExit::Success);
    }
}


fn camera_oribit_target_over_time(
    time: Res<Time>,
    mut camera_query: Query<&mut Transform, With<Projection>>,
    target: Query<(&CameraTarget, &Transform), Without<Projection>>,
) {
    let (target, target_transform) = target.single().unwrap();
    let mut camera_transform = camera_query.single_mut().unwrap();
    let camera_target_offset = target.0;
    let target_position = target_transform.translation + camera_target_offset;

    let t = time.elapsed_secs();
    let radius = 150.0;
    let angle = t * 0.5; // radians per second
    let x = radius * angle.cos();
    let z = radius * angle.sin();
    camera_transform.translation = target_position + Vec3::new(x, 0.0, z);
    camera_transform.look_at(target_position, Vec3::Y);
}


fn main() {
    App::new()
        .add_plugins((
            TransformPlugin,
            LogPlugin::default(),
            TimePlugin,
            FrameCountPlugin,
            TaskPoolPlugin::default(),
            StatesPlugin::default(),
            AssetPlugin::default(),
            VoxelRenderPlugin,
        ))
        .init_asset::<VxmAsset>()
        .init_asset_loader::<VxmAssetLoader>()
        .add_systems(Startup, setup) // Add your setup function
        .add_systems(Update, (create_mesh_on_vxm_import_system, camera_oribit_target_over_time))
        .run();
}


fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    // ambient light
    commands.insert_resource(AmbientLight {
        color: WHITE.into(),
        brightness: lux::CLEAR_SUNRISE,
        ..default()
    });

    // Sun
    commands.spawn((
        DirectionalLight {
            shadows_enabled: true,
            illuminance: lux::RAW_SUNLIGHT,
            ..default()
        },
        Transform::from_xyz(1.0, -0.4, 0.0).looking_at(Vec3::new(0.25, -0.75, 0.0), Vec3::Y),
    ));

    commands.spawn((
        Transform::from_xyz(126.0 / 2.0, 89.0 / 2.0, 200.0).looking_at(Vec3::NEG_Z, Vec3::Y),
        Projection::Perspective(PerspectiveProjection {
            fov: 60.0_f32.to_radians(),
            near: 0.1,
            far: 1000.0,
            aspect_ratio: 1.0,
        }),
    ));

    commands.spawn((
        Name::new("Dragon 0,0"),
        PendingVxm(asset_server.load("street-scene.vxm")),
        CameraTarget(Vec3::new(126.0 / 2.0, 89.0 / 2.0, 57.0 / 2.0)),
        Transform::default(),
    ));
}
