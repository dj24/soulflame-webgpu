@group(0) @binding(0) var depth : texture_2d<f32>;
@group(0) @binding(1) var outputTex : texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(depth);
    var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
    uv = vec2(uv.x, 1.0 - uv.y);
    let pixel = GlobalInvocationID.xy;
    let depthSample = textureLoad(depth, pixel, 0).a;
    if(depthSample >= 10000.0) {
       textureStore(outputTex, pixel, vec4(uv, 0,1));
    }
}