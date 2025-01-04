use std::io::{ Read};
use std::time::Duration;
use bevy::prelude::{EventReader, FileDragAndDrop};
use bevy::prelude::*;
use bevy::{
    asset::{AssetLoader},
    prelude::*,
};
use crate::vxm::VxmAsset;

#[derive(Component)]
struct VoxelObject(Handle<VxmAsset>);

#[derive(Resource)]
pub struct Animations {
    animations: Vec<AnimationNodeIndex>,
    graph: Handle<AnimationGraph>,
}

pub fn file_drag_and_drop_system(
    mut events: EventReader<FileDragAndDrop>,
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    for event in events.read() {
        if let FileDragAndDrop::DroppedFile { window, path_buf } = event {
            let mut file_path = path_buf.to_str().unwrap().to_string();
            if file_path.ends_with(".vxm") {
                let voxels: Handle<VxmAsset> = asset_server.load(&file_path);
                commands.spawn(
                    VoxelObject(voxels),
                );
            }
            if file_path.ends_with(".glb"){
                // Build the animation graph
                let (graph, node_indices) = AnimationGraph::from_clips([
                    asset_server.load(GltfAssetLabel::Animation(7).from_asset(file_path.clone())),
                ]);

                // Insert a resource with the current scene information
                let graph_handle = graphs.add(graph);
                commands.insert_resource(Animations {
                    animations: node_indices,
                    graph: graph_handle.clone(),
                });

                commands.spawn((
                    SceneRoot(asset_server.load(
                        GltfAssetLabel::Scene(0).from_asset(file_path.clone()),
                    )),
                    Transform::from_scale(Vec3::new(0.02, 0.02, 0.02)),
                    AnimationGraphHandle(graph_handle.clone())
                ));
            }
        }
    }
}

// An `AnimationPlayer` is automatically added to the scene when it's ready.
// When the player is added, start the animation.
pub fn setup_scene_once_loaded(
    mut commands: Commands,
    animations: Res<Animations>,
    graphs: Res<Assets<AnimationGraph>>,
    mut clips: ResMut<Assets<AnimationClip>>,
    mut players: Query<(Entity, &mut AnimationPlayer), Added<AnimationPlayer>>,
) {
    for (entity, mut player) in &mut players {
        let graph = graphs.get(&animations.graph).unwrap();
        let mut transitions = AnimationTransitions::new();
        transitions
            .play(&mut player, animations.animations[0], Duration::ZERO)
            .repeat();
        commands
            .entity(entity)
            .insert(AnimationGraphHandle(animations.graph.clone()))
            .insert(transitions);
    }
}