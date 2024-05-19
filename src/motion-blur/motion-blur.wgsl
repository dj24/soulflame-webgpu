const TARGET_DELTA_TIME: f32 = 16.66;
const MAX_SAMPLES: i32 = 8;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  var velocity = textureLoad(velocityAndWaterTex, pixel, 0).xy;
  let resolution = textureDimensions(inputTex);
  let centerOfPixel = vec2<f32>(GlobalInvocationID.xy) + vec2<f32>(0.5);
  var uv = centerOfPixel / vec2<f32>(resolution);
  let blurScale = (TARGET_DELTA_TIME / time.deltaTime); // less blur when framerate is high
  let scaledVelocity = velocity * blurScale;
  var samples = MAX_SAMPLES;
  var validSamples = 0.0;
  var result = vec4<f32>(0.0);
  for (var i = 0; i < samples; i++) {
    var offset = scaledVelocity * (f32(i) / f32(samples - 1) - 0.5);
    let offsetUv = uv + offset;
    let textureSample = textureSampleLevel(inputTex, nearestSampler, offsetUv, 0.0);
    result += textureSample;
    validSamples += 1.0;
  }
  result /= validSamples;
  textureStore(outputTex, pixel, result);
}