@group(0) @binding(0) var<uniform> resolution : vec2<u32>;
@group(0) @binding(1) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(3) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(4) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
@group(0) @binding(5) var voxelsSampler : sampler;

// g-buffer
@group(1) @binding(0) var normalTex : texture_2d<f32>;
@group(1) @binding(1) var albedoTex : texture_2d<f32>;
@group(1) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;

override scatterAmount: f32 =5.0;

// TODO: raymarch from surface instead of from camera
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  var pixel = uv * vec2<f32>(resolution);

  let foo = textureLoad(albedoTex, GlobalInvocationID.xy, 0).rgb;
  let normalSample = textureLoad(normalTex, GlobalInvocationID.xy, 0).rgb;
  var averageRayColour = vec3(0.0);
  var totalSamples =2;
  var skyColour = vec3(1.0);

  for(var s = 0; s < totalSamples; s++){
    // TODO: get this from skybox
      var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
      var rayOrigin = cameraPosition;
      var rayColour = skyColour;
      let bounces =3;
      for(var bounce = 0; bounce < bounces; bounce++){
        let rayMarchResult = rayMarch(0, rayOrigin, rayDirection, voxelObjects, voxelsSampler);
        let isValidHit = rayMarchResult.hit && distance(rayMarchResult.worldPos, rayOrigin) > EPSILON;
        if(!isValidHit){
          break;
        }
        var randomDirection = mix(rayMarchResult.normal,randomInHemisphere(uv + f32(s), rayMarchResult.normal),scatterAmount);
       // Catch degenerate scatter direction
        if (all(abs(randomDirection) < vec3(EPSILON))) {
          randomDirection = rayMarchResult.normal;
        }
        rayDirection = -reflect(-rayDirection, randomDirection);
        rayOrigin = rayMarchResult.worldPos + rayMarchResult.normal * 0.001;

        let isBlue = rayMarchResult.colour.b == 1 && rayMarchResult.colour.r == 0 && rayMarchResult.colour.g == 0;
        var surfaceColour = rayMarchResult.colour;
        if(isBlue){
          surfaceColour = vec3(5.0);
        }
        rayColour = rayColour * surfaceColour;
        if(bounce == bounces - 1){
          rayColour = vec3(0.0);
        }
    }
    averageRayColour += rayColour;
  }
  averageRayColour /= f32(totalSamples);

  textureStore(
      outputTex,
      GlobalInvocationID.xy,
      vec4(averageRayColour,1.0),
    );
}

const SAMPLE_RADIUS = 1;
const GAUSSIAN_SIGMA = 1.0;

// Function to calculate the Gaussian weight
fn gaussianWeight(offset: vec2<f32>) -> f32 {
    let exponent = -dot(offset, offset) / (2.0 * GAUSSIAN_SIGMA * GAUSSIAN_SIGMA);
    return exp(exponent) / (2.0 * 3.141592653589793 * GAUSSIAN_SIGMA * GAUSSIAN_SIGMA);
}

@compute @workgroup_size(8, 8, 1)
fn blur(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  var pixel = uv * vec2<f32>(resolution);
  let centerOfPixel = vec2<f32>(pixel) + vec2<f32>(0.5);
  var normalSample = textureLoad(normalTex,GlobalInvocationID.xy, 0).rgb;

  if(all(normalSample == vec3(0.0))) {
    return;
  }

  var outputSample = vec3(0.0);
  var sampleCount = 0.0;


  for(var x = -SAMPLE_RADIUS; x <= SAMPLE_RADIUS; x++) {
    for(var y = -SAMPLE_RADIUS; y <= SAMPLE_RADIUS; y ++) {
      let offset = vec2(f32(x),f32(y));
      let weight = gaussianWeight(offset / f32(SAMPLE_RADIUS));
      let currentPixel = centerOfPixel + offset;
      let currentUV = vec2<f32>(currentPixel) / vec2<f32>(resolution);
      let currentNormal = textureSampleLevel(normalTex,voxelsSampler,currentUV, 0.0).rgb;
      if(all(normalSample == currentNormal)){
        outputSample += weight * textureSampleLevel(albedoTex,voxelsSampler, currentUV, 0.0).rgb;
        sampleCount += weight;
      }
    }
  }

  outputSample /= sampleCount;

  textureStore(
    outputTex,
    vec2<u32>(pixel),
    vec4(outputSample,1.0),
  );
}