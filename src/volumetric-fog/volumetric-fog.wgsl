struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var depth : texture_2d<f32>;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(4) var voxels : texture_3d<f32>;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(6) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>;

const FOG_COLOUR: vec3<f32> = vec3<f32>(1.0, 1.0, 1.0);
const START_DISTANCE: f32 = 0.0;
const END_DISTANCE: f32 = 20.0;
const FOG_DENSITY: f32 = 0.02;
const FOG_HEIGHT_START: f32 = 0.0;
const FOG_HEIGHT_END: f32 = 4.0;

// Dense fog at fog start, no fog at fog end
fn calculateDensity(worldPos: vec3<f32>, depth: f32) -> f32 {
  let height = worldPos.y;
  let heightFactor = 1.0 - clamp((height - FOG_HEIGHT_START) / (FOG_HEIGHT_END - FOG_HEIGHT_START), 0.0, 1.0);
  let distanceFactor = 1.0;

  return heightFactor * distanceFactor;
}

const SUN_DIRECTION: vec3<f32> = vec3<f32>(1.0,-1.0,-1.0);

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

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    let resolution = textureDimensions(depth);
    var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
    uv = vec2(uv.x, 1.0 - uv.y);
    let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
    let rayOrigin = cameraPosition;
    let pixel = GlobalInvocationID.xy;
    let depthSample = textureLoad(depth, pixel, 0);
    let depth = depthSample.a;
    let worldPos = depthSample.rgb;

//    var totalDensity = 0.0;
//    var totalColour = vec3<f32>(0.0, 0.0, 0.0);
//    for(var i = 0.0; i < END_DISTANCE; i += 1.0) {
//      let samplePos = rayOrigin + rayDirection * f32(i);
//      let currentDepth = distance(samplePos, rayOrigin);
//      if(samplePos.z > depth) {
//        break;
//      }
//      if(shadowRay(samplePos, -SUN_DIRECTION)) {
//        totalColour += vec3<f32>(0.0, 0.0, 0.0) * FOG_DENSITY;
//      } else{
//        totalColour += vec3<f32>(1.0, 1.0, 1.0) * FOG_DENSITY;
//      }
//      totalDensity += calculateDensity(samplePos, currentDepth) * FOG_DENSITY;
//    }
//
//    let fogColour = totalColour / totalDensity;
//    let inputSample = textureLoad(inputTex, pixel, 0).rgb;
//textureStore(outputTex, pixel, vec4(mix(inputSample, fogColour, totalDensity), 1));
    if(shadowRay(worldPos, -SUN_DIRECTION)){
      textureStore(outputTex, pixel, vec4(0.0));
    }

}