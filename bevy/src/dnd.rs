use std::io::{ Read};
use bevy::prelude::{EventReader, FileDragAndDrop};
use bevy::prelude::*;
use bevy::{
    asset::{AssetLoader},
    prelude::*,
};
use crate::vxm::VxmAsset;

#[derive(Component)]
struct VoxelObject(Handle<VxmAsset>);

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
                let (graph, animation_index) = AnimationGraph::from_clip(
                    asset_server.load(GltfAssetLabel::Animation(7).from_asset(file_path.clone())),
                );
                let mut player = AnimationPlayer::default();
                player.play(animation_index).repeat();

                commands.spawn((
                    SceneRoot(asset_server.load(
                        GltfAssetLabel::Scene(0).from_asset(file_path.clone()),
                    )),
                    Transform::from_scale(Vec3::new(0.02, 0.02, 0.02)),
                    AnimationGraphHandle(graphs.add(graph))
                ));
            }
        }
    }
}