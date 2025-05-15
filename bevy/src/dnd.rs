use crate::vxm::VxmAsset;
use bevy::prelude::*;

#[derive(Component)]
pub struct PendingVxm(pub Handle<VxmAsset>);

#[derive(Resource)]
pub struct Animations {
    pub(crate) animations: Vec<AnimationNodeIndex>,
    pub(crate) graph: Handle<AnimationGraph>,
}