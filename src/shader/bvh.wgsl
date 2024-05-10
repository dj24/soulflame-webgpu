const BRICK_SIZE = 8;
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
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;

  // Create a stack to store the nodes to visit
  var stack = stack_new();
  stack_push(&stack, 0);

  var iterations = 0;
  var nodeIndex = 0;

  while (stack.head > 0u && iterations < MAX_STEPS) {
    let node = bvhNodes[nodeIndex];
    if(node.objectCount > 1){
      let leftNode = bvhNodes[node.leftIndex];
      let rightNode = bvhNodes[node.rightIndex];
      let leftDist = getDistanceToNode(rayOrigin, rayDirection, leftNode);
      let rightDist = getDistanceToNode(rayOrigin, rayDirection, rightNode);
      let hitLeft = leftDist >= 0.0;
      let hitRight = rightDist >= 0.0;
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
    // valid leaf, raymarch it
    else if(node.objectCount == 1){
        let distanceToLeaf = getDistanceToNode(rayOrigin, rayDirection, node);
        if(distanceToLeaf < 0.0){
          nodeIndex = stack_pop(&stack);
          continue;
        }
        let worldPos = rayOrigin + rayDirection * distanceToLeaf;
        let voxelObject = voxelObjects[node.leftIndex];
//          let rayMarchResult = rayMarchTransformed(voxelObject, rayDirection, worldPos, 0);
        let rayMarchResult = rayMarchOctree(voxelObject, rayDirection, worldPos, 3);
        if(rayMarchResult.hit){
          return rayMarchResult;
        }

        nodeIndex = stack_pop(&stack);
    }

    iterations += 1;
//    closestIntersection.colour += vec3<f32>(0.0075);
  }

  return closestIntersection;
}

const MAX_SHADOW_BVH_VISITS = 8;

fn rayMarchBVHShadows(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, mipLevel: u32) -> RayMarchResult {
   var closestIntersection = RayMarchResult();
   closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;

   // Create a stack to store the nodes to visit
   var stack = stack_new();
   stack_push(&stack, 0);

   var iterations = 0;
   var nodeIndex = 0;

   while (stack.head > 0u && iterations < MAX_SHADOW_BVH_VISITS) {
     let node = bvhNodes[nodeIndex];
     if(node.objectCount > 1){
       let leftNode = bvhNodes[node.leftIndex];
       let rightNode = bvhNodes[node.rightIndex];
       let leftDist = getDistanceToNode(rayOrigin, rayDirection, leftNode);
       let rightDist = getDistanceToNode(rayOrigin, rayDirection, rightNode);
       let hitLeft = leftDist >= 0.0;
       let hitRight = rightDist >= 0.0;
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
     // valid leaf, raymarch it
     else if(node.objectCount == 1){
         let distanceToLeaf = getDistanceToNode(rayOrigin, rayDirection, node);
         if(distanceToLeaf < 0.0){
           nodeIndex = stack_pop(&stack);
           continue;
         }
         let worldPos = rayOrigin + rayDirection * distanceToLeaf;
         let voxelObject = voxelObjects[node.leftIndex];
           let rayMarchResult = rayMarchTransformed(voxelObject, rayDirection, worldPos, 1);
//         let rayMarchResult = rayMarchOctree(voxelObject, rayDirection, worldPos, 3);
         if(rayMarchResult.hit){
           return rayMarchResult;
         }

         nodeIndex = stack_pop(&stack);
     }

     iterations += 1;
 //    closestIntersection.colour += vec3<f32>(0.0075);
   }

   return closestIntersection;
 }