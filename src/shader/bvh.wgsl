const BRICK_SIZE = 8;

fn getBrickMapIndex(objectPos: vec3<f32>) -> i32{
  return i32(objectPos.x / BRICK_SIZE) + i32(objectPos.y / BRICK_SIZE) * BRICK_SIZE + i32(objectPos.z / BRICK_SIZE) * BRICK_SIZE * BRICK_SIZE;
}

// Stack-based BVH traversal
fn rayMarchBVH(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> RayMarchResult {
  var closestIntersection = RayMarchResult();
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;

  // If the ray doesn't hit the root node, return the default intersection
//  if(getDistanceToNode(rayOrigin, rayDirection, bvhNodes[0]) <= 1.0){
//    return closestIntersection;
//  }

  // Create a stack to store the nodes to visit
  var stack = stack_new();
  stack_push(&stack, 0);

  // Track closest raymarch distance will let us skip nodes that are further than the closest raymarched object
  var closestRaymarchDist = 1e30f;
  var iterations = 0;
  var nodeIndex = 0;

  while (stack.head > 0u && iterations < 64) {
    let node = bvhNodes[nodeIndex];
    if(node.objectCount == 0){
      nodeIndex = stack_pop(&stack);
    }
    // valid leaf, raymarch it
    else if(node.objectCount == 1){
        // Raymarch the voxel object if it's a leaf node
        let voxelObject = voxelObjects[node.leftIndex]; // left index represents the voxel object index for leaf nodes
        let AABBDist = getDistanceToNode(rayOrigin, rayDirection, node);
        if(AABBDist > closestRaymarchDist){
          nodeIndex = stack_pop(&stack);
          continue;
        }
        let raymarchResult = rayMarchTransformed(voxelObject, rayDirection, rayOrigin + rayDirection * AABBDist, 0);
        let raymarchDist = distance(raymarchResult.worldPos, rayOrigin);
//        closestIntersection.colour = vec3(f32(raymarchResult.stepsTaken) * 0.02,0,0);


        if(raymarchResult.hit && raymarchDist < closestRaymarchDist - EPSILON){
//          closestIntersection = raymarchResult;
          let brickMapIndex = getBrickMapIndex(raymarchResult.objectPos);
          closestIntersection.colour = getDebugColour(brickMapIndex);
          closestRaymarchDist = raymarchDist;
        }
        // Pop the stack and continue
        nodeIndex = stack_pop(&stack);
    }
    else{
      let leftDist = getDistanceToNode(rayOrigin, rayDirection, bvhNodes[node.leftIndex]);
      let rightDist = getDistanceToNode(rayOrigin, rayDirection, bvhNodes[node.rightIndex]);
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

fn rayMarchBVHFirstHit(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, maxDistance: f32) -> bool {
    // Create a stack to store the nodes to visit
    var stack = stack_new();
    stack_push(&stack, 0);


    var iterations = 0;
    var nodeIndex = 0;

    while (stack.head > 0u && iterations < 128) {
      let node = bvhNodes[nodeIndex];
      if(node.objectCount == 0){
        nodeIndex = stack_pop(&stack);
      }
      // valid leaf, raymarch it
      else if(node.objectCount == 1){
          // Raymarch the voxel object if it's a leaf node
          let voxelObject = voxelObjects[node.leftIndex]; // left index represents the voxel object index for leaf nodes
          let AABBDist = getDistanceToNode(rayOrigin, rayDirection, node);
          if(AABBDist > maxDistance){
            nodeIndex = stack_pop(&stack);
            continue;
          }
          let raymarchResult = rayMarchTransformed(voxelObject, rayDirection, rayOrigin + rayDirection * AABBDist, 0);
          if(raymarchResult.hit && distance(raymarchResult.worldPos, rayOrigin) < maxDistance){
            return true;
          }
          // Pop the stack and continue
          nodeIndex = stack_pop(&stack);
      }
      else{
        let leftDist = getDistanceToNode(rayOrigin, rayDirection, bvhNodes[node.leftIndex]);
        let rightDist = getDistanceToNode(rayOrigin, rayDirection, bvhNodes[node.rightIndex]);
        let hitLeft = leftDist >= 0.0 && leftDist < maxDistance;
        let hitRight = rightDist >= 0.0 && rightDist < maxDistance;
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
    }

    return false;
}