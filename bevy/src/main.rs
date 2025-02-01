#![feature(portable_simd)]
mod camera;
mod dnd;
mod vxm;
mod vxm_mesh;

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
use std::f32::consts::*;
use std::thread::sleep;

use crate::camera::{CameraTarget, ThirdPersonCameraPlugin};
use crate::dnd::{file_drag_and_drop_system, setup_scene_once_loaded, Animations, VoxelObject};
use crate::vxm::{VxmAsset, VxmAssetLoader};
use crate::vxm_mesh::VxmMeshPlugin;
use bevy::core_pipeline::experimental::taa::{TemporalAntiAliasPlugin, TemporalAntiAliasing};
use bevy::ecs::bundle::DynamicBundle;
use bevy::pbr::{FogVolume, ScreenSpaceAmbientOcclusion, VolumetricFog};
use bevy::render::mesh::VertexAttributeValues;
use bevy::render::primitives::Aabb;
use bevy::scene::SceneInstance;
use bevy::window::{VideoMode, WindowMode};
use bevy_inspector_egui::quick::WorldInspectorPlugin;

fn main() {
    App::new()
        .insert_resource(DefaultOpaqueRendererMethod::deferred())
        .insert_resource(DirectionalLightShadowMap { size: 4096 })
        .insert_resource(ClearColor(Color::srgb(0.0, 1.0, 0.0)))
        .add_plugins((
            DefaultPlugins.set(WindowPlugin {
                primary_window: Some(Window {
                    // mode: WindowMode::BorderlessFullscreen(MonitorSelection::Current),
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
        .add_systems(Startup, (setup, spawn_player))
        .add_systems(
            Update,
            (
                file_drag_and_drop_system,
                setup_scene_once_loaded,
                change_player_mesh_in_scene,
                change_chest_mesh_in_scene,
                // draw_gizmos,
            ),
        )
        .run();
}

const PLAYER_GLB_PATH: &str = "meshes/BearRace.glb";
const CHEST_GLB_PATH: &str = "meshes/ChestAnimations.glb";

const PlAYER_BLEND_PATH: &str = "meshes/BearRace.blend";

const BEAR_VXM_PATH_PREFIX: &str = "meshes/Barbearian/Male";

const BEAR_HEAD_VXM_PATH: &str = "meshes/Barbearian/Male/Head/BearHead.vxm";
const BEAR_CHEST_VXM_PATH: &str = "meshes/Barbearian/Male/Chest/BearChest.vxm";
const BEAR_FUR_CHEST_VXM_PATH: &str = "meshes/Barbearian/Male/Fur/FurChest.vxm";
const BEAR_FUR_HEAD_VXM_PATH: &str = "meshes/Barbearian/Male/Fur/FurHead.vxm";
const BEAR_NOSE_VXM_PATH: &str = "meshes/Barbearian/Male/Nose/BearNose.vxm";
const BEAR_EARS_VXM_PATH: &str = "meshes/Barbearian/Male/Ears/BearEars.vxm";
const BEAR_EYES_VXM_PATH: &str = "meshes/Barbearian/Male/Eyes/BearEyes.vxm";
const BEAR_BICEP_VXM_PATH: &str = "meshes/Barbearian/Male/Bicep/BearBicep.vxm";
const BEAR_ARM_VXM_PATH: &str = "meshes/Barbearian/Male/Arm/BearArm.vxm";
const BEAR_HAND_VXM_PATH: &str = "meshes/Barbearian/Male/Hand/BearHand.vxm";
const BEAR_WAIST_VXM_PATH: &str = "meshes/Barbearian/Male/Waist/BearWaist.vxm";
const BEAR_THIGH_VXM_PATH: &str = "meshes/Barbearian/Male/Thigh/BearThigh.vxm";
const BEAR_LEG_VXM_PATH: &str = "meshes/Barbearian/Male/Leg/BearLeg.vxm";
const BEAR_FOOT_VXM_PATH: &str = "meshes/Barbearian/Male/Foot/BearFoot.vxm";
const BEAR_CLAWS_VXM_PATH: &str = "meshes/Barbearian/Male/Claws/Claws.vxm";
const BEAR_FUR_BICEP_VXM_PATH: &str = "meshes/Barbearian/Male/Fur/FurBicep.vxm";
const BEAR_FUR_WAIST_VXM_PATH: &str = "meshes/Barbearian/Male/Fur/FurWaist.vxm";
const BEAR_JAW_VXM_PATH: &str = "meshes/Barbearian/Male/Jaw/BearJaw.vxm";

const ORC_HEAD_VXM_PATH: &str = "meshes/OrcHead.vxm";

struct VxmModel {
    name: String,
    vxm_handle: Handle<VxmAsset>,
}

#[derive(Resource)]
pub struct ChestModels(Vec<VxmModel>);

impl FromWorld for ChestModels {
    fn from_world(world: &mut World) -> Self {
        let asset_server = world.get_resource::<AssetServer>().unwrap();
        ChestModels(vec![
            VxmModel {
                name: "ChestTop".to_string(),
                vxm_handle: asset_server.load("meshes/Chest/ChestTop.vxm"),
            },
            VxmModel {
                name: "ChestBottom".to_string(),
                vxm_handle: asset_server.load("meshes/Chest/ChestBottom.vxm"),
            },
        ])
    }
}

#[derive(Resource)]
pub struct PlayerBodyPartModels(Vec<VxmModel>);

impl FromWorld for PlayerBodyPartModels {
    fn from_world(world: &mut World) -> Self {
        let asset_server = world.get_resource::<AssetServer>().unwrap();
        PlayerBodyPartModels(vec![
            VxmModel {
                name: "BearHead".to_string(),
                vxm_handle: asset_server.load(BEAR_HEAD_VXM_PATH),
            },
            VxmModel {
                name: "BearChest".to_string(),
                vxm_handle: asset_server.load(BEAR_CHEST_VXM_PATH),
            },
            VxmModel {
                name: "FurChest".to_string(),
                vxm_handle: asset_server.load(BEAR_FUR_CHEST_VXM_PATH),
            },
            VxmModel {
                name: "FurHead".to_string(),
                vxm_handle: asset_server.load(BEAR_FUR_HEAD_VXM_PATH),
            },
            VxmModel {
                name: "BearNose".to_string(),
                vxm_handle: asset_server.load(BEAR_NOSE_VXM_PATH),
            },
            VxmModel {
                name: "BearEars".to_string(),
                vxm_handle: asset_server.load(BEAR_EARS_VXM_PATH),
            },
            VxmModel {
                name: "BearEyes".to_string(),
                vxm_handle: asset_server.load(BEAR_EYES_VXM_PATH),
            },
            VxmModel {
                name: "BearBicep".to_string(),
                vxm_handle: asset_server.load(BEAR_BICEP_VXM_PATH),
            },
            VxmModel {
                name: "BearArm".to_string(),
                vxm_handle: asset_server.load(BEAR_ARM_VXM_PATH),
            },
            VxmModel {
                name: "BearHand".to_string(),
                vxm_handle: asset_server.load(BEAR_HAND_VXM_PATH),
            },
            VxmModel {
                name: "BearWaist".to_string(),
                vxm_handle: asset_server.load(BEAR_WAIST_VXM_PATH),
            },
            VxmModel {
                name: "Thigh".to_string(),
                vxm_handle: asset_server.load(BEAR_THIGH_VXM_PATH),
            },
            VxmModel {
                name: "BearLeg".to_string(),
                vxm_handle: asset_server.load(BEAR_LEG_VXM_PATH),
            },
            VxmModel {
                name: "BearFoot".to_string(),
                vxm_handle: asset_server.load(BEAR_FOOT_VXM_PATH),
            },
            VxmModel {
                name: "Claws".to_string(),
                vxm_handle: asset_server.load(BEAR_CLAWS_VXM_PATH),
            },
            VxmModel {
                name: "FurBicep".to_string(),
                vxm_handle: asset_server.load(BEAR_FUR_BICEP_VXM_PATH),
            },
            VxmModel {
                name: "FurWaist".to_string(),
                vxm_handle: asset_server.load(BEAR_FUR_WAIST_VXM_PATH),
            },
            VxmModel {
                name: "BearJaw".to_string(),
                vxm_handle: asset_server.load(BEAR_JAW_VXM_PATH),
            },
            VxmModel {
                name: "PadFront".to_string(),
                vxm_handle: asset_server.load("meshes/Armour/Plates and pads/Chest/Male Mid/PadFront.vxm"),
            }
        ])
    }
}

fn spawn_player(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    let (graph, node_indices) = AnimationGraph::from_clips([
        asset_server.load(GltfAssetLabel::Animation(6).from_asset(PLAYER_GLB_PATH))
    ]);
    let player_graph_handle = graphs.add(graph);
    commands.insert_resource(Animations {
        animations: node_indices,
        graph: player_graph_handle.clone(),
    });
    commands.init_resource::<PlayerBodyPartModels>();
    commands.spawn((
        SceneRoot(asset_server.load(GltfAssetLabel::Scene(0).from_asset(PLAYER_GLB_PATH))),
        Transform::from_scale(Vec3::new(0.02, 0.02, 0.02)),
        AnimationGraphHandle(player_graph_handle.clone()),
        CameraTarget(Vec3::new(0.0, 0.2, 0.0)),
    ));
}

// TODO: fix race condition with two animations playing at once
fn spawn_chest(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    let (chest_graph, chest_node_indices) = AnimationGraph::from_clips([
        asset_server.load(GltfAssetLabel::Animation(0).from_asset(CHEST_GLB_PATH))
    ]);
    let chest_graph_handle = graphs.add(chest_graph);
    commands.insert_resource(Animations {
        animations: chest_node_indices,
        graph: chest_graph_handle.clone(),
    });

    commands.init_resource::<ChestModels>();
    commands.spawn((
        SceneRoot(asset_server.load(GltfAssetLabel::Scene(0).from_asset(CHEST_GLB_PATH))),
        Transform::from_scale(Vec3::splat(0.02))
            .mul_transform(Transform::from_translation(Vec3::new(0.0, 16.0, 0.0))),
        AnimationGraphHandle(chest_graph_handle.clone()),
        CameraTarget(Vec3::new(0.0, 0.2, 0.0)),
    ));
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

    //Chest
}

fn get_mesh_centroid(mesh: &Mesh) -> Vec3 {
    if let Some(VertexAttributeValues::Float32x3(positions)) =
        mesh.attribute(Mesh::ATTRIBUTE_POSITION)
    {
        // Calculate the centroid of the mesh vertices
        let mut centroid = Vec3::ZERO;
        for position in positions {
            centroid += Vec3::new(position[0], position[1], position[2]);
        }
        centroid /= positions.len() as f32;
        centroid
    } else {
        Vec3::ZERO
    }
}

enum Axis {
    X,
    Y,
    Z,
}

fn get_max_on_axis(mesh: &Mesh, axis: Axis) -> f32 {
    if let Some(VertexAttributeValues::Float32x3(positions)) =
        mesh.attribute(Mesh::ATTRIBUTE_POSITION)
    {
        let mut max = -1000000000.0;
        for position in positions {
            match axis {
                Axis::X => {
                    if position[0] > max {
                        max = position[0];
                    }
                }
                Axis::Y => {
                    if position[1] > max {
                        max = position[1];
                    }
                }
                Axis::Z => {
                    if position[2] > max {
                        max = position[2];
                    }
                }
            }
        }
        max
    } else {
        0.0
    }
}

fn draw_gizmos(mut gizmos: Gizmos, mesh_query: Query<(&GlobalTransform, &Mesh3d, &Aabb)>) {
    for (transform, mesh, aabb) in mesh_query.iter() {
        let position = transform.translation();
        let scale = transform.scale();
        let rotation = transform.rotation();
        let aabb_size = Vec3::from(aabb.max() - aabb.min());
        // gizmos.sphere(position, 0.05, Color::srgb(1.0, 0.0, 1.0));
        gizmos.cuboid(
            Transform::from_translation(position)
                .with_rotation(rotation)
                .with_scale(scale * aabb_size),
            Color::srgb(1.0, 0.0, 0.0),
        );
    }
}

// System to detect when scene is loaded and modify meshes
fn change_player_mesh_in_scene(
    scene_root_query: Query<(Entity, &SceneRoot, &Children)>,
    children_query: Query<&Children>,
    material_query: Query<(&Mesh3d, &Name, &Transform)>,
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

    let new_material = materials.add(StandardMaterial::default());

    for (root_entity, _, children) in scene_root_query.iter() {
        // Scene is loaded, we can now process its children
        info!("Found scene root with {} children", children.len());
        for child in children_query.iter_descendants(root_entity) {
            // Check if the child has a mesh component
            if !material_query.get(child).is_ok() {
                continue;
            }
            let (mesh3d, name, transform) = material_query.get(child).unwrap();
            let mesh = meshes.get(mesh3d).unwrap();
            let max_axes = Vec3::new(
                get_max_on_axis(mesh, Axis::X),
                get_max_on_axis(mesh, Axis::Y),
                get_max_on_axis(mesh, Axis::Z),
            );
            let mut mesh_handle: Handle<Mesh> = Handle::default();

            for model in &player_body_part_models.0 {
                if name.as_str().starts_with(model.name.as_str()) {
                    let replacement_mesh = vxm_mesh::create_mesh_from_voxels(
                        vxm_assets.get(&model.vxm_handle).unwrap(),
                    );
                    mesh_handle = meshes.add(replacement_mesh);
                    let replacement_max_axes = Vec3::new(
                        get_max_on_axis(meshes.get(&mesh_handle).unwrap(), Axis::X),
                        get_max_on_axis(meshes.get(&mesh_handle).unwrap(), Axis::Y),
                        get_max_on_axis(meshes.get(&mesh_handle).unwrap(), Axis::Z),
                    );
                    let max_axes_difference = max_axes - replacement_max_axes;
                    let new_transform = Transform::from_translation(max_axes_difference);
                    // .mul_transform(
                    //     Transform::from_rotation(Quat::from_euler(EulerRot::XYZ, -FRAC_PI_2, 0.0, 0.0)));

                    // Remove the old mesh and material
                    commands
                        .entity(child)
                        .remove::<MeshMaterial3d<StandardMaterial>>()
                        .remove::<Mesh3d>()
                        .remove::<Transform>()
                        .insert(MeshMaterial3d(new_material.clone()))
                        .insert(Mesh3d(mesh_handle))
                        .insert(new_transform);
                }
            }
        }
        // Mark the scene as processed
        commands.remove_resource::<PlayerBodyPartModels>();
    }
}

fn translate_mesh_vertices(mesh: &Mesh, translation: Vec3) -> Mesh {
    let mut new_mesh = mesh.clone();
    if let Some(VertexAttributeValues::Float32x3(positions)) =
        new_mesh.attribute_mut(Mesh::ATTRIBUTE_POSITION)
    {
        for position in positions {
            position[0] += translation.x;
            position[1] += translation.y;
            position[2] += translation.z;
        }
    }
    new_mesh
}

fn change_chest_mesh_in_scene(
    scene_root_query: Query<(Entity, &SceneRoot, &Children)>,
    children_query: Query<&Children>,
    material_query: Query<(&Mesh3d, &Name, &Transform)>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    chest_models: Option<Res<ChestModels>>,
    vxm_assets: Res<Assets<VxmAsset>>,
    time: Res<Time>,
) {
    if chest_models.is_none() || time.elapsed_secs() < 2.0 {
        return;
    }

    let chest_models = chest_models.unwrap();

    let new_material = materials.add(StandardMaterial::default());

    for (root_entity, _, children) in scene_root_query.iter() {
        // Scene is loaded, we can now process its children
        info!("Found scene root with {} children", children.len());
        for child in children_query.iter_descendants(root_entity) {
            // Check if the child has a mesh component
            if !material_query.get(child).is_ok() {
                continue;
            }
            let (mesh3d, name, transform) = material_query.get(child).unwrap();
            let mesh = meshes.get(mesh3d).unwrap();
            let max_axes = Vec3::new(
                get_max_on_axis(mesh, Axis::X),
                get_max_on_axis(mesh, Axis::Y),
                get_max_on_axis(mesh, Axis::Z),
            );
            let mut mesh_handle: Handle<Mesh> = Handle::default();

            for model in &chest_models.0 {
                if name.as_str().starts_with(model.name.as_str()) {
                    let replacement_mesh = vxm_mesh::create_mesh_from_voxels(
                        vxm_assets.get(&model.vxm_handle).unwrap(),
                    );
                    mesh_handle = meshes.add(replacement_mesh);
                    let replacement_max_axes = Vec3::new(
                        get_max_on_axis(meshes.get(&mesh_handle).unwrap(), Axis::X),
                        get_max_on_axis(meshes.get(&mesh_handle).unwrap(), Axis::Y),
                        get_max_on_axis(meshes.get(&mesh_handle).unwrap(), Axis::Z),
                    );
                    let max_axes_difference = max_axes - replacement_max_axes;
                    info!("Max axes difference: {:?}", max_axes_difference);
                    let new_transform = Transform::from_translation(max_axes_difference);

                    // Remove the old mesh and material
                    commands
                        .entity(child)
                        .remove::<MeshMaterial3d<StandardMaterial>>()
                        .remove::<Mesh3d>()
                        .remove::<Transform>()
                        .insert(MeshMaterial3d(new_material.clone()))
                        .insert(Mesh3d(mesh_handle))
                        .insert(new_transform);
                }
            }
        }
        // Mark the scene as processed
        commands.remove_resource::<ChestModels>();
    }
}
