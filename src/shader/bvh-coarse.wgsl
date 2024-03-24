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
      if(!isInBounds(currentIndex, vec3<i32>(voxelObject.size))){
          break;
      }
    }
    return false;
}

fn rayMarchTransformedCoarse(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>) -> bool {
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    return rayMarchCoarse(voxelObject, objectRayDirection, objectRayOrigin);
}

// Used for shadows, return first hit
fn rayMarchBVHCoarse(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> bool {
  var stack = stack_new();
  stack_push(&stack, 0);

  var iterations = 0;
  var nodeIndex = 0;
  var furthestAABBDist = 0.0;

  while (stack.head > 0u && iterations <64) {
    let node = bvhNodes[nodeIndex];
    var voxelObjectIndex = -1;
    let leftDist = getDistanceToLeftNode(rayOrigin, rayDirection, node);
    let rightDist = getDistanceToRightNode(rayOrigin, rayDirection, node);
    let hitLeft = leftDist >= 0.0;
    let hitRight = rightDist >= 0.0;
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

    // valid leaf, raymarch it
    if(voxelObjectIndex != -1){
        // Raymarch the voxel object if it's a leaf node
        let voxelObject = voxelObjects[voxelObjectIndex];
        let isHit = rayMarchTransformedCoarse(voxelObject, rayDirection, rayOrigin + rayDirection * AABBDist);
        if(isHit){
          return true;
        }
    }
  }
  return false;
}