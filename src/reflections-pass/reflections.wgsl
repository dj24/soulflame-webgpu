@group(0) @binding(0) var reflectionsStore : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var skyTex : texture_cube<f32>;
@group(0) @binding(2) var<uniform> resolution : vec2<u32>;
@group(0) @binding(3) var reflectionsTex : texture_2d<f32>;
@group(0) @binding(4) var linearSampler : sampler;
@group(0) @binding(5) var<uniform> frustumCornerDirections : FrustumCornerDirections;

// g-buffer
@group(1) @binding(0) var normalTex : texture_2d<f32>;
@group(1) @binding(1) var albedoTex : texture_2d<f32>;
@group(1) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;

const DOWNSCALE_FACTOR = 2;

struct FrustumCornerDirections {
  topLeft : vec3<f32>,
  topRight : vec3<f32>,
  bottomLeft : vec3<f32>,
  bottomRight : vec3<f32>
}

fn calculateRayDirection(uv: vec2<f32>, directions: FrustumCornerDirections) -> vec3<f32> {
  let topInterpolated = mix(directions.topLeft, directions.topRight, uv.x);
  let bottomInterpolated = mix(directions.bottomLeft, directions.bottomRight, uv.x);
  let finalInterpolated = mix(bottomInterpolated, topInterpolated, uv.y);
  return normalize(finalInterpolated);
}

fn addBasicShading(baseColour: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
  let lightDirection = normalize(vec3(0.5, 1.0, 0.5));
  let cosTheta = max(dot(normal, lightDirection), 0.0);
  let lambertianReflectance = cosTheta * baseColour;
  return mix(baseColour * 1.5,lambertianReflectance, 0.75);
}

@compute @workgroup_size(8, 8, 1)
fn getReflections(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  let downscaledResolution = resolution / DOWNSCALE_FACTOR;
  let pixel = vec2<u32>(GlobalInvocationID.x, downscaledResolution.y - GlobalInvocationID.y);
  let uv = vec2<f32>(pixel) / vec2<f32>(downscaledResolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  let normalSample = textureSampleLevel(normalTex, linearSampler, uv, 0.0).rgb;
  let reflectionDirection = -reflect(normalSample, rayDirection);
  let skySample = textureSampleLevel(skyTex, linearSampler, reflectionDirection, 0.0);
  textureStore(
    reflectionsStore,
    pixel,
    //vec4(uv,0.0,1.0)
    skySample
  );
}

@compute @workgroup_size(8, 8, 1)
fn applyReflections(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  let pixel = vec2<u32>(GlobalInvocationID.x, resolution.y - GlobalInvocationID.y);
  let uv = vec2<f32>(pixel) / vec2<f32>(resolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  let normalSample = textureSampleLevel(normalTex,linearSampler, uv, 0.0).rgb;
  let reflectionsSample = textureSampleLevel(reflectionsTex,linearSampler, uv, 0.0).rgb;
  let albedoSample = textureSampleLevel(albedoTex,linearSampler, uv, 0.0).rgb;
  var outputColor = albedoSample;
  let reflectAmount = 0.75;
  if(any(abs(normalSample) > vec3(0.0))) {
    outputColor = addBasicShading(albedoSample, normalSample) * mix(vec3(1.0), reflectionsSample, reflectAmount);
  }
  textureStore(
    outputTex,
    pixel,
    vec4(outputColor,1.0)
  );
}