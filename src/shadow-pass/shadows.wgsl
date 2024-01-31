struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var voxels : texture_3d<f32>;
@group(0) @binding(1) var depth : texture_2d<f32>;
@group(0) @binding(2) var normals : texture_2d<f32>;
@group(0) @binding(3) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(5) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(6) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>;
@group(0) @binding(7) var<uniform> sunDirection : vec3<f32>;
@group(0) @binding(8) var inputTex: texture_2d<f32>;
// TODO: copy to this
@group(0) @binding(9) var shadowTex: texture_2d<f32>;

const SUN_DIRECTION: vec3<f32> = vec3<f32>(1.0,-1.0,-1.0);
const SHADOW_ACNE_OFFSET: f32 = 0.0005;

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
  for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
      let voxelObject = voxelObjects[i];
      if(any(voxelObject.size == vec3(0.0))){
        continue;
      }
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
      let output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
      if(output.hit){
        return true;
      }
  }
  return false;
}


// TODO: render at half res and increase samples
// 2 samples at full res = 8 samples at half res
const SAMPLE_COUNT = 2;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(depth);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  let pixel = GlobalInvocationID.xy;
  var normalSample = textureLoad(normals, pixel, 0).rgb;
  let randomCo = uv;
  let scatterAmount = 0.05;
  var totalShadow = 0.0;
  var count = 0.0;

  for(var i = 0; i < SAMPLE_COUNT; i++){
    let shadowRayDirection = -sunDirection + randomInHemisphere(randomCo + vec2(f32(i),0), -sunDirection) * scatterAmount;
    let worldPos = textureLoad(depth, pixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
    if(shadowRay(worldPos, shadowRayDirection)){
      totalShadow += 1.0;
    }
    count += 1.0;
  }

  let shadowAmount = totalShadow / count;
  textureStore(outputTex, pixel, vec4(mix(1.0, 0.0, shadowAmount)));
}


@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  let shadowAmount = 1.0 - textureLoad(inputTex, pixel, 0);
  let inputSample = vec4(1.0);
  textureStore(outputTex, pixel, mix(inputSample, vec4(0.0),shadowAmount.a));
}