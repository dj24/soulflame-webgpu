const EPSILON = 0.001;
const MAX_RAY_STEPS = 256;
const FAR_PLANE = 10000.0;
const NEAR_PLANE = 0.5;
const STACK_LEN: u32 = 32u;

// Function to transform a normal vector from object to world space
fn transformNormal(inverseTransform: mat4x4<f32>, normal: vec3<f32>) -> vec3<f32> {
    let worldNormal = normalize((vec4<f32>(normal, 0.0) * inverseTransform).xyz);
    return worldNormal;
}

// Function to transform an object space position to world space
fn transformPosition(transform: mat4x4<f32>, position: vec3<f32>) -> vec3<f32> {
    let worldPosition = (transform * vec4<f32>(position, 1.0)).xyz;
    return worldPosition;
}

fn getMaxMipLevel(size: vec3<f32>) -> u32 {
  return u32(log2(max(size.x, max(size.y, size.z))));
}

struct Brick {
  voxels: array<u32, 16>
}
struct VoxelObject {
  transform: mat4x4<f32>,
  inverseTransform: mat4x4<f32>,
  previousTransform: mat4x4<f32>,
  previousInverseTransform: mat4x4<f32>,
  size : vec3<f32>,
  atlasLocation : vec3<f32>,
  paletteIndex : f32,
}

struct RayMarchResult {
  voxelObjectIndex: i32,
  palettePosition: f32,
  normal: vec3<f32>,
  hit: bool,
  t: f32,
}

fn isInBounds(position: vec3<i32>, size: vec3<i32>) -> bool {
  return all(position >= vec3(0)) && all(position <= size - vec3(1));
}

fn getMipLevelFromVoxelSize(voxelSize: vec3<f32>) -> u32 {
  return u32(log2(max(voxelSize.x, max(voxelSize.y, voxelSize.z))));
}

fn convert1DTo3D(size: vec3<u32>, index: u32) -> vec3<u32> {
  return vec3(
    index % size.x,
    index / size.y,
    index / (size.x * size.y)
  );
}

fn convert3DTo1D(size: vec3<u32>, position: vec3<u32>) -> u32 {
  return position.x + position.y * size.x + position.z * (size.x * size.y);
}


fn doesBrickContainVoxels(brick: Brick) -> bool {
  for(var i = 0; i < 16; i++){
    if(brick.voxels[i] > 0){
      return true;
    }
  }
  return false;
}

fn getBit(value: u32, bitIndex: u32) -> bool {
  return (value & (1u << bitIndex)) != 0;
}

// gets bit in 512bit bitmask in a brick
// bitIndex is the index of the bit in the bitmask, 0-511
fn getBitInBrick(brick: Brick, bitIndex: u32) -> bool {
  let maskIndex = bitIndex / 32;
  let bitIndexInMask = bitIndex % 32;
  return getBit(brick.voxels[maskIndex], bitIndexInMask);
}

fn getScaleFromMatrix(transform: mat4x4<f32>) -> vec3<f32> {
  return vec3<f32>(length(transform[0].xyz), length(transform[1].xyz), length(transform[2].xyz));
}


