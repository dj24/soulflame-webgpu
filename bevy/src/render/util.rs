use bevy::math::Mat4;
use bevy::prelude::Projection;
use bevy::render::camera::CameraProjection;

pub fn get_view_projection_matrix(projection: &Projection, transform: &Mat4) -> Mat4 {
    let view_matrix = transform.inverse();
    let projection_matrix = projection.get_clip_from_view();
    projection_matrix * view_matrix
}