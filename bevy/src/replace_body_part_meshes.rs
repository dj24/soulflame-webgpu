use std::env::current_dir;
use std::path::Path;
use bevy::asset::{AssetEvent, AssetServer, Assets, Handle};
use bevy::core::Name;
use bevy::gltf::GltfAssetLabel;
use bevy::hierarchy::Children;
use bevy::log::{error, info};
use bevy::math::Vec3;
use bevy::pbr::{MeshMaterial3d, StandardMaterial};
use bevy::prelude::{AnimationGraph, AnimationGraphHandle, Color, Commands, Component, Entity, EventReader, FromWorld, Gltf, HierarchyQueryExt, Mesh, Mesh3d, Parent, Query, Res, ResMut, Resource, SceneRoot, Time, Transform, World};
use bevy::render::mesh::VertexAttributeValues;
use crate::{vxm_mesh};
use crate::camera::CameraTarget;
use crate::dnd::Animations;
use crate::vxm::VxmAsset;

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

struct VxmMeshSwapTarget {
    name: String,
    vxm_handle: Handle<VxmAsset>,
    parent_name: Option<String>,
}

#[derive(Resource)]
pub struct ChestModels(Vec<VxmMeshSwapTarget>);

impl FromWorld for ChestModels {
    fn from_world(world: &mut World) -> Self {
        let asset_server = world.get_resource::<AssetServer>().unwrap();
        ChestModels(vec![
            VxmMeshSwapTarget {
                name: "ChestTop".to_string(),
                vxm_handle: asset_server.load("meshes/Chest/ChestTop.vxm"),
                parent_name: None,
            },
            VxmMeshSwapTarget {
                name: "ChestBottom".to_string(),
                vxm_handle: asset_server.load("meshes/Chest/ChestBottom.vxm"),
                parent_name: None,
            },
        ])
    }
}

#[derive(Component)]
struct ReplaceWithVxm {
    name: String,
    vxm_handle: Handle<VxmAsset>,
}

pub fn create_vxm_swap_targets_on_gltf_import_system(
    mut events: EventReader<AssetEvent<Gltf>>,
) {
    for event in events.read() {
        match event {
            AssetEvent::LoadedWithDependencies { id } => {
                info!("Loaded GLTF {:?}", id);
            }
            AssetEvent::Added { id } => {
                info!("Added GLTF {:?}", id);
            }
            AssetEvent::Unused { id } => {
                info!("Unused GLTF {:?}", id);
            }
            AssetEvent::Modified { id } => {
                info!("Modified GLTF {:?}", id);
            }
            AssetEvent::Removed { id } => {
                info!("Removed GLTF {:?}", id);
            }
        }
    }
}

#[derive(Resource)]
pub struct PlayerBodyPartModels(Vec<VxmMeshSwapTarget>);

