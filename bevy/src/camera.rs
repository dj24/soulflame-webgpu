use std::f32::consts::FRAC_PI_2;
use std::ops::Range;
use bevy::input::ButtonInput;
use bevy::input::mouse::AccumulatedMouseMotion;
use bevy::math::{Quat, Vec3};
use bevy::prelude::*;

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
            orbit_distance: 2.0,
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
            .add_systems(Update, orbit);
    }
}

fn orbit(
    mut camera: Single<&mut Transform,  (With<Camera>, Without<CameraTarget>)>,
    mut target: Single<&mut Transform, With<CameraTarget>>,
    camera_target: Single<&CameraTarget>,
    camera_settings: Res<CameraSettings>,
    mouse_motion: Res<AccumulatedMouseMotion>,
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
) {
    let camera_target_offset = camera_target.0;

    let target_position = target.translation + camera_target_offset;
    // Look rotation
    let mouse_delta = mouse_motion.delta;
    let delta_pitch = mouse_delta.y * camera_settings.pitch_speed;
    let delta_yaw = mouse_delta.x * camera_settings.yaw_speed;

    let direction = (camera.translation - target_position).normalize();
    let current_pitch = direction.y.asin();
    let current_yaw = direction.z.atan2(direction.x);

    let new_pitch = (current_pitch + delta_pitch).min(camera_settings.pitch_range.end).max(camera_settings.pitch_range.start);
    let new_yaw = current_yaw + delta_yaw;

    // Offset based on new pitch and yaw, and orbit distance
    let new_position = target_position + Vec3::new(
        camera_settings.orbit_distance * new_pitch.cos() * new_yaw.cos(),
        camera_settings.orbit_distance * new_pitch.sin(),
        camera_settings.orbit_distance * new_pitch.cos() * new_yaw.sin(),
    );

    // Move target
    let mut direction = Vec3::ZERO;
    if keys.pressed(KeyCode::KeyW) {
        direction -= Vec3::Z;
    }
    if keys.pressed(KeyCode::KeyS) {
        direction += Vec3::Z;
    }
    if keys.pressed(KeyCode::KeyA) {
        direction -= Vec3::X;
    }
    if keys.pressed(KeyCode::KeyD) {
        direction += Vec3::X;
    }
    if keys.pressed(KeyCode::Space) {
        direction += Vec3::Y;
    }
    if keys.pressed(KeyCode::ShiftLeft) {
        direction -= Vec3::Y;
    }
    // If moving,
    if direction.length() > 0.0 {
        direction = camera.rotation * direction.normalize();
        let position_delta = direction * 2.0 * time.delta_secs();
        target.translation = target_position + position_delta;
        target.rotation = Quat::slerp(target.rotation, Quat::from_rotation_y(-new_yaw), 4.0 * time.delta_secs());
    } else{

    }

    camera.translation = new_position;
    camera.look_at(target_position, Vec3::Y);
}