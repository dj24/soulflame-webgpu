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
  let pixel = GlobalInvocationID.xy;
  let uv = vec2<f32>(pixel) / vec2<f32>(resolution);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var rayOrigin = cameraPosition;

  var rayColour = vec3(1.0);
  for(var i = 0; i < 8; i++){
    let rayMarchResult = rayMarch(0, rayOrigin, rayDirection, voxelObjects, voxelsSampler);
    if(!rayMarchResult.hit){
      rayColour = vec3(0.0);
      break;
    }
    var reflectionDirection = reflect(-rayDirection, rayMarchResult.normal);
  }

  textureStore(
      outputTex,
      pixel,
      vec4(uv,0.0,1.0),
    );
}