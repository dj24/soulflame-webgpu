use bevy::prelude::*;

pub fn set_animation_clip_keyboard(
    mut animation_graphs: ResMut<Assets<AnimationGraph>>,
    keys: Res<ButtonInput<KeyCode>>,
) {
}
