const EPSILON = 0.0002;
const MAX_RAY_STEPS = 256;
const FAR_PLANE = 10000.0;
const NEAR_PLANE = 0.5;
const STACK_LEN: u32 = 32u;
const MAX_STEPS = 128;

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
  atlasLocation : vec4<f32>,
  octreeBufferIndex: u32
}

struct RayMarchResult {
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
  position: vec3<u32>,
  size: u32,
}

struct LeafNode {
  colour: vec3<u32>,
  position: vec3<u32>,
  size: u32,
}

const mask4 = 0xFu;
const mask8 = 0xFFu;
const mask12 = 0xFFFu;
const mask16 = 0xFFFFu;
const mask24 = 0xFFFFFFu;

// if childMask is 0, then it is a leaf
fn isLeaf(node:vec4<u32>) -> bool {
  return (node[2] & mask8) == 0;
}

/**
  Unpack
  12 bit x,y,z values
  4 bit size
*/
fn unpackPositionAndSize(packed: vec2<u32>) -> vec4<u32> {
  let x = packed[0] & mask16;
  let y = (packed[0] >> 16u) & mask16;
  let z = packed[1] & mask16;
  let size = (packed[1] >> 16u) & mask16;
  return vec4<u32>(x, y, z, size);
}

/**
  * Unpacks a leaf node from a 32 bit integer
  * First 8 bits are the leaf flag (0)
  * The next 8 bits are the x position
  * The next 8 bits are the y position
  * The next 8 bits are the z position
  * the next 8 bits are the size
  * The next 8 bits are the red component
  * The next 8 bits are the green component
  * The next 8 bits are the blue component

  */
fn unpackLeaf(node: vec4<u32>) -> LeafNode {
  var output = LeafNode();
  let first4Bytes = node.x;
  let second4Bytes = node.y;
  let third4Bytes = node.z;
  let unpackedPositionAndSize = unpackPositionAndSize(vec2<u32>(first4Bytes, second4Bytes));
  let x = unpackedPositionAndSize.x;
  let y = unpackedPositionAndSize.y;
  let z = unpackedPositionAndSize.z;
  output.size = 1u << unpackedPositionAndSize.w; // 2 raised to the power of the size
  let r = (second4Bytes >> 16u) & mask8;
  let g = (second4Bytes >> 24u) & mask8;
  let b = third4Bytes & mask8;
  output.colour = vec3<u32>(r, g, b);
  output.position = vec3<u32>(x, y, z);

  return output;
}

/**
  * Unpacks an internal node from a 32 bit integer
  * First 8 bits are the child mask
  * The next 8 bits are the x position
  * The next 8 bits are the y position
  * The next 8 bits are the z position
  * The next 8 bits are the size
  * The next 24 bits are the firstChildOffset
  */
