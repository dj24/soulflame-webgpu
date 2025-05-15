mod camera;
mod color_conversion;
mod custom_shader_instancing;
mod dnd;
mod replace_body_part_meshes;
mod set_animation_clip_keyboard;
mod spawn_player;
mod vxm;
mod vxm_mesh;
mod vxm_terrain;
mod render;

use crate::camera::ThirdPersonCameraPlugin;
use crate::custom_shader_instancing::InstancedMaterialPlugin;
use crate::dnd::{PendingVxm};
use crate::replace_body_part_meshes::{
    add_vxm_swap_targets, create_vxm_swap_targets_on_gltf_import_system, swap_vxm_meshes,
};
use crate::vxm::{VxmAsset, VxmAssetLoader};
use crate::vxm_mesh::{create_mesh_on_vxm_import_system, VxmMeshPlugin};
use crate::vxm_terrain::VoxelTerrainPlugin;
use bevy::{
    pbr::{CascadeShadowConfigBuilder, DirectionalLightShadowMap},
    prelude::*,
};

use crate::spawn_player::spawn_player;
use bevy::color::palettes::css::{ORANGE_RED, WHITE};
use bevy::core_pipeline::bloom::Bloom;
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::pbr::{Atmosphere, AtmosphereSettings};
use bevy::prelude::light_consts::lux;
use bevy::render::camera::Exposure;
use std::f32::consts::*;
use crate::render::main::VoxelRenderPlugin;

fn exit_on_esc_system(keyboard_input: Res<ButtonInput<KeyCode>>, mut exit: EventWriter<AppExit>) {
    if keyboard_input.just_pressed(KeyCode::Escape) {
        exit.send(AppExit::Success);
    }
}

fn main() {
    App::new()
        .add_plugins(VoxelRenderPlugin)
        .add_plugins(DefaultPlugins)
        .add_systems(Update, exit_on_esc_system).run();
}

fn dynamic_scene(mut suns: Query<&mut Transform, With<DirectionalLight>>, time: Res<Time>) {
    suns.iter_mut()
        .for_each(|mut tf| tf.rotate_x(-time.delta_secs() * PI / 10.0));
}

/// set up a simple 3D scene
fn setup1(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    asset_server: Res<AssetServer>,
) {
    // circular base
    commands.spawn((
        Mesh3d(meshes.add(Circle::new(4.0))),
        MeshMaterial3d(materials.add(Color::WHITE)),
        Transform::from_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2)),
    ));

    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(1.0, 1.0, 1.0))),
        MeshMaterial3d(materials.add(Color::srgb(0.0, 1.0, 0.0))),
        Transform::from_xyz(1.0, 1.0, 0.0),
    ));

    commands.spawn((
        Name::new("Dragon 0,0"),
        PendingVxm(asset_server.load("dragon.vxm")),
        Transform::from_scale(Vec3::splat(0.03)).with_translation(Vec3::new(-5.0, 0.0, 0.0)),
    ));

    // light
    commands.spawn((
        PointLight {
            shadows_enabled: true,
            color: ORANGE_RED.into(),
            ..default()
        },
        Transform::from_xyz(4.0, 8.0, 4.0),
    ));
    // camera
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(-2.5, 4.5, 9.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    asset_server: Res<AssetServer>,
) {
    // Configure a properly scaled cascade shadow map for this scene (defaults are too large, mesh units are in km)
    let cascade_shadow_config = CascadeShadowConfigBuilder::default().build();

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
        Transform::from_xyz(1.0, -0.4, 0.0).looking_at(Vec3::new(0.25,-0.75,0.0), Vec3::Y),
        cascade_shadow_config,
    ));

    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 0.15, 0.0).looking_at(Vec3::NEG_Z, Vec3::Y),
        // Smaa {
        //     preset: SmaaPreset::Ultra,
        // },
        // ScreenSpaceAmbientOcclusion::default(),
        Camera {
            hdr: true,
            ..default()
        },
        Msaa::Off,
        Atmosphere::EARTH,
        AtmosphereSettings {
            aerial_view_lut_max_distance: 3.2e4,
            scene_units_to_m: 1.0,
            ..Default::default()
        },
        Exposure::SUNLIGHT,
        Tonemapping::AcesFitted,
        Bloom::NATURAL,
    ));


    // commands.spawn((
    //     Name::new("Dragon 0,0"),
    //     PendingVxm(asset_server.load("street-scene.vxm")),
    //     Transform::from_scale(Vec3::splat(4.0)).with_translation(Vec3::new(0.0, 100.0, 0.0)),
    // ));
}
