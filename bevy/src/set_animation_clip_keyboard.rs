use crate::dnd::Animations;
use bevy::prelude::*;
use std::time::Duration;

#[derive(States, Debug, Clone, PartialEq, Eq, Hash)]
enum AnimationClipState {
    AnimationClip0,
    AnimationClip1,
    AnimationClip2,
    AnimationClip3,
    AnimationClip4,
    AnimationClip5,
    AnimationClip6,
    AnimationClip7,
    AnimationClip8,
    AnimationClip9,
}

impl Default for AnimationClipState {
    fn default() -> Self {
        AnimationClipState::AnimationClip0
    }
}

pub fn set_animation_clip_keyboard(
    mut commands: Commands,
    animations: Res<Animations>,
    mut players: Query<(Entity, &mut AnimationPlayer), Added<AnimationPlayer>>,
    state: Res<State<AnimationClipState>>,
) {
    let animation_index = match state.get() {
        AnimationClipState::AnimationClip0 => 0,
        AnimationClipState::AnimationClip1 => 1,
        AnimationClipState::AnimationClip2 => 2,
        AnimationClipState::AnimationClip3 => 3,
        AnimationClipState::AnimationClip4 => 4,
        AnimationClipState::AnimationClip5 => 5,
        AnimationClipState::AnimationClip6 => 6,
        AnimationClipState::AnimationClip7 => 7,
        AnimationClipState::AnimationClip8 => 8,
        AnimationClipState::AnimationClip9 => 9,
    };
    for (entity, mut player) in &mut players {
        let mut transitions = AnimationTransitions::new();
        transitions
            .play(
                &mut player,
                animations.animations[animation_index],
                Duration::ZERO,
            )
            .repeat()
            .set_speed(1.);
        commands
            .entity(entity)
            .insert(AnimationGraphHandle(animations.graph.clone()))
            .insert(transitions);
    }
}

pub struct SetAnimationClipPlugin;

impl Plugin for SetAnimationClipPlugin {
    fn build(&self, app: &mut App) {
        app.init_state::<AnimationClipState>().add_systems(
            OnEnter(AnimationClipState::AnimationClip0),
            set_animation_clip_keyboard,
        );
    }
}
