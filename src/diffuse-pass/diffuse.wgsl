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
  let pixel = vec2(GlobalInvocationID.x, resolution.y - GlobalInvocationID.y);
  let uv = vec2<f32>(pixel) / vec2<f32>(resolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var rayOrigin = cameraPosition;
  let foo = textureLoad(albedoTex, pixel, 0).rgb;
  let normal = textureLoad(normalTex, pixel, 0).rgb;

  var rayColour = vec3(1.0);
  for(var i = 0; i < 2; i++){
    let rayMarchResult = rayMarch(0, rayOrigin, rayDirection, voxelObjects, voxelsSampler);
    if(!rayMarchResult.hit){
      if(i == 0){
        rayColour = vec3(0.0);
      }
      break;
    }
    rayOrigin = rayMarchResult.worldPos;
    rayDirection = reflect(-rayDirection, rayMarchResult.normal);
    rayColour *= 0.5 * rayMarchResult.colour;
    if(i == 1){
      rayColour = vec3(1,0,1);
    } else{
      rayColour = foo;
    }
  }

  textureStore(
      outputTex,
      pixel,
      vec4(rayColour,1.0),
    );
}