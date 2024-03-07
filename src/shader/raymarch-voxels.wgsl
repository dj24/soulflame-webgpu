const EPSILON = 0.0001;
const MAX_RAY_STEPS = 256;
const FAR_PLANE = 10000.0;


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


struct VoxelObject {
  transform: mat4x4<f32>,
  inverseTransform: mat4x4<f32>,
  previousTransform: mat4x4<f32>,
  previousInverseTransform: mat4x4<f32>,
  size : vec3<f32>,
  atlasLocation : vec3<f32>,
}

struct BVHNode {
  leftIndex: i32,
  rightIndex: i32,

  leftObjectCount: u32,
  rightObjectCount: u32,

  leftMin: vec3<f32>,
  leftMax: vec3<f32>,

  rightMin: vec3<f32>,
  rightMax: vec3<f32>,
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

fn rayMarchAtMip(voxelObject: VoxelObject, objectRayDirection: vec3<f32>, objectRayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
  var output = RayMarchResult();
  let rayDirSign = sign(objectRayDirection);

  var voxelSize = vec3<f32>(2.0);
  var shiftedRayOrigin = objectRayOrigin - objectRayDirection * EPSILON;
  var objectPos = shiftedRayOrigin;
  var currentIndex = vec3<i32>(floor(objectPos));
  var scaledRayOrigin =  objectRayOrigin/ voxelSize;
  var scaledObjectPos = floor(objectPos / voxelSize);
  var scaledOriginDifference = scaledObjectPos - scaledRayOrigin;
  var tMax = voxelSize * (rayDirSign * scaledOriginDifference + (rayDirSign * 0.5) + 0.5) / abs(objectRayDirection);
  let mask = vec3<f32>(tMax.xyz <= min(tMax.yzx, tMax.zxy));
  var objectNormal = mask * -rayDirSign;
  var tCurrent = min(tMax.x, min(tMax.y, tMax.z));

  // RAYMARCH
  for(var i = 0; i < MAX_RAY_STEPS; i++)
  {
    output.stepsTaken = i;

    let atlasLocation = vec3<u32>(voxelObject.atlasLocation);
    let samplePosition = vec3<u32>(currentIndex) + atlasLocation;

    let mip0Index = currentIndex;
    let mip1Index = currentIndex / 2;
    let mip2Index = currentIndex / 4;
    let mip3Index = currentIndex / 8;
    let mip4Index = currentIndex / 16;

    let mip0SamplePosition = vec3<u32>(mip0Index) + atlasLocation;
    let mip1SamplePosition = vec3<u32>(mip1Index) + atlasLocation;
    let mip2SamplePosition = vec3<u32>(mip2Index) + atlasLocation;
    let mip3SamplePosition = vec3<u32>(mip3Index) + atlasLocation;
    let mip4SamplePosition = vec3<u32>(mip4Index) + atlasLocation;

    let mipSample0 = textureLoad(voxels, mip0SamplePosition, 0);
    let mipSample1 = textureLoad(voxels, mip1SamplePosition, 1);
    let mipSample2 = textureLoad(voxels, mip2SamplePosition, 2);
    let mipSample3 = textureLoad(voxels, mip3SamplePosition, 3);
    let mipSample4 = textureLoad(voxels, mip3SamplePosition, 4);

    if(mipSample0.a > 0.0 && isInBounds(currentIndex, vec3<i32>(voxelObject.size))){
//    if(true){
        output.objectPos = objectPos;
        output.worldPos = (voxelObject.transform *  vec4(output.objectPos, 1.0)).xyz;
        output.normal = transformNormal(voxelObject.inverseTransform,vec3<f32>(objectNormal));
        output.colour = mipSample0.rgb;
        output.hit = true;
        output.modelMatrix = voxelObject.transform;
        output.previousModelMatrix = voxelObject.previousTransform;
        output.inverseModelMatrix = voxelObject.inverseTransform;
        output.previousInverseModelMatrix = voxelObject.previousInverseTransform;
        return output;
    }
    voxelSize = vec3<f32>(1.0);
//    if (mipSample1.a == 0.0){
//      voxelSize = vec3<f32>(2.0);
//    }
//    if (mipSample2.a == 0.0){
//      voxelSize = vec3<f32>(4.0);
//    }
//    if (mipSample3.a == 0.0){
//      voxelSize = vec3<f32>(8.0);
//    }
//    if (mipSample4.a == 0.0){
//      voxelSize = vec3<f32>(16.0);
//    }

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
      return  rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
}

const STACK_LEN: u32 = 64u;
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

fn getDistanceToLeftNode(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, node: BVHNode) -> f32 {
  var leftDist = -1.0;
  if(all(rayOrigin >= node.leftMin) && all(rayOrigin <= node.leftMax)){
    leftDist = 0.0;
  } else {
    let leftBoxSize = (node.leftMax - node.leftMin) / 2;
    leftDist = boxIntersection(rayOrigin - node.leftMin, rayDirection, leftBoxSize).tNear - EPSILON;
  }
  return leftDist;
}

fn getDistanceToRightNode(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, node: BVHNode) -> f32 {
  var rightDist = -1.0;
  if(all(rayOrigin >= node.rightMin) && all(rayOrigin <= node.rightMax)){
    rightDist = 0.0;
  } else {
    var rightBoxSize = (node.rightMax - node.rightMin) / 2;
    rightDist = boxIntersection(rayOrigin - node.rightMin, rayDirection, rightBoxSize).tNear;
  }
  return rightDist;
}

fn getVoxelObjectIndexFromFromRightNode(node: BVHNode) -> i32 {
  if(node.rightObjectCount == 1){
    return node.rightIndex;
  }
  return -1;
}

fn getVoxelObjectIndexFromFromLeftNode(node: BVHNode) -> i32 {
  if(node.leftObjectCount == 1){
    return node.leftIndex;
  }
  return -1;
}

fn rayMarchBVH(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> RayMarchResult {
  var closestIntersection = RayMarchResult();
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;

  var stack = stack_new();
  stack_push(&stack, 0);

  var closestRaymarchDist = 1e30f;
  var iterations = 0;
  var nodeIndex = 0;
  var furthestAABBDist = 0.0;

  while (stack.head > 0u && iterations < 128) {
    let node = bvhNodes[nodeIndex];
    var voxelObjectIndex = -1;
    let leftDist = getDistanceToLeftNode(rayOrigin, rayDirection, node);
    let rightDist = getDistanceToRightNode(rayOrigin, rayDirection, node);
    let hitLeft = leftDist >= 0.0 && leftDist < closestRaymarchDist;
    let hitRight = rightDist >= 0.0 && rightDist < closestRaymarchDist;
    var AABBDist = 0.0;
    if(hitLeft){
      var nearIndex = node.leftIndex;
      AABBDist = leftDist;
      voxelObjectIndex = getVoxelObjectIndexFromFromLeftNode(node);
      if(hitRight){
        var farIndex = node.rightIndex;
        if(leftDist < rightDist){
          nearIndex = node.leftIndex;
          AABBDist = leftDist;
          voxelObjectIndex = getVoxelObjectIndexFromFromLeftNode(node);
          farIndex = node.rightIndex;
        } else {
          nearIndex = node.rightIndex;
          AABBDist = rightDist;
          voxelObjectIndex = getVoxelObjectIndexFromFromRightNode(node);
          farIndex = node.leftIndex;
        }
        stack_push(&stack, farIndex);
      }
      nodeIndex = nearIndex;
    } else if(hitRight){
      nodeIndex = node.rightIndex;
      AABBDist = rightDist;
      voxelObjectIndex = getVoxelObjectIndexFromFromRightNode(node);
    } else{
      nodeIndex = stack_pop(&stack);
    }
    iterations += 1;
    closestIntersection.colour += vec3<f32>(0.0075);

        // valid leaf, raymarch it
    if(voxelObjectIndex != -1){
//         closestIntersection.colour = debugColourFromIndex(voxelObjectIndex);
        // Raymarch the voxel object if it's a leaf node
        let voxelObject = voxelObjects[voxelObjectIndex];
        let raymarchResult = rayMarchTransformed(voxelObject, rayDirection, rayOrigin + rayDirection * AABBDist, 0);
        let raymarchDist = distance(raymarchResult.worldPos, rayOrigin);
        if(raymarchResult.hit && raymarchDist < closestRaymarchDist - EPSILON){
          closestIntersection = raymarchResult;
          closestRaymarchDist = raymarchDist;
        }
//        voxelObjectIndex = -1;
    }
  }

//  closestIntersection.colour = mix(vec3(0,0,1), vec3(1,0.3,0.05), length(closestIntersection.colour));

  return closestIntersection;
}