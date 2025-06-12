// Texture and sampler.
@group(0) @binding(0) var depth_texture : texture_depth_2d;

const QUAD_VERTICES: array<vec4<f32>, 4> = array(
    vec4<f32>(0.5, 0.5, 0.0, 1.0), // Bottom-left
    vec4<f32>(1.0, 0.5, 0.0, 1.0),  // Bottom-right
    vec4<f32>(0.5, 1.0, 0.0, 1.0),  // Top-left
    vec4<f32>(1.0, 1.0, 0.0, 1.0),   // Top-right
);

const QUAD_UVS: array<vec2<f32>, 4> = array(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
);

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    out.position = QUAD_VERTICES[vertex_index];
    out.uv = QUAD_UVS[vertex_index];
    return out;
}

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let tex_size = textureDimensions(depth_texture);
    let coords = vec2<f32>(uv.x * f32(tex_size.x), uv.y * f32(tex_size.y));
    let depth_value = textureLoad(depth_texture, vec2<i32>(i32(coords.x), i32(coords.y)), 0) % 1.0;
    let color = vec4<f32>(depth_value, depth_value, depth_value, 1.0);

    return color;
}