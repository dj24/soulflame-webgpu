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
  colour: vec3<f32>,
  normal: vec3<f32>,
  hit: bool,
  t: f32,
  iterations: u32,
}

fn isInBounds(position: vec3<i32>, size: vec3<i32>) -> bool {
  return all(position >= vec3(0)) && all(position <= size - vec3(1));
}

fn getBit(value: u32, bitIndex: u32) -> bool {
  return (value & (1u << bitIndex)) != 0;
}

fn getScaleFromMatrix(transform: mat4x4<f32>) -> vec3<f32> {
  return vec3<f32>(length(transform[0].xyz), length(transform[1].xyz), length(transform[2].xyz));
}

fn rayMarchAtMip(voxelObject: VoxelObject, objectRayDirection: vec3<f32>, objectRayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
  var output = RayMarchResult();

//  var intersect = boxIntersection(objectRayOrigin, objectRayDirection,voxelObject.size * 0.5);
//
//  if(intersect.isHit){
//    output.hit = true;
//    output.t = intersect.tNear;
//    output.normal = intersect.normal;
//    output.colour = vec3<f32>(0.0, 1.0, 0.0);
//    return output;
//  }

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
        output.colour = vec3<f32>(mipSample0.r, 0,0);
        output.iterations = u32(i);
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

//    if(!isInBounds(currentIndex, vec3<i32>(voxelObject.size))){
//        break;
//    }
  }
  return output;
}

fn rayMarchTransformed(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
      let halfExtents = voxelObject.size * 0.5;
      var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz + halfExtents;
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


struct InternalNode {
  firstChildOffset: u32,
  childMask: u32,
  leafMask: u32,
  position: vec3<u32>,
  size: u32,
}

struct LeafNode {
  colour: vec3<u32>,
  position: vec3<u32>,
}

const mask8 = 0xFFu;
const mask16 = 0xFFFFu;

// if first child offset is 0, then it is a leaf
fn isLeaf(node:vec2<u32>) -> bool {
  return (node[0] & mask16) == 0;
}

/**
  * Unpacks a leaf node from a 32 bit integer
  * First 16 bits are the leaf flag (0)
  * The next 8 bits are the red component
  * The next 8 bits are the green component
  * The next 8 bits are the blue component
  * The next 8 bits are the x position
  * The next 8 bits are the y position
  * The next 8 bits are the z position
  */
fn unpackLeaf(node: vec2<u32>) -> LeafNode {
  var output = LeafNode();
  let first4Bytes = node.x;
  let second4Bytes = node.y;
  let r = (first4Bytes >> 16u) & mask8;
  let g = (first4Bytes >> 24u) & mask8;
  let b = second4Bytes & mask8;
  let x = (second4Bytes >> 8u) & mask8;
  let y = (second4Bytes >> 16u) & mask8;
  let z = (second4Bytes >> 24u) & mask8;
  output.colour = vec3<u32>(r, g, b);
  output.position = vec3<u32>(x, y, z);
  return output;
}

/**
  * Unpacks an internal node from a 32 bit integer
  * First 16 bits are the firstChildOffset
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
  output.firstChildOffset = first4Bytes & 0xFFFFu;
  output.childMask = (first4Bytes >> 16u) & mask8;
  output.leafMask = (first4Bytes >> 24u) & mask8;
  let x = second4Bytes & mask8;
  let y = (second4Bytes >> 8u) & mask8;
  let z = (second4Bytes >> 16u) & mask8;
  output.position = vec3<u32>(x, y, z);
  output.size = (second4Bytes >> 24u) & mask8;
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
    let halfExtents = voxelObject.size * 0.5;
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz + halfExtents;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    var output = RayMarchResult();

    // Set the initial t value to the far plane - essentially an out of bounds value
    output.t = FAR_PLANE;

    // Create a stack to hold the indices of the nodes we need to check
    var stack = stacku32_new();

    // Push the root node index onto the stack
    stacku32_push(&stack, 0);

    // Main loop
    while (stack.head > 0u && output.iterations < MAX_STEPS) {
      let nodeIndex = stacku32_pop(&stack);
      let node = octreeBuffer[nodeIndex];
      let internalNode = unpackInternal(node);
      let nodeOrigin = vec3(f32(internalNode.position.x), f32(internalNode.position.y), f32(internalNode.position.z));
      let nodeRayOrigin = objectRayOrigin - nodeOrigin;

      // Use planes to find the "inner" intersections
      let planeIntersections = getPlaneIntersections(nodeRayOrigin, objectRayDirection, f32(internalNode.size));

      // Get the closest plane intersection
      let sortedIntersections = sort3Asc(planeIntersections.x, planeIntersections.y, planeIntersections.z);

      for(var i = 0u; i < 3u; i++){
        // If the closest intersection is outside the bounds of the node, we are done
        if(sortedIntersections[i] > 9999.0){
            break;
        }
        let childNodeSize = internalNode.size >> 1u;
        let centerOfChild = vec3(f32(internalNode.size) * 0.5);
        // TODO: find way to enter the correct node
        let hitPosition = objectRayOrigin + objectRayDirection * sortedIntersections[i] - EPSILON;
        let hitOctant = vec3<u32>(hitPosition >= centerOfChild);
        let hitIndex = octantOffsetToIndex(vec3<u32>(hitOctant));

//        if(getBit(internalNode.leafMask, hitIndex)){
//          // TODO: unpack leaf node here
//          output.hit = true;
//          output.t = sortedIntersections[i];
//          output.normal = getDebugColour(i32(hitIndex));
//          output.colour = getDebugColour(i32(hitIndex));
////            return output;
//        }

        // If the child is present, push it onto the stack
        if(getBit(internalNode.childMask, hitIndex)){
            if(internalNode.size == 128u){
              output.hit = true;
              output.t = sortedIntersections[i];
              output.normal = getDebugColour(i32(hitIndex));
              output.colour = getDebugColour(i32(hitIndex));
              return output;
            }
           let childIndex = nodeIndex + internalNode.firstChildOffset + hitIndex;
           stacku32_push(&stack, childIndex);
        }
      }


      // Increment the number of iterations for the loop and debug purposes
      output.iterations += 1u;
    }
    output.t = 1;
//    output.normal = vec3(f32(output.iterations) / 128.0);
//    output.colour = vec3(f32(output.iterations) / 128.0);
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
