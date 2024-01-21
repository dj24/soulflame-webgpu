struct Time {
  frameCount: u32,
  deltaTime: f32,
}

const TARGET_DELTA_TIME: f32 = 16.66;
const MAX_SAMPLES: i32 = 8;
const EPSILON: f32 = 0.00001;

@group(0) @binding(0) var velocityTex : texture_2d<f32>;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var pointSample : sampler;
@group(0) @binding(4) var <uniform>time : Time;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  var velocity = textureLoad(velocityTex, pixel, 0).xy;
  let resolution = textureDimensions(inputTex);
  let centerOfPixel = vec2<f32>(GlobalInvocationID.xy) + vec2<f32>(0.5);
  var uv = centerOfPixel / vec2<f32>(resolution);
  let blurScale = (TARGET_DELTA_TIME / time.deltaTime); // less blur when framerate is high
  let scaledVelocity = velocity * blurScale;
  var samples = MAX_SAMPLES;
  var validSamples = 0.0;
  var result = vec3<f32>(0.0);
  for (var i = 0; i < samples; i++) {
    var offset = scaledVelocity * (f32(i) / f32(samples - 1) - 0.5);
    let offsetUv = uv + offset;
    if(offsetUv.x < 0.0 || offsetUv.x > 1.0 || offsetUv.y < 0.0 || offsetUv.y > 1.0){
      continue;
    }
    let textureSample = textureSampleLevel(inputTex, pointSample, offsetUv, 0.0).rgb;
    result += textureSample;
    validSamples += 1.0;
  }
  result /= validSamples;
  textureStore(outputTex, pixel, vec4(result, 1));
}