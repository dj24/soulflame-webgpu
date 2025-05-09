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

use crate::camera::ThirdPersonCameraPlugin;
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

use bevy::core_pipeline::bloom::Bloom;
use bevy::render::camera::Exposure;
use std::f32::consts::*;

fn exit_on_esc_system(keyboard_input: Res<ButtonInput<KeyCode>>, mut exit: EventWriter<AppExit>) {
    if keyboard_input.just_pressed(KeyCode::Escape) {
        exit.send(AppExit::Success);
    }
}

fn main() {
    App::new()
        .insert_resource(DefaultOpaqueRendererMethod::deferred())
        .insert_resource(DirectionalLightShadowMap { size: 4096 })
        .insert_resource(ClearColor(Color::srgb(0.0, 0.0, 0.0)))
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
            TemporalAntiAliasPlugin,
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
        .add_systems(Update, (exit_on_esc_system))
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

fn setup(
    mut commands: Commands,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut meshes: ResMut<Assets<Mesh>>,
    asset_server: Res<AssetServer>,
    // graphs: ResMut<Assets<AnimationGraph>>,
) {
    // commands.spawn(PerfUiAllEntries::default());
    // Camera
    commands.spawn((
        Camera3d::default(),
        // MotionBlur {
        //     shutter_angle: 1.0,
        //     samples: 4,
        // },
        Camera {
            hdr: true,
            ..default()
        },
        Transform::from_xyz(0.7, 0.7, 1.0).looking_at(Vec3::new(0.0, 0.3, 0.0), Vec3::Y),
        Msaa::Sample4,
        Atmosphere::EARTH,
        AtmosphereSettings {
            aerial_view_lut_max_distance: 3.2e5,
            scene_units_to_m: 1e+4,
            ..Default::default()
        },
        Exposure::SUNLIGHT,
        // Tonemapping::AcesFitted,
        Bloom::NATURAL,
        // MotionVectorPrepass,
        // DeferredPrepass,
        // ScreenSpaceAmbientOcclusion::default(),
        // TemporalAntiAliasing::default(),
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

    commands.spawn((
        Name::new("Dragon 0,0"),
        PendingVxm(asset_server.load("dragon.vxm")),
        Transform::from_translation(Vec3::new(0.0, 200.0, 0.0)),
    ));
    //
    // for x in -8..8 {
    //     for z in -8..8 {
    //         if x == 0 && z == 0 {
    //             continue;
    //         }
    //         commands.spawn((
    //             Name::new(format!("Dragon {:?},{:?}", x, z)),
    //             PendingVxm(asset_server.load("big_cube.vxm")),
    //             Transform::from_scale(Vec3::new(0.02, 0.02, 0.02)).with_translation(Vec3::new(
    //                 x as f32 * 32.0 * 0.02 * 2.0,
    //                 0.0,
    //                 -z as f32 * 32.0 * 0.02 * 2.0,
    //             )),
    //         ));
    //     }
    // }

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
    // let mat_h = materials.add(mat);

    // Plane
    // commands.spawn((
    //     Mesh3d(meshes.add(Plane3d::default().mesh().size(50.0, 50.0))),
    //     MeshMaterial3d(mat_h.clone()),
    // ));

    // sky
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(2.0, 1.0, 1.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Srgba::hex("87CEEB").unwrap().into(),
            unlit: true,
            cull_mode: Some(Face::Back),
            ..default()
        })),
        Transform::from_scale(Vec3::splat(1_000_000.0)),
        NotShadowCaster,
        NotShadowReceiver,
    ));

    // Player

    //Chest
}
