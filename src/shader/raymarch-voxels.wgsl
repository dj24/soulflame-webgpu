const EPSILON = 0.0001;
const MAX_RAY_STEPS = 256;
const FAR_PLANE = 10000.0;
const NEAR_PLANE = 0.5;


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

struct BVHNode {
  leftIndex: i32,
  rightIndex: i32,
  objectCount: u32,
  AABBMin: vec3<f32>,
  AABBMax: vec3<f32>
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
  brickOffset : u32,
}

struct RayMarchResult {
  colour: vec3<f32>,
  normal: vec3<f32>,
  objectPos: vec3<f32>,
  worldPos: vec3<f32>,
  hit: bool,
  modelMatrix: mat4x4<f32>,
  previousModelMatrix: mat4x4<f32>,
  inverseModelMatrix: mat4x4<f32>,
  previousInverseModelMatrix: mat4x4<f32>,
  stepsTaken: i32,
  isWater: bool
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

struct BrickMarchResult {
  hit: bool,
  normal: vec3<f32>,
  t: f32
}

// plane degined by p (p.xyz must be normalized)
fn plaIntersect( ro:vec3<f32>, rd: vec3<f32>, p:vec4<f32>) -> f32
{
    return -(dot(ro,p.xyz)+p.w)/dot(rd,p.xyz);
}

//vec4 PlaneMarch(vec3 p0, vec3 d) {
//  float t = 0;
//  while (t <= maxDistToCheck) {
//    vec3 p = p0 + d * t;
//    vec4 c = textureLod(voxels, p / voxelGridSize, 0);
//    if (c.a > 0) {
//      return c;
//    }
//
//    vec3 deltas = (step(0, d) - fract(p)) / d;
//    t += max(mincomp(deltas), epsilon);
//  }
//
//  return vec4(0);
//}

// TODO: start at surface of brick
// ray march one brick, offseting the ray origin by the brick position
fn rayMarchBrick(brick: Brick, rayDirection: vec3<f32>, rayOrigin: vec3<f32>) -> BrickMarchResult {
   var output = BrickMarchResult(false, vec3(0), 0.0);
   let rayDirSign = sign(rayDirection);
   var startIndex = vec3<i32>(floor(rayOrigin));
   var currentIndex = startIndex;

   for(var i = 0; i < 24 && !output.hit; i++)
   {
     let tMax = vec3<f32>(currentIndex - startIndex) / rayDirection;
     let mask = vec3<i32>(tMax.xyz <= min(tMax.yzx, tMax.zxy));
     let tCurrent = min(tMax.x, min(tMax.y, tMax.z));
     let bitIndex = convert3DTo1D(vec3(8), vec3<u32>(currentIndex));
     if(currentIndex.x < 5){
        output.hit = true;
        output.normal = vec3<f32>(currentIndex) / 5.0;
        output.normal = rayOrigin / 8.0;
        output.t = tCurrent;
     }
     currentIndex += mask;
   }
  return output;
}

fn rayMarchAtMip(voxelObject: VoxelObject, objectRayDirection: vec3<f32>, objectRayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
  var output = RayMarchResult();
  let rayDirSign = sign(objectRayDirection);
  let atlasLocation = vec3<u32>(voxelObject.atlasLocation);
  let brickAtlasLocation = vec3<u32>(atlasLocation) / 8;
  var brickRayOrigin = objectRayOrigin / 8.0;
  let brickMapSize = textureDimensions(voxels) / 8;
  let objectSizeInBricks = vec3<i32>(ceil(vec3<f32>(voxelObject.size / f32(8))));
  var shiftedRayOrigin = brickRayOrigin - objectRayDirection * EPSILON;
  var objectPos = shiftedRayOrigin;
  var currentIndex = vec3<i32>(floor(objectPos));
  let longestDimension = max(voxelObject.size.x, max(voxelObject.size.y, voxelObject.size.z));
  let maxRaySteps = i32(longestDimension * 3);

  // RAYMARCH
  for(var i = 0; i < maxRaySteps && !output.hit; i++)
  {
    var scaledRayOrigin = shiftedRayOrigin;
    var scaledObjectPos = floor(objectPos);
    var scaledOriginDifference = scaledObjectPos - scaledRayOrigin;
    var tMax =  (rayDirSign * scaledOriginDifference + (rayDirSign * 0.5) + 0.5) / abs(objectRayDirection);
    let mask = vec3<f32>(tMax.xyz <= min(tMax.yzx, tMax.zxy));
    var objectNormal = mask * -rayDirSign;

    var tCurrent = min(tMax.x, min(tMax.y, tMax.z));
    objectPos = brickRayOrigin + objectRayDirection * tCurrent;
    currentIndex = vec3<i32>(floor(objectPos));

   if(!isInBounds(currentIndex, objectSizeInBricks)){
     break;
    }

    let brickSamplePosition = vec3<u32>(currentIndex) + brickAtlasLocation;
    let brickSample = brickBuffer[convert3DTo1D(brickMapSize, brickSamplePosition)];


    if(doesBrickContainVoxels(brickSample)){
        output.objectPos = objectPos * 8;
        output.hit = true;
        output.worldPos = (voxelObject.transform *  vec4(output.objectPos, 1.0)).xyz;
        output.colour = abs(output.worldPos) %1.0;
//
//        let brickPosition = vec3<f32>(currentIndex);
//        let brickSurfacePosition = objectPos * 8 - brickPosition * 8;
//        let brickRayResult = rayMarchBrick(brickSample, objectRayDirection, brickSurfacePosition);
//        if(brickRayResult.hit){
//          output.hit = true;
//          output.objectPos =  vec3<f32>(brickRayResult.position) + vec3<f32>(brickSamplePosition);
//          output.worldPos = (voxelObject.transform *  vec4(output.objectPos, 1.0)).xyz;
//          output.normal = transformNormal(voxelObject.inverseTransform, brickRayResult.normal);
//          output.modelMatrix = voxelObject.transform;
//          output.inverseModelMatrix = voxelObject.inverseTransform;
//          output.previousModelMatrix = voxelObject.previousTransform;
//          output.previousInverseModelMatrix = voxelObject.previousInverseTransform;
////          output.colour = vec3(1.0);
////          output.colour = output.objectPos % 1.0;
//          output.colour = vec3<f32>(abs(output.worldPos) % 1.0);
//        }
    }

    output.stepsTaken = i;
  }
  return output;
}

fn rayMarchTransformed(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
      var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
      let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
      return  rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
}

const STACK_LEN: u32 = 32u;
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

fn getDistanceToNode(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, node: BVHNode) -> f32 {
  if(all(rayOrigin >= node.AABBMin) && all(rayOrigin <= node.AABBMax)){
    return 0.0;
  }
  let boxSize = (node.AABBMax - node.AABBMin) / 2;
  let intersection = boxIntersection(rayOrigin - node.AABBMin, rayDirection, boxSize);
  if(intersection.isHit){
    return intersection.tNear;
  }
  return -1.0;

}