fn unpackInternal(node: vec4<u32>) -> InternalNode {
  var output = InternalNode();
  let first4Bytes = node.x;
  let second4Bytes = node.y;
  let third4Bytes = node.z;
  let unpackedPositionAndSize = unpackPositionAndSize(vec2<u32>(first4Bytes, second4Bytes));
  let x = unpackedPositionAndSize.x;
  let y = unpackedPositionAndSize.y;
  let z = unpackedPositionAndSize.z;
  output.size = 1u << unpackedPositionAndSize.w; // 2 raised to the power of the size
  output.childMask = third4Bytes & mask8;
  output.firstChildOffset = third4Bytes >> 8u;
  output.position = vec3<u32>(x, y, z);
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

fn getDistanceToEachAxis(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, boxExtents: f32) -> vec3<f32> {
  return (boxExtents - rayOrigin) / rayDirection;
}

struct PlaneIntersection {
  tNear: f32,
  side: vec3<i32>
}


fn sort3Asc(a: f32, b: f32, c: f32) -> vec3<f32> {
  return vec3<f32>(
    min(a, min(b, c)),
    min(max(a, b), max(min(a, b), c)),
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

    var planeIntersections = getDistanceToEachAxis(rayOrigin, rayDirection, boxExtents);
    var yPlaneIntersectionTNear = planeIntersections.y;
    var xPlaneIntersectionTNear = planeIntersections.x;
    var zPlaneIntersectionTNear = planeIntersections.z;

    // If the intersection is outside the bounds of the node, set it to a large value to ignore it
    let yPlaneHitPosition = rayOrigin + rayDirection * yPlaneIntersectionTNear  - EPSILON;
    if(any(yPlaneHitPosition < vec3(0.0)) || any(yPlaneHitPosition > vec3(f32(nodeSize)))){
      yPlaneIntersectionTNear  = 10000.0;
    }
    let xPlaneHitPosition = rayOrigin + rayDirection * xPlaneIntersectionTNear  - EPSILON;
    if(any(xPlaneHitPosition < vec3(0.0)) || any(xPlaneHitPosition > vec3(f32(nodeSize)))){
      xPlaneIntersectionTNear  = 10000.0;
    }
    let zPlaneHitPosition = rayOrigin + rayDirection * zPlaneIntersectionTNear  - EPSILON;
    if(any(zPlaneHitPosition < vec3(0.0)) || any(zPlaneHitPosition > vec3(f32(nodeSize)))){
      zPlaneIntersectionTNear  = 10000.0;
    }

    return vec3(xPlaneIntersectionTNear, yPlaneIntersectionTNear, zPlaneIntersectionTNear);
}

fn rayMarchOctree(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>, maxDistance: f32) -> RayMarchResult {
    let halfExtents = voxelObject.size * 0.5;
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz + halfExtents;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    var output = RayMarchResult();

    // Set the initial t value to the far plane - essentially an out of bounds value
    output.t = maxDistance;

    // Create a stack to hold the indices of the nodes we need to check
    var stack = stacku32_new();

    // Push the root node index onto the stack
    stacku32_push(&stack, voxelObject.octreeBufferIndex);

    // Main loop
    while (stack.head > 0u && output.iterations < MAX_STEPS) {
      output.iterations += 1u;
      let nodeIndex = stacku32_pop(&stack);
      let node = octreeBuffer[nodeIndex];

      // Get the current nodes data
      let internalNode = unpackInternal(node);

      // Get the size of the node to get the center for plane intersections
      let nodeSize = f32(internalNode.size);
      let nodeOrigin = vec3<f32>(internalNode.position);
      let nodeRayOrigin = objectRayOrigin - nodeOrigin;

      if((isLeaf(node) && output.iterations > 1u)){
        // TODO: find out how to get normal without extra intersection
        let leafNode = unpackLeaf(node);
        let nodeIntersection = boxIntersection(nodeRayOrigin, objectRayDirection, vec3(nodeSize * 0.5));
        output.hit = true;
        output.t = nodeIntersection.tNear;
        output.normal = nodeIntersection.normal;
        output.colour = vec3<f32>(leafNode.colour) / 255.0;
        return output;
      }

      let centerOfChild = vec3(nodeSize * 0.5);

      // Use planes to find the "inner" intersections
      let planeIntersections = getPlaneIntersections(nodeRayOrigin, objectRayDirection, nodeSize);

      // Get the closest plane intersection
      let sortedIntersections = sort3Desc(planeIntersections[0], planeIntersections[1], planeIntersections[2]);

      // Get the side of the planes that the ray is on
      let sideOfPlanes = sign(nodeRayOrigin - centerOfChild);

      // Push the children onto the stack, furthest first
      for(var i = 0u; i < 3u; i++){
        if(sortedIntersections[i] > maxDistance || sortedIntersections[i] < 0.0){
          continue;
        }

        var hitPosition = nodeRayOrigin + objectRayDirection * sortedIntersections[i] - sideOfPlanes * EPSILON;
        let hitOctant = vec3<u32>(hitPosition >= centerOfChild);
        let hitIndex = octantOffsetToIndex(hitOctant);

        // If the child is present, push it onto the stack
        if(getBit(internalNode.childMask, hitIndex)){
           let childIndex = nodeIndex + internalNode.firstChildOffset + hitIndex;
           stacku32_push(&stack, childIndex);
        }
      }

      // Check if the ray intersects the node, if not, skip it
      let nodeT = cubeIntersection(nodeRayOrigin, objectRayDirection, nodeSize * 0.5);
      if(nodeT > maxDistance || nodeT < 0.0){
        continue;
      }
      let intersectionPoint = nodeRayOrigin + objectRayDirection * nodeT;
      let hitOctant = vec3<u32>(intersectionPoint >= centerOfChild);
      let hitIndex = octantOffsetToIndex(hitOctant);

      // If the child is present, push it onto the stack
      if(getBit(internalNode.childMask, hitIndex)){
        let childIndex = nodeIndex + internalNode.firstChildOffset + hitIndex;
        stacku32_push(&stack, childIndex);
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
