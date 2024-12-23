use bevy::{
    prelude::*,
    render::{
        extract_resource::{ExtractResource},
    },
};
use std::f32::consts::*;
use std::ops::Range;
use bevy::{
    core_pipeline::{
        prepass::{DeferredPrepass, DepthPrepass, MotionVectorPrepass},
        motion_blur::MotionBlur,
    },
    pbr::{
        CascadeShadowConfigBuilder, DefaultOpaqueRendererMethod, DirectionalLightShadowMap,
        NotShadowCaster, NotShadowReceiver, OpaqueRendererMethod,
    },
    prelude::*,
};
use bevy::input::keyboard::KeyboardInput;
use bevy::input::mouse::{AccumulatedMouseMotion};
use bevy::pbr::{FogVolume, VolumetricFog, VolumetricLight};

fn main() {
    App::new()
        .insert_resource(DefaultOpaqueRendererMethod::deferred())
        .insert_resource(DirectionalLightShadowMap { size: 4096 })
        .insert_resource(Pause(false))
        .init_resource::<CameraSettings>()
        .add_systems(Update, (orbit))
        .insert_resource(ClearColor(Color::srgb(0.0, 1.0, 0.0)))
        .add_plugins((
            DefaultPlugins
        ))
        .add_systems(Startup, (setup))
        .run();
}

fn setup(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut meshes: ResMut<Assets<Mesh>>,
) {
    commands.spawn((
        Camera3d::default(),
        MotionBlur {
            shutter_angle: 2.0,
            samples: 4,
        },
        Camera {
            // Deferred both supports both hdr: true and hdr: false
            hdr: true,
            ..default()
        },
        Transform::from_xyz(0.7, 0.7, 1.0).looking_at(Vec3::new(0.0, 0.3, 0.0), Vec3::Y),
        Msaa::Off,
        DistanceFog {
            color: Color::srgb_u8(43, 44, 47),
            falloff: FogFalloff::Linear {
                start: 1.0,
                end: 8.0,
            },
            ..default()
        },
        DepthPrepass,
        MotionVectorPrepass,
        DeferredPrepass,
    ))
        .insert(VolumetricFog {
            // This value is explicitly set to 0 since we have no environment map light
            ambient_intensity: 0.0,
            ..default()
        });

    commands.spawn((
        DirectionalLight {
            illuminance: 15_000.,
            shadows_enabled: true,
            ..default()
        },
        CascadeShadowConfigBuilder {
            num_cascades: 3,
            maximum_distance: 10.0,
            ..default()
        }
            .build(),
        Transform::from_rotation(Quat::from_euler(EulerRot::ZYX, 0.0, 0.0, -FRAC_PI_4)),
        VolumetricLight,
    ));

    // Add the fog volume.
    commands.spawn((
        FogVolume::default(),
        Transform::from_scale(Vec3::splat(35.0)),
    ));


    let mut forward_mat: StandardMaterial = Color::srgb(0.1, 0.2, 0.1).into();
    forward_mat.opaque_render_method = OpaqueRendererMethod::Forward;
    let forward_mat_h = materials.add(forward_mat);

    // Plane
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(50.0, 50.0))),
        MeshMaterial3d(forward_mat_h.clone()),
    ));

    let cube_h = meshes.add(Cuboid::new(0.1, 0.1, 0.1));
    let sphere_h = meshes.add(Sphere::new(0.125).mesh().uv(32, 18));

    // Cubes
    commands.spawn((
        Mesh3d(cube_h.clone()),
        MeshMaterial3d(forward_mat_h.clone()),
        Transform::from_xyz(-0.3, 0.5, -0.2),
        CameraTarget,
    ));
    commands.spawn((
        Mesh3d(cube_h),
        MeshMaterial3d(forward_mat_h),
        Transform::from_xyz(0.2, 0.5, 0.2),
    ));

    let sphere_color = Color::srgb(10.0, 4.0, 1.0);
    let sphere_pos = Transform::from_xyz(0.4, 0.5, -0.8);
    // Emissive sphere
    let mut unlit_mat: StandardMaterial = sphere_color.into();
    unlit_mat.unlit = true;
    commands.spawn((
        Mesh3d(sphere_h.clone()),
        MeshMaterial3d(materials.add(unlit_mat)),
        sphere_pos,
        NotShadowCaster,
    ));
    // Light
    commands.spawn((
        PointLight {
            intensity: 800.0,
            radius: 0.125,
            shadows_enabled: true,
            color: sphere_color,
            ..default()
        },
        sphere_pos,
        VolumetricLight,
    ));

    // Spheres
    for i in 0..6 {
        let j = i % 3;
        let s_val = if i < 3 { 0.0 } else { 0.2 };
        let material = if j == 0 {
            materials.add(StandardMaterial {
                base_color: Color::srgb(s_val, s_val, 1.0),
                perceptual_roughness: 0.089,
                metallic: 0.0,
                ..default()
            })
        } else if j == 1 {
            materials.add(StandardMaterial {
                base_color: Color::srgb(s_val, 1.0, s_val),
                perceptual_roughness: 0.089,
                metallic: 0.0,
                ..default()
            })
        } else {
            materials.add(StandardMaterial {
                base_color: Color::srgb(1.0, s_val, s_val),
                perceptual_roughness: 0.089,
                metallic: 0.0,
                ..default()
            })
        };
        commands.spawn((
            Mesh3d(sphere_h.clone()),
            MeshMaterial3d(material),
            Transform::from_xyz(
                j as f32 * 0.25 + if i < 3 { -0.15 } else { 0.15 } - 0.4,
                0.125,
                -j as f32 * 0.25 + if i < 3 { -0.15 } else { 0.15 } + 0.4,
            ),
        ));
    }

    // sky
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(2.0, 1.0, 1.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Srgba::hex("888888").unwrap().into(),
            unlit: true,
            cull_mode: None,
            ..default()
        })),
        Transform::from_scale(Vec3::splat(1_000_000.0)),
        NotShadowCaster,
        NotShadowReceiver,
    ));
}

#[derive(Resource)]
struct Pause(bool);


#[derive(Component)]
struct CameraTarget;

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


fn orbit(
    mut camera: Single<&mut Transform,  (With<Camera>, Without<CameraTarget>)>,
    mut target: Single<&mut Transform, With<CameraTarget>>,
    camera_settings: Res<CameraSettings>,
    mouse_motion: Res<AccumulatedMouseMotion>,
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
) {
    // Look rotation
    let mouse_delta = mouse_motion.delta;
    let delta_pitch = mouse_delta.y * camera_settings.pitch_speed;
    let delta_yaw = mouse_delta.x * camera_settings.yaw_speed;

    let direction = (camera.translation - target.translation).normalize();
    let current_pitch = direction.y.asin();
    let current_yaw = direction.z.atan2(direction.x);

    let new_pitch = (current_pitch + delta_pitch).min(camera_settings.pitch_range.end).max(camera_settings.pitch_range.start);
    let new_yaw = current_yaw + delta_yaw;

    // Offset based on new pitch and yaw, and orbit distance
    let new_position = target.translation + Vec3::new(
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
    if(direction.length() > 0.0) {
        direction = camera.rotation * direction.normalize();
        let positionDelta = direction * 2.0 * time.delta_secs();
        target.translation = target.translation + positionDelta;
        target.rotation = Quat::slerp(target.rotation, Quat::from_rotation_y(-new_yaw), 4.0 * time.delta_secs());
    } else{

    }

    camera.translation = new_position;
    camera.look_at(target.translation, Vec3::Y);
}