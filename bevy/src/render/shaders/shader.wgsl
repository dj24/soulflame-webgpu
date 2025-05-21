@group(0) @binding(0)
var<uniform> view_proj: mat4x4<f32>;

const IDENTITY: mat4x4<f32> = mat4x4<f32>(
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0
);

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) in_vertex_index: u32) -> VertexOutput {
    let x = f32(i32(in_vertex_index) - 1);
    let y = f32(i32(in_vertex_index & 1u) * 2 - 1);

    var position = vec4<f32>(x, y, 0.0, 1.0);


    position = IDENTITY * position;
    position = view_proj * position;

    var output: VertexOutput;
    output.position = position;
    output.color = vec4<f32>(x, y, 0.5, 1.0);

    return output;
}

@fragment
fn fs_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    return vertex.color;
}