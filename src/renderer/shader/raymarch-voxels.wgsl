const EPSILON = 0.0002;
const MAX_RAY_STEPS = 256;
const FAR_PLANE = 10000.0;
const NEAR_PLANE = 0.5;
const STACK_LEN: u32 = 32u;
const MAX_STEPS = 256;

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
  leafMask: u32,
  position: vec3<u32>,
  size: u32,
}

struct LeafNode {
  colour: vec3<u32>,
  position: vec3<u32>,
  size: u32,
}

const mask4 = 0xFu;
const mask5 = 0x1Fu;
const mask6 = 0x3Fu;
const mask8 = 0xFFu;
const mask12 = 0xFFFu;
const mask16 = 0xFFFFu;
const mask24 = 0xFFFFFFu;

// if childMask is 0, then it is a leaf
fn isLeaf(node:vec4<u32>) -> bool {
  return ((node[1] >> 16u) & mask8) == 0;
}

fn unpackDequantise565(colour: u32) -> vec3<u32> {
  let r = u32(f32(colour & mask5) / 31.0 * 255.0);
  let g = u32(f32((colour >> 5) & mask6) / 63.0 * 255.0);
  let b = u32(f32((colour >> 11) & mask5) / 31.0 * 255.0);
  return vec3<u32>(r, g, b);
}

fn unpackLeaf(node: vec4<u32>) -> LeafNode {
  var output = LeafNode();
  let first4Bytes = node.x;
  let second4Bytes = node.y;
  let third4Bytes = node.z;

  let x = first4Bytes & mask12;
  let y = (first4Bytes >> 12u) & mask12;
  let PADDING = (first4Bytes >> 24u) & mask8;

  let z = second4Bytes & mask12;
  output.size = 1u << ((second4Bytes >> 12u) & mask4); // 2 raised to the power of the size

  output.colour = unpackDequantise565(third4Bytes);
  output.position = vec3<u32>(x, y, z);

  return output;
}


