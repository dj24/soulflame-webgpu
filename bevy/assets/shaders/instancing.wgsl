#import bevy_pbr::mesh_functions::{get_world_from_local, mesh_position_local_to_clip}

struct Vertex {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
};

struct Instance {
  @location(3) pos_x_extent: u32, // 5+5+5 
  @location(4) color_y_extent: u32,
}

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
};


@group(2) @binding(0) var<uniform> model_matrix: mat4x4<f32>;

@vertex
fn vertex(vertex: Vertex, instance: Instance) -> VertexOutput {
    let unpacked_pos_x_extent = unpack4xU8(instance.pos_x_extent);
    let x_pos = f32(unpacked_pos_x_extent.x);
    let y_pos = f32(unpacked_pos_x_extent.y);
    let z_pos = f32(unpacked_pos_x_extent.z);

    let unpacked_color_y_extent = unpack4xU8(instance.color_y_extent);

    let x_scale = f32(unpacked_pos_x_extent.w);
    let y_scale = f32(unpacked_color_y_extent.w);

    let scale = vec3(x_scale, y_scale, 1.0);
    let local_position = vertex.position * scale + vec3(x_pos,y_pos,z_pos);
    var out: VertexOutput;
    out.clip_position = mesh_position_local_to_clip(model_matrix, vec4<f32>(local_position, 1.0));
    out.color = vec4(vertex.position, 1.0);
    return out;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}