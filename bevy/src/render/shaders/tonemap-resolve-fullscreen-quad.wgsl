@group(0) @binding(0) var input_texture: texture_multisampled_2d<f32>;
@group(0) @binding(1) var lut_texture: texture_3d<f32>;
@group(0) @binding(2) var lut_sampler: sampler;

const QUAD_VERTICES: array<vec4<f32>, 4> = array(
    vec4<f32>(-1.0, -1.0, 0.0, 1.0), // Bottom-left
    vec4<f32>(1.0, -1.0, 0.0, 1.0),  // Bottom-right
    vec4<f32>(-1.0, 1.0, 0.0, 1.0),  // Top-left
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

fn toneMapSDR(color: vec3<f32>) -> vec3<f32> {
  // Simple Reinhard tone mapping
  return color / (vec3(1.0) + color);
}

fn applyLUT(color: vec3<f32>) -> vec3<f32> {
    // Clamp color values to [0, 1] range
    let clamped_color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));

    // Sample the LUT using the normalized RGB values as UVW coordinates
    let lut_color = textureSample(lut_texture, lut_sampler, clamped_color);

    return lut_color.rgb;
}

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let texture_size = textureDimensions(input_texture);

    let coords = vec2<u32>(
        u32(uv.x * f32(texture_size.x)),
        u32(uv.y * f32(texture_size.y))
    );

    let input_sample_0 = textureLoad(input_texture, coords, 0);
    let input_sample_1 = textureLoad(input_texture, coords, 1);
    let input_sample_2 = textureLoad(input_texture, coords, 2);
    let input_sample_3 = textureLoad(input_texture, coords, 3);

    let tonemapped_0 = toneMapSDR(input_sample_0.rgb);
    let tonemapped_1 = toneMapSDR(input_sample_1.rgb);
    let tonemapped_2 = toneMapSDR(input_sample_2.rgb);
    let tonemapped_3 = toneMapSDR(input_sample_3.rgb);

    // Average the tone-mapped samples
    let tone_mapped = (tonemapped_0 + tonemapped_1 + tonemapped_2 + tonemapped_3) / 4.0;

    // Apply LUT color grading
    let final_color = applyLUT(tone_mapped);

    return vec4<f32>(final_color, 1.0);
}