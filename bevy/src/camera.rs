use bevy::input::mouse::AccumulatedMouseMotion;
use bevy::input::ButtonInput;
use bevy::math::Vec3;
use bevy::prelude::*;
use std::f32::consts::FRAC_PI_2;
use std::ops::Range;

#[derive(Component)]
pub struct CameraTarget(pub Vec3);

impl Default for CameraTarget {
    fn default() -> Self {
        Self(Vec3::ZERO)
    }
}

#[derive(Debug, Resource)]
struct CameraSettings {
    orbit_distance: f32,
    pitch_speed: f32,
    pitch_range: Range<f32>,
    yaw_speed: f32,
}

impl Default for CameraSettings {
    fn default() -> Self {
        // Limiting pitch stops some unexpected rotation past 90° up or down.
        let pitch_limit = FRAC_PI_2 - 0.01;
        Self {
            orbit_distance: 8.0,
            pitch_speed: 0.003,
            pitch_range: -pitch_limit..pitch_limit,
            yaw_speed: 0.003,
        }
    }
}

pub struct ThirdPersonCameraPlugin;

impl Plugin for ThirdPersonCameraPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<CameraSettings>()
            .add_systems(Startup, setup)
            .add_systems(Update, orbit);
    }
}

fn setup(commands: Commands) {
    // commands.spawn((Transform::default(), CameraTarget::default()));
}


fn orbit(
    mut camera_transform: Single<&mut Transform, (With<Camera>, Without<CameraTarget>)>,
    target_transform: Option<Single<&mut Transform, With<CameraTarget>>>,
    camera_target: Option<Single<&CameraTarget>>,
    camera_settings: Res<CameraSettings>,
    mouse_motion: Res<AccumulatedMouseMotion>,
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
) {

    if target_transform.is_none() || camera_target.is_none() {
        return;
    }

    let camera_target_offset = camera_target.unwrap().0;

    let target_position = target_transform.unwrap().translation + camera_target_offset;
    // Look rotation
    let mouse_delta = mouse_motion.delta;
    let delta_pitch = mouse_delta.y * camera_settings.pitch_speed;
    let delta_yaw = mouse_delta.x * camera_settings.yaw_speed;

    let direction = (camera_transform.translation - target_position).normalize();
    let current_pitch = direction.y.asin();
    let current_yaw = direction.z.atan2(direction.x);

    let new_pitch = (current_pitch + delta_pitch)
        .min(camera_settings.pitch_range.end)
        .max(camera_settings.pitch_range.start);
    let new_yaw = current_yaw + delta_yaw;

    // Offset based on new pitch and yaw, and orbit distance
    let new_position = target_position
        + Vec3::new(
            camera_settings.orbit_distance * new_pitch.cos() * new_yaw.cos(),
            camera_settings.orbit_distance * new_pitch.sin(),
            camera_settings.orbit_distance * new_pitch.cos() * new_yaw.sin(),
        );

    // Move target
    // if keys.pressed(KeyCode::KeyW) {
    //     let target_rotation = Quat::from_rotation_y(-new_yaw - FRAC_PI_2);
    //     let position_delta = direction * time.delta_secs();
    //     target.translation -= position_delta;
    //     target.rotation = Quat::slerp(target.rotation, target_rotation, 40.0 * time.delta_secs());
    // }
    // if keys.pressed(KeyCode::KeyS) {
    //     let target_rotation = Quat::from_rotation_y(-new_yaw + FRAC_PI_2);
    //     let position_delta = direction * time.delta_secs();
    //     target.translation += position_delta;
    //     target.rotation = Quat::slerp(target.rotation, target_rotation, 40.0 * time.delta_secs());
    // }
    // if keys.pressed(KeyCode::KeyA) {
    //     let target_rotation = Quat::from_rotation_y(-new_yaw);
    //     let position_delta = direction.cross(Vec3::Y) * time.delta_secs();
    //     target.translation -= position_delta;
    //     target.rotation = Quat::slerp(target.rotation, target_rotation, 40.0 * time.delta_secs());
    // }
    // if keys.pressed(KeyCode::KeyD) {
    //     let target_rotation = Quat::from_rotation_y(-new_yaw + std::f32::consts::PI);
    //     let position_delta = direction.cross(Vec3::Y) * time.delta_secs();
    //     target.translation -= position_delta;
    //     target.rotation = Quat::slerp(target.rotation, target_rotation, 40.0 * time.delta_secs());
    // }

    camera_transform.translation = new_position;
    camera_transform.look_at(target_position, Vec3::Y);
}
