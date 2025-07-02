mod camera;
mod color_conversion;
mod dnd;
mod keyboard_events;
mod render;
mod replace_body_part_meshes;
mod set_animation_clip_keyboard;
mod spawn_player;
mod vxm;
mod vxm_mesh;
mod vxm_terrain;

use crate::camera::{CameraTarget, ThirdPersonCameraPlugin};
use crate::keyboard_events::{KeyboardEventsPlugin, KeyboardInput};
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
use winit::keyboard::{Key, NamedKey};

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
            let target_position =
                camera_transform.translation() + camera_transform.forward() * 50.0; // Move sun far away in the direction of the camera

            // Only move the sun if it is has moved far enough away from the camera
            if Vec2::distance(target_position.xz(), light_transform.translation.xz()) < 20.0 {
                return;
            }

            let light_position = target_position - SUN_DIRECTION; // Move sun far away
            *light_transform =
                Transform::from_translation(light_position).looking_at(target_position, Vec3::Y);
        }
    }
}

fn log_wasd_pressed(keyboard_input: Res<KeyboardInput>) {
    if keyboard_input
        .pressed_keys
        .contains(&Key::Character("a".into()))
    {
        info!("a key pressed");
    }
}

// Move camera based on WASD input
fn no_clip_camera(
    keyboard_input: Res<KeyboardInput>,
    mut camera_query: Query<&mut Transform, With<Camera>>,
    time: Res<Time>,
) {
    let rotation_speed = 2.0; // Speed of the camera rotation
    let speed = 100.0; // Speed of the camera movement

    match camera_query.single_mut() {
        Ok(mut camera_transform) => {
            let mut direction = Vec3::ZERO;
            if keyboard_input
                .pressed_keys
                .contains(&Key::Character("w".into()))
            {
                direction -= Vec3::Z; // Move forward
            }
            if keyboard_input
                .pressed_keys
                .contains(&Key::Character("s".into()))
            {
                direction += Vec3::Z; // Move backward
            }
            if keyboard_input
                .pressed_keys
                .contains(&Key::Character("a".into()))
            {
                direction -= Vec3::X; // Move left
            }
            if keyboard_input
                .pressed_keys
                .contains(&Key::Character("d".into()))
            {
                direction += Vec3::X; // Move right
            }
            if keyboard_input
                .pressed_keys
                .contains(&Key::Named(NamedKey::Space))
            {
                direction += Vec3::Y; // Move up
            }
            if keyboard_input
                .pressed_keys
                .contains(&Key::Named(NamedKey::Shift))
            {
                direction -= Vec3::Y; // Move up
            }
            if direction != Vec3::ZERO {
                let normalized_direction = direction.normalize();
                let local_delta = normalized_direction * speed * time.delta_secs();
                let world_delta = camera_transform.rotation * local_delta;
                camera_transform.translation += world_delta;
            }

            let mut rotation = Quat::IDENTITY;
            if keyboard_input
                .pressed_keys
                .contains(&Key::Character("e".into()))
            {
                rotation *= Quat::from_rotation_y(-time.delta_secs() * rotation_speed);
                // Rotate left
            }
            if keyboard_input
                .pressed_keys
                .contains(&Key::Character("q".into()))
            {
                rotation *= Quat::from_rotation_y(time.delta_secs() * rotation_speed);
                // Rotate right
            }
            if rotation != Quat::IDENTITY {
                camera_transform.rotation *= rotation;
            }
        }
        Err(_) => info!("No camera found"),
    }
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
            KeyboardEventsPlugin,
        ))
        .init_asset::<VxmAsset>()
        .init_asset_loader::<VxmAssetLoader>()
        .init_resource::<Assets<Mesh>>() // Used to allow frustum culling
        .add_systems(Startup, setup) // Add your setup function
        .add_systems(
            Update,
            (
                log_fps_every_second,
                create_mesh_on_vxm_import_system,
                position_sun_to_camera,
                squish_stretch_and_rotate_object_over_time,
                no_clip_camera,
            ),
        )
        .run();
}

#[derive(Component)]
struct SquishStretchAndRotateObjectOverTime {
    time: f32,
}

fn log_fps_every_second(time: Res<Time>, mut last_logged: Local<f32>) {
    if time.elapsed_secs() - *last_logged >= 1.0 {
        let fps = 1.0 / time.delta_secs();
        info!("FPS: {}", fps);
        *last_logged = time.elapsed_secs();
    }
}

fn squish_stretch_and_rotate_object_over_time(
    time: Res<Time>,
    mut query: Query<(&mut Transform, &mut SquishStretchAndRotateObjectOverTime)>,
) {
    for (mut transform, mut squish_stretch) in query.iter_mut() {
        squish_stretch.time += time.delta_secs();
        let t = squish_stretch.time;
        let scale = 1.0 + 0.5 * (t * 2.0).sin();
        transform.scale = Vec3::new(scale, scale, scale);
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
        Transform::from_xyz(0.0, 250.0, 0.0).looking_at(Vec3::new(-1.0, -1.0, -1.0), Vec3::Y),
    ));

    commands.spawn((
        Camera::default(),
        VisibleEntities::default(),
        Frustum::default(),
        Transform::from_xyz(0.0, 200.0, 0.0),
        Projection::Perspective(PerspectiveProjection {
            fov: 80.0_f32.to_radians(),
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
        // CameraTarget(Vec3::new(50.0, 30.0, 50.0)),
        PendingVxm(asset_server.load("street-scene.vxm")),
        Transform::default().with_translation(Vec3::new(0.0, 160.0, 0.0)),
    ));

    commands.spawn((
        Name::new("Dragon 0,0"),
        SquishStretchAndRotateObjectOverTime { time: 20.0 },
        PendingVxm(asset_server.load("dragon.vxm")),
        Transform::default()
            .with_scale(Vec3::new(1.0, 10.0, 1.0))
            .with_translation(Vec3::new(128.0, 160.0, 0.0)),
    ));
}
