#![feature(portable_simd)]
mod camera;
mod dnd;
mod draw_aabb_gizmos;
mod replace_body_part_meshes;
mod spawn_player;
mod vxm;
mod vxm_mesh;

use crate::camera::ThirdPersonCameraPlugin;
use crate::dnd::{file_drag_and_drop_system, setup_scene_once_loaded};
use crate::draw_aabb_gizmos::DrawAabbGizmosPlugin;
use crate::replace_body_part_meshes::change_player_mesh_in_scene;
use crate::spawn_player::spawn_player;
use crate::vxm::{VxmAsset, VxmAssetLoader};
use crate::vxm_mesh::VxmMeshPlugin;
use bevy::core_pipeline::experimental::taa::{TemporalAntiAliasPlugin, TemporalAntiAliasing};
use bevy::ecs::bundle::DynamicBundle;
use bevy::pbr::{
    FogVolume, ScreenSpaceAmbientOcclusion, ScreenSpaceAmbientOcclusionQualityLevel, VolumetricFog,
};
use bevy::{
    core_pipeline::{
        motion_blur::MotionBlur,
        prepass::{DeferredPrepass, DepthPrepass, MotionVectorPrepass},
    },
    dev_tools::fps_overlay::{FpsOverlayConfig, FpsOverlayPlugin},
    pbr::{
        CascadeShadowConfigBuilder, DefaultOpaqueRendererMethod, DirectionalLightShadowMap,
        NotShadowCaster, NotShadowReceiver, OpaqueRendererMethod,
    },
    prelude::*,
};
use bevy::{prelude::*, render::extract_resource::ExtractResource};
use bevy_inspector_egui::quick::WorldInspectorPlugin;
use std::f32::consts::*;

fn main() {
    App::new()
        .insert_resource(DefaultOpaqueRendererMethod::deferred())
        .insert_resource(DirectionalLightShadowMap { size: 4096 })
        .insert_resource(ClearColor(Color::srgb(0.0, 1.0, 0.0)))
        .add_plugins((
            DefaultPlugins.set(WindowPlugin {
                primary_window: Some(Window {
                    title: "Soulflame".to_string(),
                    focused: true,
                    ..default()
                }),
                ..default()
            }),
            ThirdPersonCameraPlugin,
            TemporalAntiAliasPlugin,
            VxmMeshPlugin,
            FpsOverlayPlugin {
                config: FpsOverlayConfig {
                    text_config: TextFont {
                        font_size: 18.0,
                        ..default()
                    },
                    // We can also change color of the overlay
                    text_color: Color::srgb(1.0, 1.0, 1.0),
                    enabled: true,
                },
            },
            WorldInspectorPlugin::new(),
            DrawAabbGizmosPlugin,
        ))
        .init_asset::<VxmAsset>()
        .init_asset_loader::<VxmAssetLoader>()
        .add_systems(Startup, (setup, spawn_player))
        .add_systems(
            Update,
            (
                file_drag_and_drop_system,
                setup_scene_once_loaded,
                change_player_mesh_in_scene,
            ),
        )
        .run();
}

fn setup(
    mut commands: Commands,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut meshes: ResMut<Assets<Mesh>>,
    asset_server: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    // Camera
    commands.spawn((
        Camera3d::default(),
        MotionBlur {
            shutter_angle: 1.0,
            samples: 4,
        },
        Camera {
            hdr: true,
            ..default()
        },
        Transform::from_xyz(0.7, 0.7, 1.0).looking_at(Vec3::new(0.0, 0.3, 0.0), Vec3::Y),
        Msaa::Off,
        DepthPrepass,
        MotionVectorPrepass,
        DeferredPrepass,
        ScreenSpaceAmbientOcclusion {
            quality_level: ScreenSpaceAmbientOcclusionQualityLevel::Ultra,
            ..default()
        },
        TemporalAntiAliasing::default(),
        EnvironmentMapLight {
            intensity: 900.0,
            diffuse_map: asset_server.load("environment_maps/pisa_diffuse_rgb9e5_zstd.ktx2"),
            specular_map: asset_server.load("environment_maps/pisa_specular_rgb9e5_zstd.ktx2"),
            ..default()
        },
        VolumetricFog {
            // This value is explicitly set to 0 since we have no environment map light
            ambient_intensity: 0.0,
            ..default()
        },
    ));

    // Sun
    commands.spawn((
        DirectionalLight {
            illuminance: 15_000.,
            shadows_enabled: true,
            ..default()
        },
        CascadeShadowConfigBuilder {
            num_cascades: 4,
            maximum_distance: 200.0,
            ..default()
        }
        .build(),
        Transform::from_rotation(Quat::from_euler(EulerRot::ZYX, 0.0, -FRAC_PI_4, -FRAC_PI_4)),
    ));

    // Add the fog volume.
    commands.spawn((
        FogVolume::default(),
        Transform::from_scale(Vec3::splat(35.0)),
    ));

    let mut mat: StandardMaterial = Color::srgb(0.1, 0.2, 0.1).into();
    mat.opaque_render_method = OpaqueRendererMethod::Deferred;
    let mat_h = materials.add(mat);

    // Plane
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(50.0, 50.0))),
        MeshMaterial3d(mat_h.clone()),
    ));
    // sky
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(2.0, 1.0, 1.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Srgba::hex("87CEEB").unwrap().into(),
            unlit: true,
            cull_mode: None,
            ..default()
        })),
        Transform::from_scale(Vec3::splat(1_000_000.0)),
        NotShadowCaster,
        NotShadowReceiver,
    ));

    // Player

    //Chest
}
