use bevy::color::Color;
use bevy::math::Vec3;
use bevy::prelude::{Gizmos, GlobalTransform, Mesh3d, Query, Transform};
use bevy::render::primitives::Aabb;

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
