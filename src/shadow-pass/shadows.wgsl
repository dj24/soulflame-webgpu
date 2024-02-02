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
const SAMPLE_COUNT = 1;
const SUN_COLOR = vec3<f32>(1.0, 1.0, 1.0);

fn blinnPhong(normal: vec3<f32>, lightDirection: vec3<f32>, viewDirection: vec3<f32>, specularStrength: f32, shininess: f32, lightColour: vec3<f32>) -> vec3<f32> {
  let halfDirection = normalize(lightDirection + viewDirection);
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let specular = pow(max(dot(normal, halfDirection), 0.0), shininess);
  return (diffuse + specular * specularStrength) * lightColour;
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let samplePixel = GlobalInvocationID.xy * DOWNSCALE;
  let outputPixel = GlobalInvocationID.xy;
  let uv = vec2<f32>(outputPixel) / vec2<f32>(textureDimensions(depthTex));
  var normalSample = textureLoad(normalTex, samplePixel, 0).rgb;
  let randomCo = vec2<f32>(samplePixel);
  let scatterAmount = 0.05;
  var total = vec3(0.0);
  var count = 0.0;

  for(var i = 0; i < SAMPLE_COUNT; i++){
    var lightColour = SUN_COLOR;
    var shadowRayDirection = -sunDirection + randomInHemisphere(randomCo + vec2(f32(i),0), -sunDirection) * scatterAmount;
    let worldPos = textureLoad(depthTex, samplePixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
    let r = textureLoad(blueNoiseTex, outputPixel % 512, 0).r;
    if(r < 0.5){
      shadowRayDirection.z *= -1.0;
      lightColour = vec3(1,0,1);
    }
    if(shadowRay(worldPos, shadowRayDirection)){
      total += vec3(0.0);
    } else{
      let rayDirection = normalize(worldPos - cameraPosition);
      total += blinnPhong(normalSample, shadowRayDirection, rayDirection, 0.5, 80.0, lightColour);
    }
    count += 1.0;
  }

  let shadowAmount = total / count;
  textureStore(outputTex, outputPixel, vec4(shadowAmount, 1.0));
}

const AMBIENT_STRENGTH = 0.1;

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = vec2<f32>(textureDimensions(outputTex));
  let pixel = GlobalInvocationID.xy;
  let uv = vec2<f32>(pixel) / texSize;
//  let shadowAmount = 1.0 - textureSampleLevel(intermediaryTexture, linearSampler, uv, 0.0);
  let inputSample = textureLoad(inputTex, pixel, 0);
  let depthRef = textureLoad(depthTex, pixel, 0).a;
  let normalRef = textureLoad(normalTex, pixel, 0).rgb;
  var total = vec3(0.0);
  var count = 0.0;

  for(var i = 0; i < DOWNSCALE; i+= 1) {
    for(var j = 0; j < DOWNSCALE; j += 1) {
      let offset = vec2(f32(i), f32(j)) / texSize;
      let shadowSample = textureSampleLevel(intermediaryTexture, linearSampler, uv + offset, 0.0).rgb;
      let depthSample = textureLoad(depthTex, vec2<i32>(pixel) + vec2(i, j), 0).a;
      let normalSample = textureLoad(normalTex, vec2<i32>(pixel) + vec2(i, j), 0).rgb;
      // bilateral blur
      let gaussianWeight = exp(-(f32(i * i) + f32(j * j)) * 0.01);
      let normalDifference = dot(normalSample, normalRef);
      let normalWeight = 1.0 - exp(-normalDifference * normalDifference * 10.0);
      total += shadowSample * normalWeight * gaussianWeight;
      count += normalWeight * gaussianWeight;
    }
  }
  total /= count;
  textureStore(outputTex, pixel, inputSample * vec4(total,1));
}