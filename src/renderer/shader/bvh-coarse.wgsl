const MAX_COARSE_RAY_STEPS = 64;

fn rayMarchCoarse(voxelObject: VoxelObject, objectRayDirection: vec3<f32>, objectRayOrigin: vec3<f32>) -> bool {
    let atlasLocation = vec3<u32>(voxelObject.atlasLocation);
    var voxelSize = vec3<f32>(1.0);
    var objectPos = objectRayOrigin;
    var currentIndex = vec3<i32>(round(objectPos));
    var tDelta = voxelSize / abs(objectRayDirection);
    var tIncrement = min(tDelta.x, min(tDelta.y, tDelta.z));

    for(var i = 0; i < MAX_COARSE_RAY_STEPS; i++)
    {
      let samplePosition = objectPos + voxelObject.atlasLocation;
      let uv = samplePosition / vec3<f32>(textureDimensions(voxels));
      let mipSample0 = textureSampleLevel(voxels, nearestSampler, uv, 0.0);

      if(mipSample0.a > 0.0){
          return true;
      }

      objectPos += objectRayDirection * tIncrement;
      currentIndex = vec3<i32>(round(objectPos));
//      if(!isInBounds(currentIndex, vec3<i32>(voxelObject.size))){
//          break;
//      }
    }
    return false;
}

fn rayMarchTransformedCoarse(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>) -> bool {
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    return rayMarchCoarse(voxelObject, objectRayDirection, objectRayOrigin);
}

// Used for shadows, return first hit
fn rayMarchBVHCoarse(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, maxDistance: f32) -> bool {
  // Create a stack to store the nodes to visit
      var stack = stack_new();
      stack_push(&stack, 0);

      var iterations = 0;
      var nodeIndex = 0;

      while (stack.head > 0u && iterations < 32) {
        let node = bvhNodes[nodeIndex];
        if(node.objectCount == 0){
          nodeIndex = stack_pop(&stack);
        }
        // valid leaf, raymarch it
        else if(node.objectCount == 1){
            // Raymarch the voxel object if it's a leaf node
            let voxelObject = voxelObjects[node.leftIndex]; // left index represents the voxel object index for leaf nodes
            let AABBDist = nodeRayIntersection(rayOrigin, rayDirection, node);
            if(rayMarchTransformedCoarse(voxelObject, rayDirection, rayOrigin + rayDirection * AABBDist)){
              return true;
            }
            // Pop the stack and continue
            nodeIndex = stack_pop(&stack);
        }
        else{
          let leftDist = nodeRayIntersection(rayOrigin, rayDirection, bvhNodes[node.leftIndex]);
          let rightDist = nodeRayIntersection(rayOrigin, rayDirection, bvhNodes[node.rightIndex]);
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