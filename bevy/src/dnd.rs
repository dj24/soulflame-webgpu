use bevy::prelude::*;

#[derive(Resource)]
pub struct Animations {
    pub(crate) animations: Vec<AnimationNodeIndex>,
    pub(crate) graph: Handle<AnimationGraph>,
}