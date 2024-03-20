const SHADOW_ACNE_OFFSET: f32 = 0.0005;
const SKY_COLOUR: vec3<f32> = vec3<f32>(0.6, 0.8, 0.9);

// For now, make yellow-ish colours reflective
fn isReflective(colour: vec3<f32>) -> bool {
  return colour.r > 0.3 && colour.g > 0.3 && colour.b < 0.2;
}

fn reflectionAmount(normal: vec3<f32>, cameraRayDirection: vec3<f32>) -> f32 {
  return dot(normal, -cameraRayDirection);
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  let input = textureLoad(inputTex, pixel, 0);
  let scatterAmount = 0.02;
  if(isReflective(input.rgb)) {
    let normalDirection = textureLoad(normalTex, pixel, 0).rgb;
    let worldPos = textureLoad(worldPosTex, pixel, 0).rgb + normalDirection * SHADOW_ACNE_OFFSET;
    let cameraRayDirection = normalize(worldPos - cameraPosition);
    var r = textureLoad(blueNoiseTex, pixel % 512, 0).xy;
    var scatteredNormal = mix(normalDirection,randomInHemisphere(r, normalDirection),scatterAmount);
    var reflectionDirection = reflect(cameraRayDirection, scatteredNormal);
    var rayMarchResult = rayMarchBVH(worldPos, reflectionDirection);
    var reflectedColour = SKY_COLOUR;
    if(rayMarchResult.hit){
      reflectedColour = rayMarchResult.colour;
//      if(isReflective(reflectedColour)) {
//        reflectedColour = vec3(1,0,0);
//        scatteredNormal = mix(rayMarchResult.normal,randomInHemisphere(r, rayMarchResult.normal),scatterAmount);
//        reflectionDirection = reflect(reflectionDirection, rayMarchResult.normal);
//        rayMarchResult = rayMarchBVH(rayMarchResult.worldPos + rayMarchResult.normal * SHADOW_ACNE_OFFSET, reflectionDirection);
////        if(rayMarchResult.hit){
////          reflectedColour = rayMarchResult.colour;
////        }
//      }
    }
    let ouputColour = mix(input.rgb, reflectedColour * input.rgb,  reflectionAmount(normalDirection, cameraRayDirection));
    textureStore(outputTex, pixel, vec4(ouputColour, 1.0));
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