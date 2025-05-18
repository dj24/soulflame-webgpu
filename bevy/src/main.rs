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

use crate::dnd::PendingVxm;
use crate::render::main::VoxelRenderPlugin;
use crate::vxm::{VxmAsset, VxmAssetLoader};
use bevy::app::ScheduleRunnerPlugin;
use bevy::color::palettes::css::WHITE;
use bevy::ecs::error::info;
use bevy::input::InputPlugin;
use bevy::prelude::light_consts::lux;
use bevy::prelude::*;
use bevy::state::app::StatesPlugin;
use std::time::Duration;
use bevy::diagnostic::{FrameCount, FrameCountPlugin};
use bevy::log::LogPlugin;
use bevy::time::TimePlugin;

fn exit_on_esc_system(keyboard_input: Res<ButtonInput<KeyCode>>, mut exit: EventWriter<AppExit>) {
    info!("Exit on ESC system");
    if keyboard_input.just_pressed(KeyCode::Escape) {
        exit.send(AppExit::Success);
    }
}

fn my_runner(mut app: App) -> AppExit {
    info!("Setting up runner");
    app.finish();
    app.cleanup();
    loop {
        info_once!("In main loop");
        app.update();
        if let Some(exit) = app.should_exit() {
            return exit;
        }
    }
}

fn main() {
    App::new()
        .set_runner(my_runner)
        .add_plugins((
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
        .run();
}

fn setup(
    mut commands: Commands,
    asset_server: Res<AssetServer>
) {
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
        Camera3d::default(),
        Transform::from_xyz(0.0, 0.15, 0.0).looking_at(Vec3::NEG_Z, Vec3::Y),
        Camera {
            hdr: true,
            ..default()
        },
    ));

    commands.spawn((
        Name::new("Dragon 0,0"),
        PendingVxm(asset_server.load("street-scene.vxm")),
        Transform::from_scale(Vec3::splat(4.0)).with_translation(Vec3::new(0.0, 100.0, 0.0)),
    ));
}
