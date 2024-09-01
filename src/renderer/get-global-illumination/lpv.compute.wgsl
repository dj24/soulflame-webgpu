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
  let lpvTexDim = vec3<f32>(textureDimensions(lpvTexRead));

  let relativeToCameraPos = worldPos;
  let lpvPos = relativeToCameraPos / LPV_SCALE;

  if(any(lpvPos < vec3(0.0)) || any(lpvPos > vec3(lpvTexDim.z))){
    return;
  }

  let lpvRedUV = lpvPos / lpvTexDim;
  let lpvGreenUV = (lpvPos + vec3(lpvTexDim.z + 1., 0.0, 0.0)) / lpvTexDim;
  let lpvBlueUV = (lpvPos + vec3(lpvTexDim.z * 2. + 2., 0.0, 0.0)) / lpvTexDim;

  let lpvSampleR = textureSampleLevel(lpvTexRead, linearSampler, lpvRedUV, 0.);
  let lpvSampleG = textureSampleLevel(lpvTexRead, linearSampler, lpvGreenUV, 0.);
  let lpvSampleB = textureSampleLevel(lpvTexRead, linearSampler, lpvBlueUV, 0.);

  let normal = textureLoad(normalTex, pixel, 0).xyz;
  let shBasis = SHBasis(normal);
  let lightR = max(0., dot(shBasis, lpvSampleR));
  let lightG = max(0., dot(shBasis, lpvSampleG));
  let lightB = max(0., dot(shBasis, lpvSampleB));

  let light = vec3<f32>(lightR, lightG, lightB);
  let currentColour = textureLoad(currentOutputTexture, pixel, 0).xyz;

  let output = light * currentColour;

  textureStore(outputTex, pixel, vec4<f32>(output, 1.0));
}