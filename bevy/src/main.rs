#![feature(portable_simd)]
mod camera;
mod vxm;
mod dnd;
mod vxm_mesh;

use bevy::{
    prelude::*,
    render::{
        extract_resource::{ExtractResource},
    },
};
use std::f32::consts::*;
use bevy::{
    dev_tools::fps_overlay::{FpsOverlayConfig, FpsOverlayPlugin},
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

use bevy::core_pipeline::experimental::taa::{TemporalAntiAliasPlugin, TemporalAntiAliasing};
use bevy::pbr::{FogVolume, ScreenSpaceAmbientOcclusion, VolumetricFog};
use crate::camera::{CameraTarget, ThirdPersonCameraPlugin};
use crate::vxm::{VxmAsset, VxmAssetLoader};
use crate::dnd::{file_drag_and_drop_system, setup_scene_once_loaded};
use crate::vxm_mesh::{VxmMeshPlugin};

fn main() {
    App::new()
        .insert_resource(DefaultOpaqueRendererMethod::deferred())
        .insert_resource(DirectionalLightShadowMap { size: 4096 })
        .insert_resource(ClearColor(Color::srgb(0.0, 1.0, 0.0)))
        .add_plugins((
            DefaultPlugins,
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
        ))
        .init_asset::<VxmAsset>()
        .init_asset_loader::<VxmAssetLoader>()
        .add_systems(Startup, setup)
        .add_systems(Update, (file_drag_and_drop_system, setup_scene_once_loaded))
        .run();
}

fn setup(
    mut commands: Commands,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut meshes: ResMut<Assets<Mesh>>,
) {
    let mut camera = commands.spawn((
        Camera3d::default(),
        MotionBlur {
            shutter_angle: 0.5,
            samples: 4,
        },
        Camera {
            // Deferred both supports both hdr: true and hdr: false
            hdr: true,
            ..default()
        },
        Transform::from_xyz(0.7, 0.7, 1.0).looking_at(Vec3::new(0.0, 0.3, 0.0), Vec3::Y),
        Msaa::Off,
        DepthPrepass,
        MotionVectorPrepass,
        DeferredPrepass,
        ScreenSpaceAmbientOcclusion::default(),
        TemporalAntiAliasing::default(),
    ));

    camera.insert(VolumetricFog {
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

    // Cubes
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.1, 0.1, 0.1))),
        MeshMaterial3d(mat_h.clone()),
        Transform::from_xyz(-0.3, 0.5, -0.2),
        CameraTarget,
    ));

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


