use bevy::app::{App, Update};
use bevy::color::Color;
use bevy::input::ButtonInput;
use bevy::math::Vec3;
use bevy::prelude::{
    in_state, AppExtStates, Gizmos, GlobalTransform, IntoSystemConfigs, KeyCode, Mesh3d, NextState,
    Plugin, Query, Res, ResMut, State, States, Transform,
};
use bevy::render::primitives::Aabb;

#[derive(States, Debug, Clone, PartialEq, Eq, Hash)]
enum GizmoState {
    Enabled,
    Disabled,
}

impl Default for GizmoState {
    fn default() -> Self {
        GizmoState::Disabled
    }
}

pub fn update_gizmos_state(
    keys: Res<ButtonInput<KeyCode>>,
    state: Res<State<GizmoState>>,
    mut next_state: ResMut<NextState<GizmoState>>,
) {
    if keys.just_pressed(KeyCode::KeyG) {
        match state.get() {
            GizmoState::Enabled => next_state.set(GizmoState::Disabled),
            GizmoState::Disabled => next_state.set(GizmoState::Enabled),
        }
    }
}

pub fn draw_gizmos(mut gizmos: Gizmos, mesh_query: Query<(&GlobalTransform, &Mesh3d, &Aabb)>) {
    for (transform, mesh, aabb) in mesh_query.iter() {
        let position = transform.translation();
        let scale = transform.scale();
        let rotation = transform.rotation();
        let aabb_size = Vec3::from(aabb.max() - aabb.min());
        gizmos.cuboid(
            Transform::from_translation(position)
                .with_rotation(rotation)
                .with_scale(scale * aabb_size),
            Color::srgb(1.0, 0.0, 0.0),
        );
    }
}

pub struct DrawAabbGizmosPlugin;

impl Plugin for DrawAabbGizmosPlugin {
    fn build(&self, app: &mut App) {
        app.init_state::<GizmoState>().add_systems(
            Update,
            (
                update_gizmos_state,
                draw_gizmos.run_if(in_state(GizmoState::Enabled)),
            ),
        );
    }
}
