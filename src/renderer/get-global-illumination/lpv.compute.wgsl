// Spherical Harmonics basis functions (L=1)
fn SHBasis(lightDir: vec3<f32>) -> vec4<f32> {
    let sh0 = 0.282095; // Y_0^0 (constant term)
    let sh1 = 0.488603 * lightDir.x; // Y_1^-1
    let sh2 = 0.488603 * lightDir.y; // Y_1^0
    let sh3 = 0.488603 * lightDir.z; // Y_1^1

    return vec4<f32>(sh0, sh1, sh2, sh3);
}


@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>
) {
  let pixel = id.xy;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;
  let lpvTexDim = textureDimensions(lpvTexRead);

  if(distance(worldPos, cameraPosition) > 9999.0){
    return;
  }

  let relativeToCameraPos = worldPos;
  let lpvPos = relativeToCameraPos / LPV_SCALE;

  if(any(lpvPos < vec3(0.0)) || any(lpvPos > vec3(32.0))){
    return;
  }

  let lpvRedUV = vec3(lpvPos.x / 96., lpvPos.y / 32., lpvPos.z / 32.);
  let lpvGreenUV = vec3(lpvPos.x / 96., lpvPos.y / 32., lpvPos.z / 32.) + vec3(1.0 / 3.0, 0.0, 0.0);
  let lpvBlueUV = vec3(lpvPos.x / 96., lpvPos.y / 32., lpvPos.z / 32.) + vec3(2.0 / 3.0, 0.0, 0.0);

  let lpvSampleR = textureSampleLevel(lpvTexRead, linearSampler, lpvRedUV, 0.);
  let lpvSampleG = textureSampleLevel(lpvTexRead, linearSampler, lpvGreenUV, 0.);
  let lpvSampleB = textureSampleLevel(lpvTexRead, linearSampler, lpvBlueUV, 0.);

  let normal = textureLoad(normalTex, pixel, 0).xyz;
  let shBasis = SHBasis(normal);
  let lightR = max(0., dot(shBasis, lpvSampleR));
  let lightG = max(0., dot(shBasis, lpvSampleG));
  let lightB = max(0., dot(shBasis, lpvSampleB));


  //TODO: multiply by input sample
  textureStore(outputTex, pixel, vec4<f32>(lightR, lightG, lightB, 1.0));
}