use crate::camera::CameraTarget;
use crate::dnd::Animations;
use crate::replace_body_part_meshes::{ChestModels, PlayerBodyPartModels};
use bevy::asset::{AssetServer, Assets};
use bevy::gltf::GltfAssetLabel;
use bevy::math::Vec3;
use bevy::prelude::{
    AnimationGraph, AnimationGraphHandle, Commands, Res, ResMut, SceneRoot, Transform,
};

const PLAYER_GLB_PATH: &str = "meshes/BearRace.glb";

pub fn spawn_player(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
) {
    let (graph, node_indices) = AnimationGraph::from_clips([
        asset_server.load(GltfAssetLabel::Animation(0).from_asset(PLAYER_GLB_PATH)),
        asset_server.load(GltfAssetLabel::Animation(1).from_asset(PLAYER_GLB_PATH)),
        asset_server.load(GltfAssetLabel::Animation(2).from_asset(PLAYER_GLB_PATH)),
        asset_server.load(GltfAssetLabel::Animation(3).from_asset(PLAYER_GLB_PATH)),
        asset_server.load(GltfAssetLabel::Animation(4).from_asset(PLAYER_GLB_PATH)),
        asset_server.load(GltfAssetLabel::Animation(5).from_asset(PLAYER_GLB_PATH)),
        asset_server.load(GltfAssetLabel::Animation(6).from_asset(PLAYER_GLB_PATH)),
        asset_server.load(GltfAssetLabel::Animation(7).from_asset(PLAYER_GLB_PATH)),
        asset_server.load(GltfAssetLabel::Animation(8).from_asset(PLAYER_GLB_PATH)),
    ]);
    let player_graph_handle = graphs.add(graph);
    commands.insert_resource(Animations {
        animations: node_indices,
        graph: player_graph_handle.clone(),
    });
    commands.init_resource::<PlayerBodyPartModels>();
    commands.spawn((
        SceneRoot(asset_server.load(GltfAssetLabel::Scene(0).from_asset(PLAYER_GLB_PATH))),
        Transform::from_scale(Vec3::splat(0.2)).with_translation(Vec3::new(0.0, 150.0, 0.0)),
        AnimationGraphHandle(player_graph_handle.clone()),
        CameraTarget(Vec3::new(0.0, 4.0, 0.0)),
    ));
}
