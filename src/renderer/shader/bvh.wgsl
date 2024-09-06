const BRICK_SIZE = 8;
const MAX_BVH_STEPS = 256;
const MAX_STEPS = 256;


struct BVHNode {
  leftIndex: i32,
  rightIndex: i32,
  objectCount: u32,
  AABBMin: vec3<f32>,
  AABBMax: vec3<f32>
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

// Stack-based BVH traversal
fn rayMarchBVH(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> RayMarchResult {
  var closestIntersection = RayMarchResult();
 closestIntersection.t = FAR_PLANE;

  // Create a stack to store the nodes to visit
  var stack = stack_new();
  stack_push(&stack, 0);

  var iterations = 0;
  var closestRayMarchDistance = FAR_PLANE;

  while (stack.head > 0u && iterations < MAX_BVH_STEPS) {
    let nodeIndex = stack_pop(&stack);
    let node = bvhNodes[nodeIndex];
    if(node.objectCount > 1){
      let leftNode = bvhNodes[node.leftIndex];
      let rightNode = bvhNodes[node.rightIndex];
      let leftDist = getDistanceToNode(rayOrigin, rayDirection, leftNode);
      let rightDist = getDistanceToNode(rayOrigin, rayDirection, rightNode);
      let hitLeft = leftDist >= 0.0 && leftDist < closestIntersection.t;
      let hitRight = rightDist >= 0.0 && rightDist < closestIntersection.t;
      if(hitLeft && hitRight){
        if(leftDist < rightDist){
          // left is closer, push right to stack
          stack_push(&stack, node.rightIndex);
          stack_push(&stack, node.leftIndex);
        } else {
          // right is closer, push left to stack
          stack_push(&stack, node.leftIndex);
          stack_push(&stack, node.rightIndex);
        }
      }
      // We only hit the right Node
      else if(hitRight){
        stack_push(&stack, node.rightIndex);
      }
      else if(hitLeft){
        stack_push(&stack, node.leftIndex);
      }
    }
    // valid leaf, raymarch it
    else if(node.objectCount == 1){
        let distanceToLeaf = getDistanceToNode(rayOrigin, rayDirection, node);
        if(distanceToLeaf > closestIntersection.t){
          continue;
        }
        let voxelObject = voxelObjects[node.leftIndex];
        var rayMarchResult = rayMarchOctree(voxelObject, rayDirection, rayOrigin, 9999.0);
        if(rayMarchResult.hit && rayMarchResult.t < closestIntersection.t){
           closestIntersection = rayMarchResult;
        }
    }
    iterations += 1;
//    closestIntersection.colour += vec3<f32>(0.05);
  }

  return closestIntersection;
}