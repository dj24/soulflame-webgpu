fn project(vp: mat4x4<f32>, p: vec3<f32>) -> vec3<f32> {
  let clipSpaceVertex = vp * vec4(p,1.0);
  var ndc = clipSpaceVertex.xyz / clipSpaceVertex.w;
  ndc = clamp(ndc, vec3<f32>(-1.0), vec3<f32>(1.0));
  var uv = (ndc.xy + vec2<f32>(1.0)) / vec2<f32>(2.0);
  uv.y = 1.0 - uv.y;
  uv.x = 1.0 - uv.x;
  return vec3<f32>(uv, clipSpaceVertex.z);
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let samplePixel = GlobalInvocationID.xy * DOWNSCALE;
  let outputPixel = GlobalInvocationID.xy;
  var isWater = textureLoad(velocityAndWaterTex, samplePixel, 0).a > 0.0001;
  var depthSample = textureLoad(depthTex, samplePixel, 0);

//  if(depthSample.a >= FAR_PLANE){
//      textureStore(outputTex, outputPixel, vec4(0.0));
//      return;
//  }
//
//  if(!isWater){
//    textureStore(outputTex, outputPixel, vec4(0.0));
//    return;
//  }

  let resolution = vec2<f32>(textureDimensions(depthTex));
  let downscaledResolution = vec2<u32>(vec2<f32>(resolution) / DOWNSCALE);
  let centerOfPixel = vec2<f32>(outputPixel) + vec2<f32>(0.5);
  let uv = vec2<f32>(outputPixel) / resolution;
  var normalSample = textureLoad(normalTex, samplePixel, 0).rgb;
  var rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  var reflectionDir = normalize(reflect(rayDirection, normalSample));

  var worldPos = depthSample.rgb;
  let depthRef = depthSample.a;

  let rayOrigin = worldPos;
  let rayStepLength = 8.0;
  let rayStep = vec3(reflectionDir.x, reflectionDir.y, reflectionDir.z) * rayStepLength;

  var reflectedColour = vec3(0.0);

  for(var i = 0; i < 16; i++){
    worldPos += rayStep;
    let projectedUv = project(viewProjections.viewProjection, worldPos).xy;
    let projectedPixel = vec2<u32>(projectedUv * resolution);
    depthSample = textureLoad(depthTex, projectedPixel, 0);
    if(depthSample.a < depthRef){
      reflectedColour = textureLoad(inputTex, projectedPixel, 0).rgb;
      textureStore(outputTex, outputPixel, vec4(reflectedColour * 0.75, 1));
//      return;
    }
  }

  let skyColour = vec3(0.2,0.7,1);
  let projectedUv = project(viewProjections.viewProjection, rayOrigin).xy;
  let projectedPixel = vec2<u32>(projectedUv * resolution);
  let projectedSample = textureLoad(inputTex, projectedPixel, 0).rgb;
  textureStore(outputTex, outputPixel, vec4(projectedSample, 1));
//  textureStore(outputTex, outputPixel, vec4(abs(rayOrigin) % 1.0, 1));
//  TODO: add view matrix to struct
//  let viewSpaceNormal = normalize((transpose(viewProjections.view) * vec4(normal, 0.0)).xyz);
  textureStore(outputTex, outputPixel, vec4(normalSample, 1));
}

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  let inputSample = textureLoad(inputTex, pixel, 0);
  let waterSample = textureLoad(intermediaryTexture, pixel, 0);
  if(waterSample.a > 0.0001){
    textureStore(outputTex, pixel, waterSample);
  } else{
    textureStore(outputTex, pixel, inputSample);
  }

}