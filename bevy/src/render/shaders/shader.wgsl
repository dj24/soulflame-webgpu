@group(0) @binding(0)
var<uniform> model_view_proj: mat4x4<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) in_vertex_index: u32) -> VertexOutput {
    // Object-space triangle: roughly 1x1 in size, facing -Z
    var positions = array<vec3<f32>, 4>(
        vec3<f32>(-1.0, -1.0, -1.0),
        vec3<f32>(1.0, -1.0, -1.0),
        vec3<f32>(-1.0, 1.0,-1.0),
        vec3<f32>(1.0, 1.0, -1.0)
    );
    let pos = positions[in_vertex_index];  // Object-space position

    var output: VertexOutput;
    output.position = model_view_proj * vec4<f32>(pos, 1.0);  // Transform to clip space
    output.color = vec4<f32>(pos.x * 0.5 + 0.5 , pos.y * 0.5 + 0.5, 0.0, 1.0);  // Red for testing
    return output;
}

@fragment
fn fs_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    return vertex.color;
}