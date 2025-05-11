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

use crate::camera::{CameraTarget, ThirdPersonCameraPlugin};
use crate::custom_shader_instancing::InstancedMaterialPlugin;
use crate::dnd::{file_drag_and_drop_system, PendingVxm};
use crate::draw_aabb_gizmos::DrawAabbGizmosPlugin;
use crate::replace_body_part_meshes::{
    add_vxm_swap_targets, create_vxm_swap_targets_on_gltf_import_system, swap_vxm_meshes,
};
use crate::vxm::{VxmAsset, VxmAssetLoader};
use crate::vxm_mesh::{create_mesh_on_vxm_import_system, VxmMeshPlugin};
use crate::vxm_terrain::VoxelTerrainPlugin;
use bevy::core_pipeline::experimental::taa::TemporalAntiAliasPlugin;
use bevy::pbr::{
    Atmosphere, AtmosphereSettings, FogVolume, ScreenSpaceAmbientOcclusion, VolumetricFog,
};
use bevy::render::render_resource::{Face, WgpuFeatures};
use bevy::render::settings::{RenderCreation, WgpuSettings};
use bevy::render::RenderPlugin;
use bevy::window::{PresentMode, WindowResolution};
use bevy::{
    pbr::{
        CascadeShadowConfigBuilder, DefaultOpaqueRendererMethod, DirectionalLightShadowMap,
        NotShadowCaster, NotShadowReceiver, OpaqueRendererMethod,
    },
    prelude::*,
};

use bevy::color::palettes::basic::{GREEN, RED};
use bevy::color::palettes::css::ORANGE_RED;
use bevy::core_pipeline::bloom::Bloom;
use bevy::core_pipeline::dof::DepthOfField;
use bevy::core_pipeline::fxaa::Fxaa;
use bevy::core_pipeline::tonemapping::Tonemapping;
use bevy::prelude::light_consts::lux;
use bevy::render::camera::Exposure;
use std::f32::consts::*;
use bevy::render::render_resource::TextureViewDimension::Cube;

fn exit_on_esc_system(keyboard_input: Res<ButtonInput<KeyCode>>, mut exit: EventWriter<AppExit>) {
    if keyboard_input.just_pressed(KeyCode::Escape) {
        exit.send(AppExit::Success);
    }
}

fn main() {
    App::new()
        // .insert_resource(DefaultOpaqueRendererMethod::deferred())
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
            VoxelTerrainPlugin,
        ))
        .init_asset::<VxmAsset>()
        .init_asset_loader::<VxmAssetLoader>()
        .add_systems(Startup, setup)
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
) {
    // Configure a properly scaled cascade shadow map for this scene (defaults are too large, mesh units are in km)
    let cascade_shadow_config = CascadeShadowConfigBuilder::default().build();

    // Sun
    commands.spawn((
        DirectionalLight {
            shadows_enabled: true,
            // lux::RAW_SUNLIGHT is recommended for use with this feature, since
            // other values approximate sunlight *post-scattering* in various
            // conditions. RAW_SUNLIGHT in comparison is the illuminance of the
            // sun unfiltered by the atmosphere, so it is the proper input for
            // sunlight to be filtered by the atmosphere.
            illuminance: lux::RAW_SUNLIGHT,
            ..default()
        },
        Transform::from_xyz(1.0, -0.4, 0.0).looking_at(Vec3::ZERO, Vec3::Y),
        cascade_shadow_config,
    ));

    // red point light
    // commands.spawn((
    //     PointLight {
    //         intensity: 100_000.0,
    //         color: RED.into(),
    //         shadows_enabled: true,
    //         ..default()
    //     },
    //     Transform::from_xyz(0.0, 10.0, 0.0),
    //     children![(
    //         Mesh3d(meshes.add(Sphere::new(5.0).mesh().uv(32, 18))),
    //         MeshMaterial3d(materials.add(StandardMaterial {
    //             base_color: RED.into(),
    //             emissive: LinearRgba::new(4.0, 0.0, 0.0, 0.0),
    //             ..default()
    //         })),
    //     )],
    // ));

    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 0.15, 0.0).looking_at(Vec3::NEG_Z, Vec3::Y),
    ));



    // commands.spawn(PerfUiAllEntries::default());
    // Camera
    // commands.spawn((
    //     Camera3d::default(),
    //     // HDR is required for atmospheric scattering to be properly applied to the scene
    //     Camera {
    //         hdr: true,
    //         ..default()
    //     },
    //     // DistanceFog {
    //     //     color: Color::srgb(0.25, 0.25, 0.25),
    //     //     falloff: FogFalloff::Linear {
    //     //         start: 0.0,
    //     //         end: 5.0,
    //     //     },
    //     //     ..default()
    //     // },
    //     Transform::from_xyz(-1.2, 0.15, 0.0).looking_at(Vec3::Y * 0.1, Vec3::Y),
    //     // This is the component that enables atmospheric scattering for a camera
    //     // Atmosphere::EARTH,
    //     // The scene is in units of 10km, so we need to scale up the
    //     // aerial view lut distance and set the scene scale accordingly.
    //     // Most usages of this feature will not need to adjust this.
    //     AtmosphereSettings {
    //         aerial_view_lut_max_distance: 3.2e4,
    //         scene_units_to_m: 1.0,
    //         ..Default::default()
    //     },
    //     // The directional light illuminance  used in this scene
    //     // (the one recommended for use with this feature) is
    //     // quite bright, so raising the exposure compensation helps
    //     // bring the scene to a nicer brightness range.
    //     Exposure::SUNLIGHT,
    //     // Tonemapper chosen just because it looked good with the scene, any
    //     // tonemapper would be fine :)
    //     Tonemapping::AcesFitted,
    //     // Bloom gives the sun a much more natural look.
    //     Bloom::NATURAL,
    // ));

    // commands.spawn((
    //     Name::new("Dragon 0,0"),
    //     PendingVxm(asset_server.load("dragon.vxm")),
    //     Transform::from_scale(Vec3::splat(5.0)),
    // ));
}
