fn toneMapSDR(color: vec3<f32>) -> vec3<f32> {
  // Simple Reinhard tone mapping
  return color / (vec3(1.0) + color);
}

@group(0) @binding(0) var input_texture: texture_multisampled_2d<f32>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;


@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coords = vec2<u32>(global_id.xy);
    let texture_size = textureDimensions(input_texture);

    if (any(coords >= texture_size.xy)) {
        return;
    }

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

    // Write to output texture
    textureStore(output_texture, coords, vec4<f32>(tone_mapped, 1.0));
}