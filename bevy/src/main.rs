mod camera;
mod custom_shader_instancing;
mod dnd;
mod draw_aabb_gizmos;
mod replace_body_part_meshes;
mod set_animation_clip_keyboard;
mod spawn_player;
mod vxm;
mod vxm_mesh;
mod vxm_terrain;
mod color_conversion;

use crate::camera::{ ThirdPersonCameraPlugin};
use crate::custom_shader_instancing::InstancedMaterialPlugin;
use crate::dnd::{file_drag_and_drop_system, PendingVxm};
use crate::draw_aabb_gizmos::DrawAabbGizmosPlugin;
use crate::replace_body_part_meshes::{
    add_vxm_swap_targets, create_vxm_swap_targets_on_gltf_import_system, swap_vxm_meshes,
};
use crate::vxm::{VxmAsset, VxmAssetLoader};
use crate::vxm_mesh::{create_mesh_on_vxm_import_system, VxmMeshPlugin};
use crate::vxm_terrain::VoxelTerrainPlugin;
use bevy::render::render_resource::{Face, WgpuFeatures};
use bevy::render::settings::{RenderCreation, WgpuSettings};
use bevy::render::RenderPlugin;
use bevy::window::{PresentMode, WindowResolution};
use bevy::{
    pbr::{
        CascadeShadowConfigBuilder, DirectionalLightShadowMap,
    },
    prelude::*,
};

use bevy::color::palettes::css::ORANGE_RED;
use bevy::prelude::light_consts::lux;
use std::f32::consts::*;
use crate::spawn_player::spawn_player;

fn exit_on_esc_system(keyboard_input: Res<ButtonInput<KeyCode>>, mut exit: EventWriter<AppExit>) {
    if keyboard_input.just_pressed(KeyCode::Escape) {
        exit.send(AppExit::Success);
    }
}

fn main() {
    App::new()
        .insert_resource(DirectionalLightShadowMap { size: 4096 })
        .add_plugins(bevy::diagnostic::FrameTimeDiagnosticsPlugin::default())
        .add_plugins(bevy::diagnostic::EntityCountDiagnosticsPlugin)
        .add_plugins(bevy::diagnostic::SystemInformationDiagnosticsPlugin)
        // .add_plugins(PerfUiPlugin)
        .add_plugins((
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Soulflame".to_string(),
                        resolution: WindowResolution::new(1920., 1080.),
                        focused: true,
                        present_mode: PresentMode::AutoVsync,
                        ..default()
                    }),
                    ..default()
                })
                .set(RenderPlugin {
                    render_creation: RenderCreation::Automatic(WgpuSettings {
                        // WARN this is a native only feature. It will not work with webgl or webgpu
                        features: WgpuFeatures::POLYGON_MODE_LINE,
                        ..default()
                    }),
                    ..default()
                }),
            ThirdPersonCameraPlugin,
            // TemporalAntiAliasPlugin,
            VxmMeshPlugin,
            // WorldInspectorPlugin,
            DrawAabbGizmosPlugin,
            // SetAnimationClipPlugin,
            InstancedMaterialPlugin,
            // VoxelTerrainPlugin,
        ))
        .init_asset::<VxmAsset>()
        .init_asset_loader::<VxmAssetLoader>()
        .add_systems(Startup, (setup, spawn_player))
        .add_systems(Update, (exit_on_esc_system, dynamic_scene))
        .add_systems(
            FixedUpdate,
            (
                file_drag_and_drop_system,
                // setup_scene_once_loaded,
                add_vxm_swap_targets,
                create_vxm_swap_targets_on_gltf_import_system,
                create_mesh_on_vxm_import_system,
                swap_vxm_meshes,
            ),
        )
        .run();
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
        MeshMaterial3d(materials.add(Color::srgb(0.0,1.0,0.0))),
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

    // Sun
    commands.spawn((
        DirectionalLight {
            shadows_enabled: true,
            illuminance: lux::RAW_SUNLIGHT,
            ..default()
        },
        Transform::from_xyz(1.0, -0.4, 0.0).looking_at(Vec3::ZERO, Vec3::Y),
        cascade_shadow_config,
    ));

    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 0.15, 0.0).looking_at(Vec3::NEG_Z, Vec3::Y),
    ));


    // commands.spawn((
    //     Name::new("Dragon 0,0"),
    //     PendingVxm(asset_server.load("street-scene.vxm")),
    //     Transform::from_scale(Vec3::splat(4.0)).with_translation(Vec3::new(0.0, 100.0, 0.0)),
    // ));
}
