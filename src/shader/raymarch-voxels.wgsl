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

fn sort3(a: f32, b: f32, c: f32) -> vec3<f32> {
  return vec3<f32>(
    min(a, min(b, c)),
    max(min(a, b), min(max(a, b), c)),
    max(a, max(b, c))
  );
}

// https://bertolami.com/files/octrees.pdf
fn rayMarchOctree(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>) -> RayMarchResult {
    let objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    var output = RayMarchResult();
    output.t = FAR_PLANE;

    var depth = 0u;
    var previousOffset = vec3(0.);
    var parentOffset = vec3(0.);
    var nodeExitPosition = vec3(0.);

    let rootNodeSize = ceilToPowerOfTwo(max3(voxelObject.size));
    var size = getNodeSizeAtDepth(u32(rootNodeSize), depth);
    var nodeIndex = 0u;

    while (output.iterations < 8) {
      output.iterations += 1;
      let node = octreeBuffer[nodeIndex];
      let internalNode = unpackInternal(node);
      var firstChildIndex = nodeIndex + internalNode.firstChildOffset;

      // if this has the far bit set, we need to get the 32 bit address node
      if(internalNode.hasFarBit){
        firstChildIndex = octreeBuffer[firstChildIndex];
      }
      var closestLeafIndex = 0u;
      let nodeSize = getNodeSizeAtDepth(size, depth);
      let boxExtents = f32(nodeSize / 2);
      let nodeRayOrigin = objectRayOrigin - vec3<f32>(parentOffset);
      var nodeIntersection = boxIntersection(nodeRayOrigin, objectRayDirection, vec3(boxExtents));
      if(!nodeIntersection.isHit){
        depth -= 1;
        parentOffset = previousOffset;
        continue;
      }

      // First check if we hit the bounds of the node
      var hitPosition = nodeRayOrigin + objectRayDirection * nodeIntersection.tNear - EPSILON;
      var hitOctant = max(vec3(0), floor(hitPosition / vec3(boxExtents)));
      var hitIndex = octantOffsetToIndex(vec3<u32>(hitOctant));
      if(getBit(internalNode.childMask, hitIndex)){
        // Eventually handle leaf here
        if(depth == 2){
          output.hit = true;
          output.normal = debugColourFromIndex(i32(hitIndex));
          return output;
        }
        previousOffset = parentOffset;
        parentOffset += hitOctant * f32(nodeSize) * 0.5;
        depth += 1;
        continue;
      }

      // If not, use planes to find the "inner" intersections
      var yPlaneIntersection = planeIntersection(nodeRayOrigin, objectRayDirection, vec3(0.0, -1, 0.0), boxExtents);
      var xPlaneIntersection = planeIntersection(nodeRayOrigin, objectRayDirection, vec3(-1, 0.0, 0.0), boxExtents);
      var zPlaneIntersection = planeIntersection(nodeRayOrigin, objectRayDirection, vec3(0.0, 0.0, -1), boxExtents);

      // If the intersection is outside the bounds of the node, set it to a large value to ignore it
      let yPlaneHitPosition = nodeRayOrigin + objectRayDirection * yPlaneIntersection - EPSILON;
      if(any(yPlaneHitPosition < vec3(0.0)) || any(yPlaneHitPosition > vec3(f32(nodeSize)))){
        yPlaneIntersection = 10000.0;
      }
      let xPlaneHitPosition = nodeRayOrigin + objectRayDirection * xPlaneIntersection - EPSILON;
      if(any(xPlaneHitPosition < vec3(0.0)) || any(xPlaneHitPosition > vec3(f32(nodeSize)))){
        xPlaneIntersection = 10000.0;
      }
      let zPlaneHitPosition = nodeRayOrigin + objectRayDirection * zPlaneIntersection - EPSILON;
      if(any(zPlaneHitPosition < vec3(0.0)) || any(zPlaneHitPosition > vec3(f32(nodeSize)))){
        zPlaneIntersection = 10000.0;
      }

      // Get the closest plane intersection
      let sortedIntersections = sort3(xPlaneIntersection, yPlaneIntersection, zPlaneIntersection);

      for(var i = 0; i < 3; i++){
        output.iterations += 1;
        // If we didn't hit a plane, we need to go to the next node
        if(sortedIntersections[i] >= 9999.0){
          output.iterations += 1;
          depth -= 1;
          // TODO: understand how to cross boundaries into neighbouring octree nodes
          output.normal = vec3(0.125 * f32(depth));
          break;
        }
        hitPosition = nodeRayOrigin + objectRayDirection * sortedIntersections[i] - EPSILON;
        hitOctant = max(vec3(0), floor(hitPosition / vec3(boxExtents)));
        hitIndex = octantOffsetToIndex(vec3<u32>(hitOctant));

        // Hit a valid (filled) octant, now travese to the child node
        if(getBit(internalNode.childMask, hitIndex)){
          // Eventually handle leaf here
          if(depth == 2){
            output.hit = true;
            output.normal = debugColourFromIndex(i32(hitIndex));
            return output;
          }
          previousOffset = parentOffset;
          parentOffset += hitOctant * f32(nodeSize) * 0.5;
          depth += 1;
          break;
        }
      }

     // If we reached the end of the loop and are at the root, we are done
      if(depth == 0){
        break;
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
