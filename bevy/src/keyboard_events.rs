use bevy::prelude::*;
use std::collections::HashSet;
use winit::keyboard;

#[derive(Event)]
pub struct KeyPressedEvent(pub keyboard::Key);

#[derive(Event)]
pub struct KeyReleasedEvent(pub keyboard::Key);

#[derive(Resource)]
pub struct KeyboardInput {
    pub pressed_keys: HashSet<keyboard::Key>,
    pub just_pressed_keys: HashSet<keyboard::Key>,
    pub just_released_keys: HashSet<keyboard::Key>,
}

impl Default for KeyboardInput {
    fn default() -> Self {
        Self {
            pressed_keys: HashSet::new(),
            just_pressed_keys: HashSet::new(),
            just_released_keys: HashSet::new(),
        }
    }
}

fn update_keyboard_input(
    mut keyboard_input: ResMut<KeyboardInput>,
    mut key_pressed_events: EventReader<KeyPressedEvent>,
    mut key_released_events: EventReader<KeyReleasedEvent>,
) {
    keyboard_input.just_pressed_keys.clear();
    keyboard_input.just_released_keys.clear();

    for event in key_pressed_events.read() {
        keyboard_input.pressed_keys.insert(event.0.clone());
        if !keyboard_input.just_pressed_keys.contains(&event.0) {
            keyboard_input.just_pressed_keys.insert(event.0.clone());
        }
    }

    for event in key_released_events.read() {
        keyboard_input.pressed_keys.remove(&event.0);
        if !keyboard_input.just_released_keys.contains(&event.0) {
            keyboard_input.just_released_keys.insert(event.0.clone());
        }
    }
}

pub struct KeyboardEventsPlugin;

impl Plugin for KeyboardEventsPlugin {
    fn build(&self, app: &mut App) {
        app.add_event::<KeyPressedEvent>()
            .add_event::<KeyReleasedEvent>()
            .init_resource::<KeyboardInput>()
            .add_systems(Update, update_keyboard_input);
    }
}
