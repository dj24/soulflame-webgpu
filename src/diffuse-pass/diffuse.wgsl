@group(0) @binding(0) var<uniform> resolution : vec2<u32>;
@group(0) @binding(1) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(3) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(4) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
@group(0) @binding(5) var voxelsSampler : sampler;
@group(0) @binding(6) var diffuseStore : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(7) var<uniform> time : f32;

// g-buffer
@group(1) @binding(0) var normalTex : texture_2d<f32>;
@group(1) @binding(1) var albedoTex : texture_2d<f32>;
@group(1) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(3) var depthTex : texture_2d<f32>;


fn reconstructPosition(cameraPosition: vec3<f32>, rayDirection: vec3<f32>, depth: f32) -> vec3<f32> {
  return cameraPosition + rayDirection * depth;
}

const PI = 3.1415926535897932384626433832795;

// Function to compute Lambertian diffuse reflection
fn lambertianReflectance(normal: vec3<f32>, co: vec2<f32>) -> f32 {
    // Generate a random direction in the hemisphere
    let randomDir : vec3<f32> = randomInHemisphere(co, normal);

    // Lambertian reflectance model
    let cosTheta = dot(randomDir, normal);
    let lambertianTerm = max(cosTheta, 0.0) / PI;

    return lambertianTerm;
}

override reflectance: f32 = 0.5;

// TODO: raymarch from surface instead of from camera
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  let bounces = 2;
  var pixel = uv * vec2<f32>(resolution);

  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  let normalSample = textureLoad(normalTex, GlobalInvocationID.xy, 0).rgb;
  let depthSample = textureLoad(depthTex, GlobalInvocationID.xy, 0).r;
  let worldPos = reconstructPosition(cameraPosition, rayDirection, depthSample);
  var averageRayColour = vec3(0.0);
  var skyColour = vec3(1.0);

  rayDirection = normalSample + randomUnitVector(uv);
  var rayColour = skyColour;
  var rayOrigin = worldPos;

  for(var bounce = 0; bounce < bounces; bounce++){
    let rayMarchResult = rayMarch(0, rayOrigin, rayDirection, voxelObjects, voxelsSampler);
    let isValidHit = rayMarchResult.hit && distance(rayMarchResult.worldPos, rayOrigin) > EPSILON;
    if(!isValidHit){
      var unitDirection = unitVector(rayDirection);
      var attenuation = reflectance * (unitDirection.y + 1.0);
      rayColour = vec3(1.0-attenuation) + attenuation * skyColour;
      break;
    }
    rayDirection = rayMarchResult.normal + randomUnitVector(uv);
    rayOrigin = rayMarchResult.worldPos;
    rayColour = rayColour * (rayMarchResult.colour * reflectance);
  }

  textureStore(
      diffuseStore,
      GlobalInvocationID.xy,
      vec4(rayColour,1.0),
    );
}
