@group(0) @binding(0)
var<uniform> model_view_proj: mat4x4<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

struct Instance {
  @location(0) pos_x_extent: u32, // 5+5+5
  @location(1) color_y_extent: u32,
}

const positions = array<vec3<f32>, 4>(
    vec3<f32>(-1.0, -1.0, -1.0),
    vec3<f32>(1.0, -1.0, -1.0),
    vec3<f32>(-1.0, 1.0,-1.0),
    vec3<f32>(1.0, 1.0, -1.0)
);

@vertex
fn vs_main(@builtin(vertex_index) in_vertex_index: u32, instance: Instance) -> VertexOutput {
    let unpacked_pos_x_extent = unpack4xU8(instance.pos_x_extent);
    let x_pos = f32(unpacked_pos_x_extent.x);
    let y_pos = f32(unpacked_pos_x_extent.y);
    let z_pos = f32(unpacked_pos_x_extent.z);

    let unpacked_color_y_extent = unpack4xU8(instance.color_y_extent);

    let x_scale = f32(unpacked_pos_x_extent.w);
    let y_scale = f32(unpacked_color_y_extent.w);

    // For faces pointing in Z direction (front/back), scale X and Y
    var scale = vec3(x_scale, y_scale, 1.0);

    let local_pos = positions[in_vertex_index];
    let pos = local_pos * scale + vec3<f32>(x_pos, y_pos, z_pos);

    var output: VertexOutput;
    output.position = model_view_proj * vec4<f32>(pos, 1.0);  // Transform to clip space
    output.color = vec4<f32>(local_pos.x * 0.5 + 0.5 , local_pos.y * 0.5 + 0.5, 0.0, 1.0);  // Red for testing
    return output;
}

@fragment
fn fs_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    return vertex.color;
}