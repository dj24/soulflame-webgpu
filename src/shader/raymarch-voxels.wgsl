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
  octreeBufferIndex: u32
}

struct RayMarchResult {
  voxelObjectIndex: i32,
  palettePosition: f32,
  normal: vec3<f32>,
  hit: bool,
  t: f32,
  iterations: u32,
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

struct Stack3 {
  arr: array<vec3<i32>, STACK_LEN>,
	head: u32,
}

fn stack3_new() -> Stack3 {
    var arr: array<vec3<i32>, STACK_LEN>;
    return Stack3(arr, 0u);
}

fn stack3_push(stack: ptr<function, Stack3>, val: vec3<i32>) {
    (*stack).arr[(*stack).head] = val;
    (*stack).head += 1u;
}

fn stack3_pop(stack: ptr<function, Stack3>) -> vec3<i32> {
    (*stack).head -= 1u;
    return (*stack).arr[(*stack).head];
}

// if first 8 bytes are empty, then it is a leaf node
fn isLeaf(node: u32) -> bool {
  let firstByte = node & 0xFFu;
  return firstByte == 0;
}

// second 8 bits are the palette index
fn unpackLeaf(node: u32) -> u32 {
  return (node >> 8u) & 0xFFu;
}

struct InternalNode {
  firstChildOffset: u32,
  childMask: u32
}

// 16 bit relative offset to the first child node, then 8 bits for the child bitmask
fn unpackInternal(node: u32) -> InternalNode {
  var output = InternalNode();
  output.firstChildOffset = node & 0xFFFFu;
  output.childMask = (node >> 16u) & 0xFFu;
  return output;
}

fn getNodeSizeAtDepth(rootSize: u32, depth: u32) -> u32 {
  return rootSize >> depth;
}

fn octantIndexToOffset(index: u32) -> vec3<u32> {
  return vec3<u32>(
    select(0u, 1u, (index & 1u) != 0u),
    select(0u, 1u, (index & 2u) != 0u),
    select(0u, 1u, (index & 4u) != 0u)
  );
}

fn ceilToPowerOfTwo(value: f32) -> f32 {
  return pow(2.0, ceil(log2(value)));
}

fn max3(value: vec3<f32>) -> f32 {
  return max(value.x, max(value.y, value.z));
}

fn rayMarchOctree(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>) -> RayMarchResult {
    let objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    var output = RayMarchResult();
    output.t = FAR_PLANE;

    var nodeStack = stack_new();
    var depthStack = stack_new();
    var offsetsStack = stack3_new();
    stack_push(&nodeStack, 0);
    stack_push(&depthStack, 0);
    stack3_push(&offsetsStack, vec3(0));

    var depth = 0u;
    var parentOffset = vec3(0);

    let rootNodeSize = ceilToPowerOfTwo(max3(voxelObject.size));
    var size = getNodeSizeAtDepth(u32(rootNodeSize), depth);
    var nodeIndex = 0u;
    var iterations = 0;
    var deepestHitDepth = 0u;


    while (nodeStack.head > 0u && iterations < 64) {
      let node = octreeBuffer[nodeIndex];
      if(nodeIndex > 0 && isLeaf(node)){
        // Transform the ray into the child node's space
        let childRayOrigin = objectRayOrigin - vec3<f32>(parentOffset);
        let boxSize = vec3(f32(getNodeSizeAtDepth(size, depth))) / 2;
        let intersection = boxIntersection(childRayOrigin, objectRayDirection, boxSize);
        if(intersection.isHit && intersection.tNear < output.t && depth >= deepestHitDepth){
          output.hit = true;
          output.normal = intersection.normal;
          output.t = intersection.tNear;
          deepestHitDepth = depth;
        }
      }
      else{
        let internalNode = unpackInternal(node);
        let firstChildIndex = nodeIndex + internalNode.firstChildOffset;
        // Check if each child is filled via the bitmask
        for(var i = 0u; i < 8; i++){
          // If the child is filled, check it for intersection
          if(getBit(internalNode.childMask, i)){
            let offsetWithinOctant = octantIndexToOffset(i);
            let octantDepth = depth + 1u;
            let octantSize = getNodeSizeAtDepth(size, octantDepth);
            let childNodeIndex = firstChildIndex + i;

            // Transform the ray into the child node's space
            let childOffset = vec3<u32>(parentOffset) + offsetWithinOctant * octantSize;
            let childRayOrigin = objectRayOrigin - vec3<f32>(childOffset);
            let boxSize = vec3(f32(octantSize)) / 2;
            let intersection = boxIntersection(childRayOrigin, objectRayDirection, boxSize);

            // If we hit the child node, so push it onto the stack to check its children
            if(intersection.isHit){
              stack_push(&nodeStack, i32(childNodeIndex));
              stack_push(&depthStack, i32(octantDepth));
              stack3_push(&offsetsStack, vec3<i32>(childOffset));
            }
          }
        }
      }
      nodeIndex = u32(stack_pop(&nodeStack));
      depth = u32(stack_pop(&depthStack));
      parentOffset = stack3_pop(&offsetsStack);
      iterations += 1;
    }


//    let intersection = boxIntersection(objectRayOrigin, objectRayDirection, vec3(f32(size)) / 2);
//    output.hit = intersection.isHit;
    output.iterations = u32(iterations);

    return output;
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
