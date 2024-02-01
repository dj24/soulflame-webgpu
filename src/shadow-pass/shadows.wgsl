const SUN_DIRECTION: vec3<f32> = vec3<f32>(1.0,-1.0,-1.0);
const SHADOW_ACNE_OFFSET: f32 = 0.0005;

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
  for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
      let voxelObject = voxelObjects[i];
      if(any(voxelObject.size == vec3(0.0))){
        continue;
      }
      var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(worldPos, 1.0)).xyz;
      let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(shadowRayDirection, 0.0)).xyz;
      let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
      let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size);
      if(!intersect.isHit && !isInBounds) {
        continue;
      }
      // Advance ray origin to the point of intersection
      if(!isInBounds){
        objectRayOrigin = objectRayOrigin + objectRayDirection * intersect.tNear + EPSILON;
      }
      let output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
      if(output.hit){
        return true;
      }
  }
  return false;
}


// TODO: render at half res and increase samples
// 2 samples at full res = 8 samples at half res
const SAMPLE_COUNT = 4;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let samplePixel = GlobalInvocationID.xy * DOWNSCALE;
  let outputPixel = GlobalInvocationID.xy;
  var normalSample = textureLoad(normalTex, samplePixel, 0).rgb;
  let randomCo = vec2<f32>(samplePixel);
  let scatterAmount = 0.05;
  var totalShadow = 0.0;
  var count = 0.0;

  for(var i = 0; i < SAMPLE_COUNT; i++){
    let shadowRayDirection = -sunDirection + randomInHemisphere(randomCo + vec2(f32(i),0), -sunDirection) * scatterAmount;
    let worldPos = textureLoad(depthTex, samplePixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
    if(shadowRay(worldPos, shadowRayDirection)){
      totalShadow += 1.0;
    }
    count += 1.0;
  }

  let shadowAmount = totalShadow / count;
  textureStore(outputTex, outputPixel, vec4(mix(1.0, 0.0, shadowAmount)));
}


@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = vec2<f32>(textureDimensions(outputTex));
  let pixel = GlobalInvocationID.xy;
  let uv = (vec2<f32>(pixel) + vec2(0.5)) / texSize;
  let shadowAmount = 1.0 - textureSampleLevel(intermediaryTexture, linearSampler, uv, 0.0);
  let inputSample = textureLoad(inputTex, pixel, 0);
  textureStore(outputTex, pixel, mix(inputSample, vec4(0.0),shadowAmount.a));
}