fn rayMarchAtMip(voxelObject: VoxelObject, objectRayDirection: vec3<f32>, objectRayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
  var output = RayMarchResult();
  let rayDirSign = sign(objectRayDirection);
  let atlasLocation = vec3<u32>(voxelObject.atlasLocation);
  var voxelSize = vec3(f32(1 << mipLevel));
  var shiftedRayOrigin = objectRayOrigin - objectRayDirection * EPSILON;
  var objectPos = shiftedRayOrigin;
  var currentIndex = vec3<i32>(floor(objectPos));
  var scaledRayOrigin =  objectRayOrigin / voxelSize;
  var scaledObjectPos = floor(objectPos / voxelSize);
  var scaledOriginDifference = scaledObjectPos - scaledRayOrigin;
  var tMax = voxelSize * (rayDirSign * scaledOriginDifference + (rayDirSign * 0.5) + 0.5) / abs(objectRayDirection);
  let mask = vec3<f32>(tMax.xyz <= min(tMax.yzx, tMax.zxy));
  var objectNormal = mask * -rayDirSign;
  var tCurrent = min(tMax.x, min(tMax.y, tMax.z));

  // RAYMARCH
  for(var i = 0; i < MAX_RAY_STEPS; i++)
  {
    let samplePosition = vec3<u32>(currentIndex) + atlasLocation;
    let mipSample0 = textureLoad(voxels, samplePosition / vec3((1u << mipLevel)), mipLevel);

    if(mipSample0.r > 0.0 && isInBounds(currentIndex, vec3<i32>(voxelObject.size))){
        output.normal = objectNormal;
        output.hit = true;
        output.t = tCurrent + EPSILON;
        output.palettePosition = mipSample0.r;
        return output;
    }

    var scaledRayOrigin = shiftedRayOrigin / voxelSize;
    var scaledObjectPos = floor(objectPos / voxelSize);
    var scaledOriginDifference = scaledObjectPos - scaledRayOrigin;
    var tMax = voxelSize * (rayDirSign * scaledOriginDifference + (rayDirSign * 0.5) + 0.5) / abs(objectRayDirection);
    let mask = vec3<f32>(tMax.xyz <= min(tMax.yzx, tMax.zxy));

    tCurrent = min(tMax.x, min(tMax.y, tMax.z));
    objectPos = objectRayOrigin + objectRayDirection * tCurrent;
    currentIndex = vec3<i32>(floor(objectPos / voxelSize) * voxelSize);
    objectNormal = mask * -rayDirSign;

    if(!isInBounds(currentIndex, vec3<i32>(voxelObject.size))){
        break;
    }
  }
  return output;
}

fn rayMarchTransformed(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
      var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
      let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
      return  rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, mipLevel);
}

fn rayMarchOctree(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>, startingMipLevel: u32) -> RayMarchResult {
   var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
   let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
   var output = RayMarchResult();
   for(var mipLevel = startingMipLevel; mipLevel > 0; mipLevel--){
     output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, mipLevel);
     if(output.hit){
       objectRayOrigin += (output.t - EPSILON) * objectRayDirection;
     }
     else{
      return output;
     }
   }
   return rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
}

const SHADOW_MIN_MIP_LEVEL =1u;

fn rayMarchOctreeShadows(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>, startingMipLevel: u32) -> RayMarchResult {
   var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
   let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
   var output = RayMarchResult();
   for(var mipLevel = startingMipLevel; mipLevel > SHADOW_MIN_MIP_LEVEL; mipLevel--){
     output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, mipLevel);
     if(output.hit){
       objectRayOrigin += (output.t - EPSILON) * objectRayDirection;
     }
     else{
      return output;
     }
   }
   return rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, SHADOW_MIN_MIP_LEVEL);
}


struct Stack {
  arr: array<i32, STACK_LEN>,
	head: u32,
}

fn stack_new() -> Stack {
    var arr: array<i32, STACK_LEN>;
    return Stack(arr, 0u);
}

fn stack_push(stack: ptr<function, Stack>, val: i32) {
    (*stack).arr[(*stack).head] = val;
    (*stack).head += 1u;
}

fn stack_pop(stack: ptr<function, Stack>) -> i32 {
    (*stack).head -= 1u;
    return (*stack).arr[(*stack).head];
}

const colours = array<vec3<f32>, 6>(
  vec3<f32>(1.0, 0.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0),
  vec3<f32>(0.0, 0.0, 1.0),
  vec3<f32>(1.0, 1.0, 0.0),
  vec3<f32>(1.0, 0.0, 1.0),
  vec3<f32>(0.0, 1.0, 1.0)
);

fn debugColourFromIndex(index: i32) -> vec3<f32> {
  return colours[index % 6];
}


const OCTREE_CHILD_OFFSETS = array<vec3<i32>, 8>(
  vec3<i32>(0, 0, 0),
  vec3<i32>(1, 0, 0),
  vec3<i32>(0, 1, 0),
  vec3<i32>(1, 1, 0),
  vec3<i32>(0, 0, 1),
  vec3<i32>(1, 0, 1),
  vec3<i32>(0, 1, 1),
  vec3<i32>(1, 1, 1)
);