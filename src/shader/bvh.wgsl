const BRICK_SIZE = 8;
const MAX_STEPS = 256;


struct BVHLeafNode {
  voxelObjectIndex: i32, // this is the index of the voxelObject for leaf nodes
  brickIndex: i32,
  objectCount: u32,
  OBBMin: vec3<f32>,
  OBBMax: vec3<f32>
}

fn castNodeToLeafNode(node: BVHNode) -> BVHLeafNode {
  return BVHLeafNode(node.leftIndex, node.rightIndex, node.objectCount, node.AABBMin, node.AABBMax);
}

fn getBrickMapIndex(objectPos: vec3<f32>) -> i32{
  return i32(objectPos.x / BRICK_SIZE) + i32(objectPos.y / BRICK_SIZE) * BRICK_SIZE + i32(objectPos.z / BRICK_SIZE) * BRICK_SIZE * BRICK_SIZE;
}

fn getBrickDebugColour(brickMapIndex: i32) -> vec3<f32>{
  let x = f32(brickMapIndex % BRICK_SIZE) / f32(BRICK_SIZE);
  let y = f32(brickMapIndex / BRICK_SIZE % BRICK_SIZE) / f32(BRICK_SIZE);
  let z = f32(brickMapIndex / (BRICK_SIZE * BRICK_SIZE)) / f32(BRICK_SIZE);
  return vec3<f32>(x, y, z);
}

struct LeafIntersectionResult {
  isHit: bool,
  tNear: f32,
  normal: vec3<f32>
}

// Leaf nodes use OBBs for intersection tests
fn leafBoundsIntersection(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, leafNode: BVHLeafNode) -> LeafIntersectionResult {
  let voxelObject = voxelObjects[leafNode.voxelObjectIndex];
  let objectRayOrigin = (voxelObject.inverseTransform * vec4(rayOrigin, 1.0)).xyz;
  let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size - vec3(1));
  if(isInBounds){
    return LeafIntersectionResult(true, 0.0, vec3<f32>(0.0));
  }
  let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
  let intersection = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size / 2);
  return LeafIntersectionResult(intersection.isHit, intersection.tNear, intersection.normal);
}

// Stack-based BVH traversal
fn rayMarchBVH(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> RayMarchResult {
  var closestIntersection = RayMarchResult();
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;

  // Create a stack to store the nodes to visit
  var stack = stack_new();
  stack_push(&stack, 0);

  // Track closest raymarch distance will let us skip nodes that are further than the closest raymarched object
  var closestRaymarchDist = 1e30f;
  var iterations = 0;
  var nodeIndex = 0;

  while (stack.head > 0u && iterations < MAX_STEPS) {
    let node = bvhNodes[nodeIndex];
    if(node.objectCount == 0){
      nodeIndex = stack_pop(&stack);
    }
    // valid leaf, raymarch it
    else if(node.objectCount == 1){
        let leafNode = castNodeToLeafNode(node);
        let intersection = leafBoundsIntersection(rayOrigin, rayDirection, leafNode);
        if(intersection.isHit && intersection.tNear < closestRaymarchDist){
          let voxelObject = voxelObjects[leafNode.voxelObjectIndex];
          let shiftedRayOrigin = rayOrigin + rayDirection * (intersection.tNear + EPSILON);
          let rayMarchResult = rayMarchTransformed(voxelObject, rayDirection, shiftedRayOrigin, 0);
          let rayMarchDist = intersection.tNear + rayMarchResult.t;
          if(rayMarchResult.hit && rayMarchDist < closestRaymarchDist){
            closestIntersection = rayMarchResult;
            closestRaymarchDist = intersection.tNear + rayMarchResult.t;
          }
        }
        nodeIndex = stack_pop(&stack);
    }
    else{
      var leftDist = 0.0;
      var rightDist = 0.0;
      let isLeftNodeLeaf = bvhNodes[node.leftIndex].objectCount == 1;
      let isRightNodeLeaf = bvhNodes[node.rightIndex].objectCount == 1;
      if(isLeftNodeLeaf){
        leftDist = leafBoundsIntersection(rayOrigin, rayDirection, castNodeToLeafNode(bvhNodes[node.leftIndex])).tNear;
      }
      else{
        leftDist = getDistanceToNode(rayOrigin, rayDirection, bvhNodes[node.leftIndex]);
      }
      if(isRightNodeLeaf){
        rightDist = leafBoundsIntersection(rayOrigin, rayDirection, castNodeToLeafNode(bvhNodes[node.rightIndex])).tNear;
      }
      else{
        rightDist = getDistanceToNode(rayOrigin, rayDirection, bvhNodes[node.rightIndex]);
      }
      let hitLeft = leftDist >= 0.0 && leftDist < closestRaymarchDist;
      let hitRight = rightDist >= 0.0 && rightDist < closestRaymarchDist;
      if(hitLeft){
        var nearIndex = node.leftIndex;
        // We hit both left and right, choose the closest one
        if(hitRight){
          if(leftDist < rightDist){
            // left is closer, push right to stack
            stack_push(&stack, node.rightIndex);
          } else {
            // right is closer, push left to stack
            stack_push(&stack, node.leftIndex);
            nearIndex = node.rightIndex;
          }
        }
        nodeIndex = nearIndex;
      }
      // We only hit the right Node
      else if(hitRight){
        nodeIndex = node.rightIndex;
      }
      // We didn't hit any node, pop the stack
      else{
        nodeIndex = stack_pop(&stack);
      }
    }

    iterations += 1;
    closestIntersection.colour += vec3<f32>(0.0075);
  }

  return closestIntersection;
}

fn rayMarchBVHFirstHit(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, distance: f32) -> bool {
  return rayMarchBVH(rayOrigin, rayDirection).hit;
}