struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

fn reconstructPosition(cameraPosition: vec3<f32>, rayDirection: vec3<f32>, depth: f32) -> vec3<f32> {
  return cameraPosition + rayDirection * depth;
}

@group(0) @binding(0) var voxels : texture_3d<f32>;
@group(0) @binding(1) var depth : texture_2d<f32>;
@group(0) @binding(2) var normals : texture_2d<f32>;
@group(0) @binding(3) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(5) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(6) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>;
//@group(0) @binding(7) var<uniform> resolution : vec2<u32>;

const SUN_DIRECTION: vec3<f32> = vec3<f32>(0.25, -0.5, 0.25);
const SHADOW_ACNE_OFFSET: f32 = 0.000001;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(depth);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  let pixel = GlobalInvocationID.xy;

  var normalSample = textureLoad(normals, pixel, 0).rgb;
  let angleToSun = dot(normalSample, -SUN_DIRECTION);
  let shouldSampleShadows = angleToSun >= 0.0;
  if(!shouldSampleShadows){
    textureStore(outputTex, pixel, vec4(vec3(0.0), 1));
    return;
  }

  let randomCo = uv;
  let scatterAmount = 0.005;
  let shadowRayDirection = -SUN_DIRECTION + randomInHemisphere(randomCo, -SUN_DIRECTION) * scatterAmount;
  let worldPos = textureLoad(depth, pixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;

  var mipLevel = u32(3);
  var hit = false;
  var output = RayMarchResult();
  for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
    let voxelObject = voxelObjects[i];
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
    output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, mipLevel);
    while(mipLevel > 0 && output.hit) {
        mipLevel = mipLevel - 1;
        objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(output.worldPos, 1.0)).xyz;
        output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, mipLevel);
    }
    if(output.hit){
      hit = true;
      break;
    }
  }
  if(hit){
    textureStore(outputTex, pixel, vec4(vec3(0.0), 1));
  }


}