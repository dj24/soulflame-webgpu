use crate::dnd::Animations;
use bevy::prelude::*;

fn set_animation_clip_by_keypress(
    keys: Res<ButtonInput<KeyCode>>,
    animations: Res<Animations>,
    mut players: Query<&mut AnimationPlayer>,
) {
    for (key, index) in [
        (KeyCode::Digit0, 0),
        (KeyCode::Digit1, 1),
        (KeyCode::Digit2, 2),
        (KeyCode::Digit3, 3),
        (KeyCode::Digit4, 4),
        (KeyCode::Digit5, 5),
        (KeyCode::Digit6, 6),
        (KeyCode::Digit7, 7),
        (KeyCode::Digit8, 8),
        (KeyCode::Digit9, 9),
    ] {
        if keys.just_pressed(key) {
            for mut animation_player in players.iter_mut() {
                animation_player.stop_all();
                animation_player.play(animations.animations[index]).repeat();
            }
        }
    }
}

pub struct SetAnimationClipPlugin;

impl Plugin for SetAnimationClipPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, set_animation_clip_by_keypress);
    }
}
