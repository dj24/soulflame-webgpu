const SHADOW_ACNE_OFFSET: f32 = 0.0005;

// For now, make yellow-ish colours reflective
fn isReflective(colour: vec3<f32>) -> bool {
  return colour.r > 0.9 && colour.g > 0.7 && colour.b < 0.2;
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  let input = textureLoad(inputTex, pixel, 0);
  let scatterAmount = 0.1;
  if(isReflective(input.rgb)) {
    let normalDirection = textureLoad(normalTex, pixel, 0).rgb;
    let worldPos = textureLoad(worldPosTex, pixel, 0).rgb + normalDirection * SHADOW_ACNE_OFFSET;
    let cameraRayDirection = normalize(worldPos - cameraPosition);
    let reflectionDirection = reflect(cameraRayDirection, normalDirection);
    var r = textureLoad(blueNoiseTex, pixel % 512, 0).xy;
    let scatteredRayDirection = reflectionDirection + randomInHemisphere(r,reflectionDirection) * scatterAmount;
    let rayMarchResult = rayMarchBVH(worldPos, scatteredRayDirection);
    textureStore(outputTex, pixel, vec4(reflectionDirection, 1.0));
  }
  else {
    textureStore(outputTex, pixel, vec4(0.0));
  }
}

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  let inputSample = textureLoad(intermediaryTexture, pixel, 0);
  if(inputSample.a <= 0.0) {
    return;
  }
  textureStore(outputTex, pixel, inputSample);
}