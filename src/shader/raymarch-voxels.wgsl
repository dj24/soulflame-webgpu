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

struct StackU32 {
  arr: array<u32, STACK_LEN>,
  head: u32,
}

fn stacku32_new() -> StackU32 {
    var arr: array<u32, STACK_LEN>;
    return StackU32(arr, 0u);
}

fn stacku32_push(stack: ptr<function, StackU32>, val: u32) {
    (*stack).arr[(*stack).head] = val;
    (*stack).head += 1u;
}

fn stacku32_pop(stack: ptr<function, StackU32>) -> u32 {
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

struct InternalNode {
  childMask: u32,
  firstChildOffset: u32,
  leafMask: u32,
  hasFarBit: bool
}

fn getFirstChildIndexFromInternalNode(node: InternalNode, index: u32) -> u32 {
//  if(node.hasFarBit){
//    return octreeBuffer[index + node.firstChildOffset];
//  }
  return index + node.firstChildOffset;
}

const mask8 = 0xFFu;
const mask16 = 0xFFFFu;
const mask15 = 0x7FFFu;

// if childMask is full, then the node is a leaf
fn isLeaf(node: u32) -> bool {
  let firstByte = node & mask8;
  return firstByte == 255;
}

// second 8 bits are the palette index
fn unpackLeaf(node: u32) -> u32 {
  return (node >> 8u) & mask8;
}

/**
  * Unpacks an internal node from a 32 bit integer
  * First 8 bits are the child mask
  * The next 16 bits are the first child offset, with the far bit in the 16th bit
  * The next 8 bits are the leaf mask
  */
fn unpackInternal(node: u32) -> InternalNode {
  var output = InternalNode();
  output.childMask = node & mask8;
//  output.firstChildOffset = (node >> 8u) & mask15;
//  output.hasFarBit = (output.firstChildOffset & 0x8000u) != 0u;
  output.firstChildOffset = (node >> 8u) & mask16;
  output.leafMask = (node >> 24u) & mask8;
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

fn octantOffsetToIndex(offset: vec3<u32>) -> u32 {
  return offset.x + offset.y * 2u + offset.z * 4u;
}

fn ceilToPowerOfTwo(value: f32) -> f32 {
  return pow(2.0, ceil(log2(value)));
}

fn max3(value: vec3<f32>) -> f32 {
  return max(value.x, max(value.y, value.z));
}

fn planeIntersection(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, planeNormal: vec3<f32>, planeDistance: f32) -> f32 {
  return -(dot(rayOrigin,planeNormal)+planeDistance)/dot(rayDirection,planeNormal);
}

fn sort3Asc(a: f32, b: f32, c: f32) -> vec3<f32> {
  return vec3<f32>(
    min(a, min(b, c)),
    max(min(a, b), min(max(a, b), c)),
    max(a, max(b, c))
  );
}

fn sort3Desc(a: f32, b: f32, c: f32) -> vec3<f32> {
  return vec3<f32>(
    max(a, max(b, c)),
    max(min(a, b), min(max(a, b), c)),
    min(a, min(b, c))
  );
}

fn getPlaneIntersections(rayOrigin: vec3<f32>, rayDirection:vec3<f32>, nodeSize: f32) -> vec3<f32> {
    let boxExtents = nodeSize * 0.5;

    var yPlaneIntersection = planeIntersection(rayOrigin, rayDirection, vec3(0.0, -1, 0.0), boxExtents);
    var xPlaneIntersection = planeIntersection(rayOrigin, rayDirection, vec3(-1, 0.0, 0.0), boxExtents);
    var zPlaneIntersection = planeIntersection(rayOrigin, rayDirection, vec3(0.0, 0.0, -1), boxExtents);

    // If the intersection is outside the bounds of the node, set it to a large value to ignore it
    let yPlaneHitPosition = rayOrigin + rayDirection * yPlaneIntersection - EPSILON;
    if(any(yPlaneHitPosition < vec3(0.0)) || any(yPlaneHitPosition > vec3(f32(nodeSize)))){
      yPlaneIntersection = 10000.0;
    }
    let xPlaneHitPosition = rayOrigin + rayDirection * xPlaneIntersection - EPSILON;
    if(any(xPlaneHitPosition < vec3(0.0)) || any(xPlaneHitPosition > vec3(f32(nodeSize)))){
      xPlaneIntersection = 10000.0;
    }
    let zPlaneHitPosition = rayOrigin + rayDirection * zPlaneIntersection - EPSILON;
    if(any(zPlaneHitPosition < vec3(0.0)) || any(zPlaneHitPosition > vec3(f32(nodeSize)))){
      zPlaneIntersection = 10000.0;
    }
    return vec3<f32>(xPlaneIntersection, yPlaneIntersection, zPlaneIntersection);
}

/*
https://bertolami.com/files/octrees.pdf
● If x >= 0, then it is closest to a positive x child node
● If y >= 0, then it is closest to a positive y child node
● If z >= 0, then it is closest to a positive z child node
*/
fn rayMarchOctree(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>) -> RayMarchResult {
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    var output = RayMarchResult();
    output.t = FAR_PLANE;
    let rootNodeSize = ceilToPowerOfTwo(max3(voxelObject.size));
    var nodeIndex = 0u;

    /*
      Create a stack to store the node origins and depths of the nodes we are traversing
      packed into a single integer
      3bytes: position
      1byte: depth
    */
    var stack = stacku32_new();
    let startingNodeOrigin = vec3<f32>(0.0);
    stacku32_push(&stack, pack4x8unorm(vec4<f32>(startingNodeOrigin, 0.0)));

    let rootNodeIntersection = boxIntersection(objectRayOrigin, objectRayDirection, vec3<f32>(rootNodeSize) * 0.5);
    if(!rootNodeIntersection.isHit){
      return output;
    }

    objectRayOrigin += objectRayDirection * rootNodeIntersection.tNear - EPSILON;

    while (output.iterations < 16 && stack.head > 0u) {
      output.iterations += 1;

      // Get the node data TODO: update node index
      let node = octreeBuffer[nodeIndex];
      let internalNode = unpackInternal(node);

      // Unpack relevant data from the stack
      let stackElement = unpack4x8unorm(stacku32_pop(&stack));
      let nodeOrigin = vec3<f32>(stackElement.xyz);
      let depth = u32(stackElement.w);

      // Get the size of the node and the center so we can get the plane intersections
      let nodeSize = getNodeSizeAtDepth(u32(rootNodeSize), depth);
      let centerOfNode = nodeOrigin + vec3(f32(nodeSize) * 0.5);

      // Get octant based on which side of the center the ray origin is
      let startingOctant = vec3<u32>(objectRayOrigin >= centerOfNode);
      let startingIndex = octantOffsetToIndex(startingOctant);

      // TODO: handle leaf here
      if(depth == 0 && getBit(internalNode.childMask, startingIndex)){
        output.hit = true;
        output.normal = debugColourFromIndex(i32(startingIndex));
        return output;
      }

      // Use planes to find the "inner" intersections
      let planeIntersections = getPlaneIntersections(objectRayOrigin - nodeOrigin, objectRayDirection, f32(nodeSize));

      // Get the closest plane intersection
      let sortedIntersections = sort3Asc(planeIntersections.x, planeIntersections.y, planeIntersections.z);

      for(var i = 0; i < 3; i++){
        // If the closest intersection is outside the bounds of the node, we are done
        if(sortedIntersections[i] > 9999.0){
          break;
        }

        let childNodeSize = nodeSize >> 1u;
        let centerOfChild = nodeOrigin + vec3(f32(childNodeSize));
        let hitPosition = objectRayOrigin + objectRayDirection * sortedIntersections[i] - EPSILON;
        let hitOctant = vec3<u32>(hitPosition >= centerOfChild);
        let hitIndex = octantOffsetToIndex(vec3<u32>(hitOctant));

        // Hit a valid (filled) octant, push it to the stack
        if(getBit(internalNode.childMask, hitIndex)){
          // Eventually handle leaf here
          if(depth == 0){
            output.hit = true;
            output.normal = debugColourFromIndex(i32(hitIndex));
            return output;
          }
          let offsetPosition = nodeOrigin + vec3<f32>(hitOctant * nodeSize);
          let packedValue = pack4x8unorm(vec4<f32>(offsetPosition, f32(depth + 1)));
          stacku32_push(&stack, packedValue);
          break;
        }
      }
    }

    return output;
}


const colours = array<vec3<f32>, 8>(
  vec3<f32>(0.5),
  vec3<f32>(1.0, 0.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0),
  vec3<f32>(1.0, 1.0, 0.0),
  vec3<f32>(0.0, 0.0, 1.0),
  vec3<f32>(1.0, 0.0, 1.0),
  vec3<f32>(0.0, 1.0, 1.0),
  vec3<f32>(1.0, 1.0, 1.0)
);

fn debugColourFromIndex(index: i32) -> vec3<f32> {
  return colours[index % 8];
}
