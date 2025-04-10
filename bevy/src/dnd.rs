use crate::vxm::VxmAsset;
use bevy::prelude::*;
use bevy::prelude::{EventReader, FileDragAndDrop};

#[derive(Component)]
pub struct PendingVxm(pub Handle<VxmAsset>);

#[derive(Resource)]
pub struct Animations {
    pub(crate) animations: Vec<AnimationNodeIndex>,
    pub(crate) graph: Handle<AnimationGraph>,
}

pub fn file_drag_and_drop_system(
    mut dnd_events: EventReader<FileDragAndDrop>,
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    for event in dnd_events.read() {
        info!("Dropped file: {:?}", event);
        if let FileDragAndDrop::DroppedFile { window, path_buf } = event {
            let file_path = path_buf.to_str().unwrap().to_string();
            info!("Dropped file: {:?}", &file_path);
            if file_path.ends_with(".vxm") {
                info!("dropped vxm file");
                commands.spawn((
                    PendingVxm(asset_server.load(file_path.clone())),
                    Transform::from_scale(Vec3::new(0.02, 0.02, 0.02)),
                ));
            }
            if file_path.ends_with(".glb") {
                info!(file_path);
                let (graph, node_indices) =
                    AnimationGraph::from_clips([asset_server
                        .load(GltfAssetLabel::Animation(7).from_asset(file_path.clone()))]);
                let graph_handle = graphs.add(graph);
                commands.insert_resource(Animations {
                    animations: node_indices,
                    graph: graph_handle.clone(),
                });
                commands.spawn((
                    SceneRoot(
                        asset_server.load(GltfAssetLabel::Scene(0).from_asset(file_path.clone())),
                    ),
                    Transform::from_scale(Vec3::new(0.02, 0.02, 0.02)),
                    AnimationGraphHandle(graph_handle.clone()),
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
    mut players: Query<(Entity, &mut AnimationPlayer), Added<AnimationPlayer>>,
) {
    for (entity, _) in &mut players {
        commands
            .entity(entity)
            .insert(AnimationGraphHandle(animations.graph.clone()));
    }
}
