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


// TODO: raymarch from surface instead of from camera
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  var pixel = uv * vec2<f32>(resolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var rayOrigin = cameraPosition;
  let foo = textureLoad(albedoTex, GlobalInvocationID.xy, 0).rgb;
  let normal = textureLoad(normalTex, GlobalInvocationID.xy, 0).rgb;

// TODO: get this from skybox
  var skyColour = vec3(0.4,0.7, 1.0);
  var rayColour = skyColour * 3.0;
  let iterations =2;
  for(var i = 0; i < iterations; i++){
    let rayMarchResult = rayMarch(0, rayOrigin, rayDirection, voxelObjects, voxelsSampler);

    let isValidHit = rayMarchResult.hit && distance(rayMarchResult.worldPos, rayOrigin) > EPSILON;

    if(!isValidHit){
      if(i == 0){
        rayColour = skyColour;
      }
      rayColour = vec3(0.0);
      break;
    }
    let scatterAmount = 0.3;
    let randomDirection = mix(rayMarchResult.normal,randomInHemisphere(uv, rayMarchResult.normal),scatterAmount);
    rayDirection = -reflect(-rayDirection, randomDirection);
    rayOrigin = rayMarchResult.worldPos + rayMarchResult.normal * 0.001;

    let isBlue = rayMarchResult.colour.b == 1 && rayMarchResult.colour.r == 0 && rayMarchResult.colour.g == 0;
    let rayEnergy = 0.5;

    rayColour = rayColour * rayMarchResult.colour * rayEnergy;
  }

  textureStore(
      outputTex,
      GlobalInvocationID.xy,
      vec4(rayColour,1.0),
    );
}