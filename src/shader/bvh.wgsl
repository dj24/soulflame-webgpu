fn rayMarchBVH(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> RayMarchResult {
  var closestIntersection = RayMarchResult();
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;

  var stack = stack_new();
  stack_push(&stack, 0);

  var closestRaymarchDist = 1e30f;
  var iterations = 0;
  var nodeIndex = 0;
  var furthestAABBDist = 0.0;

  while (stack.head > 0u && iterations < 128) {
    let node = bvhNodes[nodeIndex];
    var voxelObjectIndex = -1;
    let leftDist = getDistanceToLeftNode(rayOrigin, rayDirection, node);
    let rightDist = getDistanceToRightNode(rayOrigin, rayDirection, node);
    let hitLeft = leftDist >= 0.0 && leftDist < closestRaymarchDist;
    let hitRight = rightDist >= 0.0 && rightDist < closestRaymarchDist;
    var AABBDist = 0.0;
    if(hitLeft){
      var nearIndex = node.leftIndex;
      AABBDist = leftDist;
      voxelObjectIndex = getVoxelObjectIndexFromFromLeftNode(node);
      if(hitRight){
        if(leftDist < rightDist){
          nearIndex = node.leftIndex;
          AABBDist = leftDist;
          voxelObjectIndex = getVoxelObjectIndexFromFromLeftNode(node);
          // left is closer, push right to stack
          stack_push(&stack, node.rightIndex);
        } else {
          nearIndex = node.rightIndex;
          AABBDist = rightDist;
          voxelObjectIndex = getVoxelObjectIndexFromFromRightNode(node);
          // right is closer, push left to stack
          // TODO: only push to the stack for non-leaf nodes, perhaps go back to single node struct layout
          stack_push(&stack, node.leftIndex);
        }
      }
      nodeIndex = nearIndex;
    } else if(hitRight){
      nodeIndex = node.rightIndex;
      AABBDist = rightDist;
      voxelObjectIndex = getVoxelObjectIndexFromFromRightNode(node);
    } else{
      nodeIndex = stack_pop(&stack);
    }
    iterations += 1;
    closestIntersection.colour += vec3<f32>(0.0075);

        // valid leaf, raymarch it
    if(voxelObjectIndex != -1){
//         closestIntersection.colour = debugColourFromIndex(voxelObjectIndex);
        // Raymarch the voxel object if it's a leaf node
        let voxelObject = voxelObjects[voxelObjectIndex];
        let raymarchResult = rayMarchTransformed(voxelObject, rayDirection, rayOrigin + rayDirection * AABBDist, 0);
        let raymarchDist = distance(raymarchResult.worldPos, rayOrigin);
        if(raymarchResult.hit && raymarchDist < closestRaymarchDist - EPSILON){
          closestIntersection = raymarchResult;
          closestRaymarchDist = raymarchDist;
        }
//        voxelObjectIndex = -1;
    }
  }

//  closestIntersection.colour = mix(vec3(0,0,1), vec3(1,0.3,0.05), length(closestIntersection.colour));

  return closestIntersection;
}