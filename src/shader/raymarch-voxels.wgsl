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

struct Stack2 {
  arr: array<vec2<u32>, STACK_LEN>,
	head: u32,
}

fn stack2_new() -> Stack2 {
    var arr: array<vec2<u32>, STACK_LEN>;
    return Stack2(arr, 0u);
}

fn stack2_push(stack: ptr<function, Stack2>, val: vec2<u32>) {
    (*stack).arr[(*stack).head] = val;
    (*stack).head += 1u;
}

fn stack2_pop(stack: ptr<function, Stack2>) -> vec2<u32> {
    (*stack).head -= 1u;
    return (*stack).arr[(*stack).head];
}

struct InternalNode {
  firstChildOffset: u32,
  childMask: u32,
  x: u32,
  y: u32,
  z: u32,
  size: u32,
}

fn getFirstChildIndexFromInternalNode(node: InternalNode, index: u32) -> u32 {
  return index + node.firstChildOffset;
}

const mask8 = 0xFFu;
const mask16 = 0xFFFFu;

// if first child offset is 0, then it is a leaf
fn isLeaf(node: u32) -> bool {
  let firstByte = node & mask8;
  return firstByte == 0;
}

//2nd, 3rd and 4th bytes are the red, green and blue values
fn unpackLeaf(node: vec2<u32>) -> vec3<u32> {
  return vec3<u32>(
    (node.x >> 8u) & mask8,
    (node.x >> 16u) & mask8,
    (node.x >> 24u) & mask8
  );
}

/**
  * Unpacks an internal node from a 32 bit integer
  * First 8 bits are the firstChildOffset
  * The next 8 bits are the child mask
  * The next 8 bits are the x position
  * The next 8 bits are the y position
  * The next 8 bits are the z position
  * The next 8 bits are the size
  */
fn unpackInternal(node: vec2<u32>) -> InternalNode {
  var output = InternalNode();
  let first4Bytes = node.x;
  let second4Bytes = node.y;
  output.firstChildOffset = first4Bytes & mask8;
  output.childMask = (first4Bytes >> 8u) & mask8;
  output.x = (first4Bytes >> 16u) & mask8;
  output.y = (first4Bytes >> 24u) & mask8;
  output.z = second4Bytes & mask8;
  output.size = (second4Bytes >> 8u) & mask8;
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


fn rayMarchOctree(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>) -> RayMarchResult {
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    var output = RayMarchResult();
    output.t = FAR_PLANE;
    var nodeIndex = 0u;
    var stack = stacku32_new();

    let node = unpackInternal(octreeBuffer[nodeIndex]);
    let rootNodeIntersection = boxIntersection(objectRayOrigin, objectRayDirection, vec3(f32(node.size)) * 0.5);
    if(rootNodeIntersection.isHit){
      output.hit = true;
      output.normal = vec3(1.0);
      return output;
    }

    //TODO: copy the bvh traversal code here

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
