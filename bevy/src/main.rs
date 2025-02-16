#![feature(portable_simd)]
mod camera;
mod custom_phase_item;
mod custom_shader_instancing;
mod dnd;
mod draw_aabb_gizmos;
mod replace_body_part_meshes;
mod set_animation_clip_keyboard;
mod spawn_player;
mod vxm;
mod vxm_mesh;

use crate::camera::ThirdPersonCameraPlugin;
use crate::dnd::{file_drag_and_drop_system, setup_scene_once_loaded};
use crate::draw_aabb_gizmos::DrawAabbGizmosPlugin;
use crate::replace_body_part_meshes::{
    add_vxm_swap_targets, create_vxm_swap_targets_on_gltf_import_system, swap_vxm_meshes,
};
use crate::set_animation_clip_keyboard::SetAnimationClipPlugin;
use crate::vxm::{VxmAsset, VxmAssetLoader};
use crate::vxm_mesh::{create_mesh_on_vxm_import_system, VxmMeshPlugin};
use bevy::core_pipeline::experimental::taa::{TemporalAntiAliasPlugin, TemporalAntiAliasing};
use bevy::core_pipeline::prepass::MotionVectorPrepass;
use bevy::ecs::bundle::DynamicBundle;
use bevy::pbr::{FogVolume, ScreenSpaceAmbientOcclusion, VolumetricFog};
use bevy::render::render_resource::WgpuFeatures;
use bevy::render::settings::{RenderCreation, WgpuSettings};
use bevy::render::RenderPlugin;
use bevy::window::{PresentMode, WindowResolution};
use bevy::{
    core_pipeline::{motion_blur::MotionBlur, prepass::DeferredPrepass},
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
use crate::custom_shader_instancing::InstancedMaterialPlugin;

fn exit_on_esc_system(keyboard_input: Res<ButtonInput<KeyCode>>, mut exit: EventWriter<AppExit>) {
    if keyboard_input.just_pressed(KeyCode::Escape) {
        exit.send(AppExit::Success);
    }
}

fn main() {
    App::new()
        .insert_resource(DefaultOpaqueRendererMethod::deferred())
        .insert_resource(DirectionalLightShadowMap { size: 4096 })
        .insert_resource(ClearColor(Color::srgb(0.0, 1.0, 0.0)))
        .add_plugins((
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Soulflame".to_string(),
                        resolution: WindowResolution::new(1920., 1080.),
                        focused: true,
                        present_mode: PresentMode::AutoNoVsync,
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
            SetAnimationClipPlugin,
            // CustomRenderPhaseItemPlugin,
            // InstancedMaterialPlugin
            //TODO :try built in instancing by reusing mesh handle?
        ))
        .init_asset::<VxmAsset>()
        .init_asset_loader::<VxmAssetLoader>()
        .add_systems(Startup, (setup))
        .add_systems(
            Update,
            (
                file_drag_and_drop_system,
                setup_scene_once_loaded,
                add_vxm_swap_targets,
                exit_on_esc_system,
                create_vxm_swap_targets_on_gltf_import_system,
                create_mesh_on_vxm_import_system,
                swap_vxm_meshes,
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
            hdr: false,
            ..default()
        },
        Transform::from_xyz(0.7, 0.7, 1.0).looking_at(Vec3::new(0.0, 0.3, 0.0), Vec3::Y),
        Msaa::Off,
        MotionVectorPrepass,
        DeferredPrepass,
        ScreenSpaceAmbientOcclusion::default(),
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