fn unpackInternal(node: vec4<u32>) -> InternalNode {
  var output = InternalNode();
  let first4Bytes = node.x;
  let second4Bytes = node.y;
  let third4Bytes = node.z;

  let x = first4Bytes & mask12;
  let y = (first4Bytes >> 12u) & mask12;
  let PADDING1 = (first4Bytes >> 24u) & mask8;

  let z = second4Bytes & mask12;
  output.size = 1u << ((second4Bytes >> 12u) & mask4); // 2 raised to the power of the size

  output.childMask = (second4Bytes >> 16u) & mask8;
  output.leafMask = (second4Bytes >> 24u) & mask8;

  output.firstChildOffset = third4Bytes & mask24;

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

fn getDistanceToEachAxis(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, centerPoint: vec3<f32>) -> vec3<f32> {
  return (centerPoint - rayOrigin) / rayDirection;
}

struct PlaneIntersection {
  t: f32,
  normal: vec3<f32>,
}

fn getPlaneIntersections(rayOrigin: vec3<f32>, rayDirection:vec3<f32>, centerPoint: vec3<f32>) -> array<PlaneIntersection, 3> {
    var planes = getDistanceToEachAxis(rayOrigin, rayDirection, centerPoint);
    let xHitPoint = rayOrigin + rayDirection * planes.x;
    let isXValid = all(abs(xHitPoint - centerPoint) <= centerPoint);
    planes.x = select(FAR_PLANE, planes.x, isXValid);
    let yHitPoint = rayOrigin + rayDirection * planes.y;
    let isYValid = all(abs(yHitPoint - centerPoint) <= centerPoint);
    planes.y = select(FAR_PLANE, planes.y, isYValid);
    let zHitPoint = rayOrigin + rayDirection * planes.z;
    let isZValid = all(abs(zHitPoint - centerPoint) <= centerPoint);
    planes.z = select(FAR_PLANE, planes.z, isZValid);

    let sideOfPlanes = sign(rayOrigin - centerPoint);

    return array<PlaneIntersection, 3>(
      PlaneIntersection(planes.x, vec3<f32>(1, 0.0, 0.0)),
      PlaneIntersection(planes.y, vec3<f32>(0.0, 1, 0.0)),
      PlaneIntersection(planes.z, vec3<f32>(0.0, 0.0, 1))
    );
}


fn sort3Desc(planes: array<PlaneIntersection, 3>) -> array<PlaneIntersection, 3> {
  var sorted = array<PlaneIntersection, 3>(
    planes[0],
    planes[1],
    planes[2]
  );

  if(sorted[0].t < sorted[1].t){
    let temp = sorted[0];
    sorted[0] = sorted[1];
    sorted[1] = temp;
  }

  if(sorted[1].t < sorted[2].t){
    let temp = sorted[1];
    sorted[1] = sorted[2];
    sorted[2] = temp;
  }

  if(sorted[0].t < sorted[1].t){
    let temp = sorted[0];
    sorted[0] = sorted[1];
    sorted[1] = temp;
  }

  return sorted;
}



fn getDebugColor(index: u32) -> vec4<f32> {
  let colors = array<vec4<f32>, 8>(
    vec4<f32>(1.0, 0.0, 0.0, 1.0),
    vec4<f32>(0.0, 1.0, 0.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 0.0, 1.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 1.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0),
    vec4<f32>(0.5, 0.5, 0.5, 1.0)
  );
  return colors[index % 8];
}

fn rayMarchOctree(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>, maxDistance: f32) -> RayMarchResult {
    let rootNode = octreeBuffer[voxelObject.octreeBufferIndex];
    let rootInternal = unpackInternal(rootNode);
    let octreeExtents = vec3(f32(rootInternal.size)) * 0.5;
    let objectExtents = voxelObject.size * 0.5;
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz + objectExtents;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    var output = RayMarchResult();

    // Set the initial t value to the far plane - essentially an out of bounds value
    output.t = 1000000000.0;

    // Create a stack to hold the indices of the nodes we need to check
    var stack = stacku32_new();

    // Push the root index onto the stack
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
      let centerOfChild = vec3(nodeSize * 0.5);

      // Get octant hit on the surface of the nodes bounding box
      // Check if the ray intersects the node, if not, skip it
      let nodeIntersection = boxIntersection(nodeRayOrigin, objectRayDirection, vec3(nodeSize * 0.5));
//      if(!nodeIntersection.isHit){
//        continue;
//      }
      let intersectionPoint = nodeRayOrigin + objectRayDirection * nodeIntersection.tNear;
      let hitOctant = vec3<u32>(intersectionPoint >= centerOfChild);
      let hitIndex = octantOffsetToIndex(vec3<u32>(hitOctant));
      let objectHitPosition = intersectionPoint + nodeOrigin;
      let objectHitDistance = distance(objectHitPosition, objectRayOrigin);

        // If the node is a leaf, return the leaf data
       if(getBit(internalNode.leafMask, hitIndex)){
        let octantNode = octreeBuffer[nodeIndex + internalNode.firstChildOffset + hitIndex];
        let leafNode = unpackLeaf(octantNode);
        output.hit = true;
        output.normal = nodeIntersection.normal;
        output.t = objectHitDistance;
        output.colour = vec3<f32>(leafNode.colour) / 255.0;
        return output;
      }

      // Use planes to find the "inner" intersections
      let planeIntersections = getPlaneIntersections(nodeRayOrigin, objectRayDirection, centerOfChild);

      // Get the closest plane intersection
      let sortedIntersections = sort3Desc(planeIntersections);

      // Push the children onto the stack, furthest first
      for(var i = 0u; i < 3u; i++){
        let t = sortedIntersections[i].t + EPSILON;
        if(t > maxDistance || t < 0.0){
          continue;
        }

        var hitPosition = nodeRayOrigin + objectRayDirection * t;
        let objectHitPosition = hitPosition + nodeOrigin;
        let objectHitDistance = distance(objectHitPosition, objectRayOrigin);
        let hitOctant = vec3<u32>(hitPosition >= centerOfChild);
        let hitIndex = octantOffsetToIndex(hitOctant);

        if(getBit(internalNode.leafMask, hitIndex)){
          let octantNode = octreeBuffer[nodeIndex + internalNode.firstChildOffset + hitIndex];
          let leafNode = unpackLeaf(octantNode);
          output.hit = true;
          output.t = objectHitDistance;
          output.normal = sortedIntersections[i].normal;
          output.colour = vec3<f32>(leafNode.colour) / 255.0;
          return output;
        }

        // If the child is present, push it onto the stack
        if(getBit(internalNode.childMask, hitIndex)){
           let childIndex = nodeIndex + internalNode.firstChildOffset + hitIndex;
           stacku32_push(&stack, childIndex);
        }
      }

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