impl FromWorld for PlayerBodyPartModels {
    fn from_world(world: &mut World) -> Self {
        let asset_server = world.get_resource::<AssetServer>().unwrap();

        let armour_base_paths = vec![
            ("BearHead", "meshes/Armour/Helms/Mid"),
            ("BearHead", "meshes/Armour/Helms/Mid/Back"),
            ("BearHead", "meshes/Armour/Helms/Mid/Top"),
            ("BearHead", "meshes/Armour/Helms/Mid/Front"),
            ("BearHead", "meshes/Armour/Helms/Mid/Side"),
            ("BearChest", "meshes/Armour/Plates and pads/Chest/Male Mid"),
            ("BearChest", "meshes/Armour/Details/Chest/Male Mid"),
            ("BearChest", "meshes/Armour/Secondary/Chest/Male Mid"),
            ("BearWaist", "meshes/Armour/Plates and pads/Waist/Male Mid"),
            ("BearWaist", "meshes/Armour/Details/Waist/Male Mid"),
            ("BearWaist", "meshes/Armour/Secondary/Waist/Male Mid"),
            ("BearBicep", "meshes/Armour/Plates and pads/Bicep/Mid"),
            ("BearBicep", "meshes/Armour/Details/Bicep/Mid"),
            ("BearArm", "meshes/Armour/Plates and pads/Arm/Mid"),
            ("BearArm", "meshes/Armour/Details/Arm/Mid"),
            ("BearArm", "meshes/Armour/Secondary/Arm/Mid"),
            ("BearLeg", "meshes/Armour/Plates and pads/Legs/Mid"),
            ("BearLeg", "meshes/Armour/Details/Legs/Mid"),
            ("Thigh", "meshes/Armour/Plates and pads/Thigh/Mid"),
            ("Thigh", "meshes/Armour/Details/Thigh/Mid"),
            ("BearHand", "meshes/Armour/Plates and pads/Hand/Mid"),
            ("BearHand", "meshes/Armour/Details/Hand/Mid"),
            ("BearHand", "meshes/Armour/Secondary/Hand/Mid"),
            ("BearFoot", "meshes/Armour/Plates and pads/Feet/Mid"),
            ("BearFoot", "meshes/Armour/Details/Feet/Mid"),
            ("BearFoot", "meshes/Armour/Secondary/Feet/Mid")
        ];

        let assets_dir = current_dir().unwrap().join("assets");

        let mut model_vec = vec![
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearHead".to_string(),
                vxm_handle: asset_server.load(BEAR_HEAD_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearChest".to_string(),
                vxm_handle: asset_server.load(BEAR_CHEST_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "FurChest".to_string(),
                vxm_handle: asset_server.load(BEAR_FUR_CHEST_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "FurHead".to_string(),
                vxm_handle: asset_server.load(BEAR_FUR_HEAD_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearNose".to_string(),
                vxm_handle: asset_server.load(BEAR_NOSE_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearEars".to_string(),
                vxm_handle: asset_server.load(BEAR_EARS_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearEyes".to_string(),
                vxm_handle: asset_server.load(BEAR_EYES_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearBicep".to_string(),
                vxm_handle: asset_server.load(BEAR_BICEP_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearArm".to_string(),
                vxm_handle: asset_server.load(BEAR_ARM_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearHand".to_string(),
                vxm_handle: asset_server.load(BEAR_HAND_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearWaist".to_string(),
                vxm_handle: asset_server.load(BEAR_WAIST_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "Thigh".to_string(),
                vxm_handle: asset_server.load(BEAR_THIGH_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearLeg".to_string(),
                vxm_handle: asset_server.load(BEAR_LEG_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearFoot".to_string(),
                vxm_handle: asset_server.load(BEAR_FOOT_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "Claws".to_string(),
                vxm_handle: asset_server.load(BEAR_CLAWS_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "FurBicep".to_string(),
                vxm_handle: asset_server.load(BEAR_FUR_BICEP_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "FurWaist".to_string(),
                vxm_handle: asset_server.load(BEAR_FUR_WAIST_VXM_PATH),
            },
            VxmMeshSwapTarget {
                parent_name: None,
                name: "BearJaw".to_string(),
                vxm_handle: asset_server.load(BEAR_JAW_VXM_PATH),
            },
        ];

        for (body_part_name, path) in armour_base_paths {
            let dir_clone = assets_dir.clone();
            let dir_path = dir_clone.join(path);
            match dir_path.read_dir() {
                Ok(read_dir_result) => {
                    info!("Reading directory: {:?}", dir_path);
                    for entry in read_dir_result {
                        let file_path = entry.unwrap().path();
                        if file_path.is_file() && file_path.extension().unwrap_or_default() == "vxm" {
                            let relative_path = file_path.strip_prefix(&assets_dir).unwrap();
                            let file_stem = file_path.file_stem().unwrap().to_str().unwrap().to_string();
                            info!("Importing armour piece {:?} for {:?}", file_stem, body_part_name);
                            model_vec.push(VxmMeshSwapTarget {
                                name: file_stem,
                                vxm_handle: asset_server.load(relative_path.to_str().unwrap()),
                                parent_name: Some(body_part_name.to_string()),
                            });
                        }
                    }
                }
                Err(e) => {
                    panic!("Error reading directory {:?} {:?}", dir_path, e);
                    continue;
                }
            }
        }

        PlayerBodyPartModels(model_vec)
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

// System to detect when scene is loaded and modify meshes
pub fn change_player_mesh_in_scene(
    scene_root_query: Query<(Entity, &SceneRoot, &Children)>,
    children_query: Query<&Children>,
    parent_query: Query<&Parent>,
    name_query: Query<&Name>,
    material_query: Query<(&Mesh3d, &Name, &Transform)>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    player_body_part_models: Option<Res<PlayerBodyPartModels>>,
    vxm_assets: Res<Assets<VxmAsset>>,
    asset_server: Res<AssetServer>
) {
    if player_body_part_models.is_none() {
        return;
    }

    let player_body_part_models = player_body_part_models.unwrap();

    let body_material = materials.add(StandardMaterial {
        perceptual_roughness: 1.0,
        metallic: 0.0,
        ..Default::default()
    });

    let armoured_material = materials.add(StandardMaterial {
        perceptual_roughness: 0.1,
        metallic: 1.0,
        ..Default::default()
    });

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

            for swap_target in &player_body_part_models.0 {
                let mut is_parent_found: Option<bool> = None;

                if let Some(parent_name) = &swap_target.parent_name {
                    is_parent_found = Some(false);
                    let mut current_parent = parent_query.get(child);
                    while current_parent.is_ok() {
                        let parent_entity = current_parent.unwrap().get();
                        if let Ok(parent_name_component) = name_query.get(parent_entity) {
                            if parent_name_component.as_str().starts_with(parent_name.as_str()) {
                                is_parent_found = Some(true);
                                break;
                            }
                        }
                        current_parent = parent_query.get(parent_entity);
                    }

                }

                if is_parent_found.is_some() && !is_parent_found.unwrap() {
                    continue;
                }

                // For now, if the piece has a parent, we will assume it is armour
                let (scale, material) = if is_parent_found.is_some() {
                    (Vec3::splat(1.001), armoured_material.clone())
                } else {
                    (Vec3::splat(0.999), body_material.clone())
                };

                if name.as_str().starts_with(swap_target.name.as_str()) {
                    let voxels = vxm_assets.get(&swap_target.vxm_handle);
                    if voxels.is_none() {
                        info!("Vxm asset not found for {:?}", swap_target.name);
                        continue;
                    }
                    let replacement_mesh = vxm_mesh::create_mesh_from_voxels(
                        voxels.unwrap(),
                    );
                    mesh_handle = meshes.add(replacement_mesh);
                    let replacement_max_axes = Vec3::new(
                        get_max_on_axis(meshes.get(&mesh_handle).unwrap(), Axis::X),
                        get_max_on_axis(meshes.get(&mesh_handle).unwrap(), Axis::Y),
                        get_max_on_axis(meshes.get(&mesh_handle).unwrap(), Axis::Z),
                    );
                    let max_axes_difference = max_axes - replacement_max_axes;
                    let new_transform = Transform::from_translation(max_axes_difference).
                        mul_transform(Transform::from_scale(scale));

                    // Remove the old mesh and material
                    commands
                        .entity(child)
                        .remove::<MeshMaterial3d<StandardMaterial>>()
                        .remove::<Mesh3d>()
                        .remove::<Transform>()
                        .insert(MeshMaterial3d(material))
                        .insert(Mesh3d(mesh_handle))
                        .insert(new_transform);
                }
            }
        }
        // Mark the scene as processed
        commands.remove_resource::<PlayerBodyPartModels>();
    }
}