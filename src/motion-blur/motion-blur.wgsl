struct Time {
  frameCount: u32,
  deltaTime: f32,
}

const TARGET_DELTA_TIME: f32 = 16.66;
const MAX_SAMPLES: i32 = 8;

@group(0) @binding(0) var velocityTex : texture_2d<f32>;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var linearSampler : sampler;
@group(0) @binding(4) var <uniform>time : Time;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  var uv = vec2<f32>(pixel) / vec2<f32>(textureDimensions(inputTex));
  var result = textureLoad(inputTex, pixel, 0);
  var velocity = textureLoad(velocityTex, pixel, 0).xy;
  let blurScale = (TARGET_DELTA_TIME / time.deltaTime) * 0.4; // less blur when framerate is high
  let scaledVelocity = velocity * blurScale;
  let velocityLength = length(scaledVelocity);
  if(velocityLength <= 0.0 || result.a <= 0.0){
    return;
  }
  var samples = MAX_SAMPLES;
  var validSamples = 0;
  for (var i = 0; i < samples; i++) {
    var offset = scaledVelocity * (f32(i) / f32(samples - 1) - 0.5);
    let offsetUv = clamp(uv + offset, vec2(0.0), vec2(1.0));
    let textureSample = textureSampleLevel(inputTex, linearSampler, offsetUv, 0.0);
    result += textureSample;
    validSamples++;
  }
  if(validSamples > 0){
    result /= f32(validSamples);
  }
  textureStore(outputTex, pixel, result);

}