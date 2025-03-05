#import bevy_pbr::mesh_functions::{get_world_from_local, mesh_position_local_to_clip}

struct Vertex {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct Instance {
  @location(3) pos_scale: vec4<f32>,
  @location(4) color: vec4<f32>,
}

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
};


@group(2) @binding(0) var<uniform> model_matrix_0: vec4<f32>;
@group(2) @binding(1) var<uniform> model_matrix_1: vec4<f32>;
@group(2) @binding(2) var<uniform> model_matrix_2: vec4<f32>;
@group(2) @binding(3) var<uniform> model_matrix_3: vec4<f32>;

@vertex
fn vertex(vertex: Vertex, instance: Instance) -> VertexOutput {
  let model_matrix = mat4x4<f32>(
        model_matrix_0,
        model_matrix_1,
        model_matrix_2,
        model_matrix_3,
    );
    let local_position = vertex.position * instance.pos_scale.w + instance.pos_scale.xyz;
    var out: VertexOutput;
    out.clip_position = mesh_position_local_to_clip(model_matrix, vec4<f32>(local_position, 1.0));
    out.color = instance.color;
    return out;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}