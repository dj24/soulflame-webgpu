#import bevy_pbr::{
    mesh_functions,
    view_transformations::position_world_to_clip,
}

#import bevy_pbr::{
    pbr_deferred_functions::deferred_output,
}

// The GPU-side vertex structure.
struct Vertex {
    // The world-space position of the vertex.
    @location(0) position: vec3<f32>,
    // The color of the vertex.
    @location(1) color: vec3<f32>,
    @builtin(instance_index) instance_index: u32,
};

// Information passed from the vertex shader to the fragment shader.
struct VertexOutput {
    // The clip-space position of the vertex.
    @builtin(position) clip_position: vec4<f32>,
    // The color of the vertex.
    @location(0) color: vec3<f32>,
};

const identity_mat: mat4x4<f32> = mat4x4<f32>(
    vec4<f32>(1.0, 0.0, 0.0, 0.0),
    vec4<f32>(0.0, 1.0, 0.0, 0.0),
    vec4<f32>(0.0, 0.0, 1.0, 0.0),
    vec4<f32>(0.0, 0.0, 0.0, 1.0),
);

// The vertex shader entry point.
@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
    // Use an orthographic projection.
    var vertex_output: VertexOutput;
//    var world_from_local = identity_mat * vec4(vertex.position, 1.0);
//    let world_position = mesh_functions::mesh_position_local_to_world(world_from_local, vec4<f32>(vertex.position, 1.0));
//    vertex_output.clip_position = position_world_to_clip(world_position.xyz);
    vertex_output.clip_position = identity_mat * vec4(vertex.position, 1.0);
    vertex_output.color = vertex.color;
    return vertex_output;
}

// The fragment shader entry point.
@fragment
fn fragment(vertex_output: VertexOutput) -> @location(0) vec4<f32> {
    return vec4(vertex_output.color, 1.0);
}