mod camera;
mod color_conversion;
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
use crate::vxm_mesh::{create_mesh_on_vxm_import_system, MeshedVoxels};
use crate::vxm_terrain::VoxelTerrainPlugin;
use bevy::color::palettes::css::WHITE;
use bevy::diagnostic::FrameCountPlugin;
use bevy::ecs::error::info;
use bevy::log::LogPlugin;
use bevy::prelude::light_consts::lux;
use bevy::prelude::*;
use bevy::render::camera::Camera;
use bevy::render::primitives::Frustum;
use bevy::render::view::{VisibilityPlugin, VisibilitySystems, VisibleEntities};
use bevy::state::app::StatesPlugin;
use bevy::time::TimePlugin;

fn exit_on_esc_system(keyboard_input: Res<ButtonInput<KeyCode>>, mut exit: EventWriter<AppExit>) {
    info!("Exit on ESC system");
    if keyboard_input.just_pressed(KeyCode::Escape) {
        exit.send(AppExit::Success);
    }
}

const SUN_DIRECTION: Vec3 = Vec3::new(-1.0, -1.0, -1.0);

fn position_sun_to_camera(
    camera_query: Query<&GlobalTransform, (With<Camera>, Without<DirectionalLight>)>,
    mut light_query: Query<&mut Transform, (With<DirectionalLight>, Without<Camera>)>,
) {
    if let Ok(camera_transform) = camera_query.get_single() {
        if let Ok(mut light_transform) = light_query.get_single_mut() {
            // Translate sun away from camera opposite to light direction
            let camera_position = camera_transform.translation();
            let light_position = camera_position - SUN_DIRECTION; // Move sun far away
            *light_transform =
                Transform::from_translation(light_position).looking_at(camera_position, Vec3::Y);
        }
    }
}

fn camera_oribit_target_over_time(
    time: Res<Time>,
    mut camera_query: Query<&mut Transform, With<Projection>>,
    target: Query<(&CameraTarget, &Transform), Without<Projection>>,
) {
    if target.is_empty() {
        info!("No target found for camera orbiting.");
        return;
    }
    let (target, target_transform) = target.single().unwrap();
    let mut camera_transform = camera_query.single_mut().unwrap();
    let camera_target_offset = target.0;
    let target_position = target_transform.translation + camera_target_offset;

    let t = time.elapsed_secs();
    let radius = 150.0;
    let angle = t * 0.4; // radians per second
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
            VoxelTerrainPlugin,
            VisibilityPlugin,
        ))
        .init_asset::<VxmAsset>()
        .init_asset_loader::<VxmAssetLoader>()
        .init_resource::<Assets<Mesh>>() // Used to allow frustum culling
        .add_systems(Startup, setup) // Add your setup function
        .add_systems(
            Update,
            (
                create_mesh_on_vxm_import_system,
                camera_oribit_target_over_time,
                position_sun_to_camera,
            ),
        )
        .run();
}

fn roll_sun_direction_to_match_camera(
    camera_query: Query<&GlobalTransform, (With<Camera>, Without<DirectionalLight>)>,
    mut light_query: Query<&mut Transform, (With<DirectionalLight>, Without<Camera>)>,
) {
    if let Ok(camera_transform) = camera_query.get_single() {
        if let Ok(mut light_transform) = light_query.get_single_mut() {
            let camera_up = camera_transform.forward();
            info!("Camera up: {:?}", camera_up);
            *light_transform = Transform::from_xyz(0.0, 0.0, 0.0)
                .looking_at(Vec3::new(-1.0, -1.0, -1.0), camera_up);
        }
    }
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
        Transform::from_xyz(0.0, 0.0, 0.0).looking_at(Vec3::new(-1.0, -1.0, -1.0), Vec3::Y),
    ));

    commands.spawn((
        Camera::default(),
        VisibleEntities::default(),
        Frustum::default(),
        Transform::from_xyz(32.0 / 2.0, 32.0 / 2.0, 200.0).looking_at(Vec3::NEG_Z, Vec3::Y),
        Projection::Perspective(PerspectiveProjection {
            fov: 50.0_f32.to_radians(),
            near: 0.1,
            far: 1000.0,
            aspect_ratio: 1.0,
        }),
        Visibility::Visible,
        InheritedVisibility::VISIBLE,
        ViewVisibility::HIDDEN,
    ));

    commands.spawn((
        Name::new("Street 0,0"),
        PendingVxm(asset_server.load("street-scene.vxm")),
        Transform::default().with_translation(Vec3::new(0.0, 160.0, 0.0)),
    ));

    commands.spawn((
        Name::new("Dragon 0,0"),
        PendingVxm(asset_server.load("dragon.vxm")),
        Transform::default()
            .with_scale(Vec3::new(1.0, 10.0, 1.0))
            .with_translation(Vec3::new(128.0, 160.0, 0.0)),
    ));

    commands.spawn((
        PointLight {
            color: Color::srgb(1.0, 0.0, 0.),
            range: 10.0,
            intensity: lux::LIVING_ROOM,
            ..default()
        },
        Transform::from_xyz(50.0, 190.0, 50.0),
    ));
    commands.spawn((
        PointLight {
            color: Color::srgb(0.0, 0.0, 1.0),
            range: 10.0,
            intensity: lux::LIVING_ROOM,
            ..default()
        },
        Transform::from_xyz(00.0, 190.0, 50.0),
    ));
    commands.spawn((
        PointLight {
            color: Color::srgb(0.0, 1.0, 0.0),
            range: 10.0,
            intensity: lux::LIVING_ROOM,
            ..default()
        },
        Transform::from_xyz(100.0, 190.0, 50.0),
    ));
}
