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
use bevy::ecs::bundle::DynamicBundle;
use bevy::pbr::{FogVolume, ScreenSpaceAmbientOcclusion, VolumetricFog};
use bevy::scene::SceneInstance;
use bevy::window::{VideoMode, WindowMode};
use crate::camera::{CameraTarget, ThirdPersonCameraPlugin};
use crate::vxm::{VxmAsset, VxmAssetLoader};
use crate::dnd::{file_drag_and_drop_system, setup_scene_once_loaded, Animations, VoxelObject};
use crate::vxm_mesh::{VxmMeshPlugin};
use bevy_inspector_egui::quick::WorldInspectorPlugin;

fn main() {
    App::new()
        .insert_resource(DefaultOpaqueRendererMethod::deferred())
        .insert_resource(DirectionalLightShadowMap { size: 4096 })
        .insert_resource(ClearColor(Color::srgb(0.0, 1.0, 0.0)))
        .add_plugins((
            DefaultPlugins.set(WindowPlugin {
                primary_window: Some(Window {
                    mode: WindowMode::BorderlessFullscreen(MonitorSelection::Current),
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
        ))
        .init_asset::<VxmAsset>()
        .init_asset_loader::<VxmAssetLoader>()
        .add_systems(Startup, setup)
        .add_systems(Update, (file_drag_and_drop_system, setup_scene_once_loaded, change_mesh_in_scene))
        .run();
}

const PLAYER_GLB_PATH: &str = "models/BearRace.glb";

const BEAR_VXM_PATH_PREFIX: &str = "models/Barbearian/Male";

const BEAR_HEAD_VXM_PATH: &str = "models/Barbearian/Male/Head/BearHead.vxm";
const BEAR_CHEST_VXM_PATH: &str = "models/Barbearian/Male/Chest/BearChest.vxm";

const ORC_HEAD_VXM_PATH: &str = "models/OrcHead.vxm";

#[derive(Resource)]
pub struct PlayerBodyPartModels{
    pub head: Handle<VxmAsset>,
    pub chest: Handle<VxmAsset>,
}

impl FromWorld for PlayerBodyPartModels {
    fn from_world(world: &mut World) -> Self {
        let asset_server = world.get_resource::<AssetServer>().unwrap();
        PlayerBodyPartModels {
            head: asset_server.load(BEAR_HEAD_VXM_PATH),
            chest: asset_server.load(BEAR_CHEST_VXM_PATH),
        }
    }
}

fn setup(
    mut commands: Commands,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut meshes: ResMut<Assets<Mesh>>,
    asset_server: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    let mut camera = commands.spawn((
        Camera3d::default(),
        MotionBlur {
            shutter_angle: 1.0,
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

    // Player
    let (graph, node_indices) = AnimationGraph::from_clips([
        asset_server.load(GltfAssetLabel::Animation(7).from_asset(PLAYER_GLB_PATH)),
    ]);
    let graph_handle = graphs.add(graph);
    commands.insert_resource(Animations {
        animations: node_indices,
        graph: graph_handle.clone(),
    });
    commands.init_resource::<PlayerBodyPartModels>();
    commands.spawn((
        SceneRoot(asset_server.load(
            GltfAssetLabel::Scene(0).from_asset(PLAYER_GLB_PATH),
        )),
        Transform::from_scale(Vec3::new(0.02, 0.02, 0.02)),
        AnimationGraphHandle(graph_handle.clone()),
        CameraTarget,
    ));
}


// System to detect when scene is loaded and modify meshes
fn change_mesh_in_scene(
    scene_root_query: Query<(Entity, &SceneRoot, &Children)>,
    children_query: Query<&Children>,
    material_query: Query<(&Mesh3d, &Name)>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    player_body_part_models: Option<Res<PlayerBodyPartModels>>,
    vxm_assets: Res<Assets<VxmAsset>>,
) {
    if player_body_part_models.is_none() {
        return;
    }

    let player_body_part_models = player_body_part_models.unwrap();
    let bear_head = vxm_assets.get(&player_body_part_models.head);
    let bear_chest = vxm_assets.get(&player_body_part_models.chest);

    if bear_head.is_none() || bear_chest.is_none() {
        return;
    }

    let new_material = materials.add(StandardMaterial::default());

    for (root_entity, _, children) in scene_root_query.iter() {
        // Scene is loaded, we can now process its children
        info!("Found scene root with {} children", children.len());
        for child in children_query.iter_descendants(root_entity) {
            // Check if the child has a mesh component
            if !material_query.get(child).is_ok() {
                continue;
            }
            let (_, name) = material_query.get(child).unwrap();
            if name.as_str().starts_with("BearChest") {
                info!("Processing child {:?}", name);
                let chest_mesh = meshes.add(vxm_mesh::create_mesh_from_voxels(bear_chest.unwrap()));

                // Remove the old mesh and material
                commands.entity(child).remove::<MeshMaterial3d<StandardMaterial>>();
                commands.entity(child).remove::<Mesh3d>();

                // // Add the new mesh and material as children of the old mesh so they can be positioned correctly
                let chest = commands.spawn((
                    Transform::from_rotation(Quat::from_euler(EulerRot::XYZ, -FRAC_PI_2, 0.0, 0.0)),
                    MeshMaterial3d(new_material.clone()),
                    Mesh3d(chest_mesh))
                ).id();
                commands.entity(chest).set_parent(child);
            }
            if name.as_str().starts_with("BearHead") {
                info!("Processing child {:?}", name);
                let head_mesh = meshes.add(vxm_mesh::create_mesh_from_voxels(bear_head.unwrap()));

                // Remove the old mesh and material
                commands.entity(child).remove::<MeshMaterial3d<StandardMaterial>>();
                commands.entity(child).remove::<Mesh3d>();

                // // Add the new mesh and material as children of the old mesh so they can be positioned correctly
                let head = commands.spawn((
                    Transform::from_rotation(Quat::from_euler(EulerRot::XYZ, -FRAC_PI_2, 0.0, 0.0)),
                    MeshMaterial3d(new_material.clone()),
                    Mesh3d(head_mesh))
                ).id();
                commands.entity(head).set_parent(child);
            }

        }
        // Mark the scene as processed
        commands.remove_resource::<PlayerBodyPartModels>();
    }
}