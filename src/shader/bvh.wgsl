const BRICK_SIZE = 8;
const MAX_STEPS = 256;


struct BVHLeafNode {
  voxelObjectIndex: i32, // this is the index of the voxelObject for leaf nodes
  brickIndex: i32,
  objectCount: u32,
  AABBMin: vec3<f32>,
  AABBMax: vec3<f32>
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
        // Raymarch the voxel object if it's a leaf node
        let boxSize = (node.AABBMax - node.AABBMin) / 2;
        let intersection = boxIntersection(rayOrigin - node.AABBMin, rayDirection, boxSize);
        let AABBDist = intersection.tNear - EPSILON;
        let voxelObject = voxelObjects[leafNode.voxelObjectIndex]; // left index represents the voxel object index for leaf nodes
        let brick = brickBuffer[leafNode.brickIndex + i32(voxelObject.brickOffset)];
        if(AABBDist > closestRaymarchDist || !doesBrickContainVoxels(brick)){
          nodeIndex = stack_pop(&stack);
          continue;
        }
        let worldPos = rayOrigin + rayDirection * AABBDist;
        let objectPos = (voxelObject.inverseTransform * vec4(worldPos, 1.0)).xyz;
        let objectRayOrigin = (voxelObject.inverseTransform * vec4(rayOrigin, 1.0)).xyz;


        let brickPos = ((rayOrigin - node.AABBMin) + rayDirection * AABBDist) * 8.0;

        // Get the ray origin and direction in object space
        let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;

        let result = rayMarchBrick(brick, rayDirection, brickPos);

        if(result.hit){
//            closestIntersection.colour = brickPos / 8.0;
            closestIntersection.colour = result.normal;
            closestRaymarchDist = AABBDist;
            closestIntersection.worldPos = worldPos;
        }


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
//    closestIntersection.colour += vec3<f32>(0.0075);
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