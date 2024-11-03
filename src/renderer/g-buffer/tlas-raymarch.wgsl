
const STACK_LEN: u32 = 32u;

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

fn nodeRayIntersection(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, node: BVHNode) -> f32 {
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

const WORKGROUP_SIZE: u32 = 8u;
const NEIGHBOR_PIXEL_POSITIONS: array<vec2<i32>, 8> = array<vec2<i32>, 8>(
  vec2<i32>(-1, -1),
  vec2<i32>(0, -1),
  vec2<i32>(1, -1),
  vec2<i32>(-1, 0),
  vec2<i32>(1, 0),
  vec2<i32>(-1, 1),
  vec2<i32>(0, 1),
  vec2<i32>(1, 1)
);

@compute @workgroup_size(WORKGROUP_SIZE, WORKGROUP_SIZE, 1)
fn main(
  @builtin(global_invocation_id) idx : vec3<u32>,
  @builtin(num_workgroups) numWorkgroups : vec3<u32>,
) {
    let uv = vec2<f32>(idx.xy) / vec2<f32>(numWorkgroups.xy * WORKGROUP_SIZE);
    let rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
    let rayOrigin = cameraPosition;
    var stack = stack_new();
    stack_push(&stack, 0);

    var leafHitCount = 0;
    var hitIndices = array<i32, 16>(-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1);

    // Raymarch centroid pixel
    var iterations = 0;
    while (stack.head > 0u && iterations < 256 && leafHitCount < 16) {
      let nodeIndex = stack_pop(&stack);
      let node = bvhNodes[nodeIndex];
      if(node.objectCount > 1){
        let leftNode = bvhNodes[node.leftIndex];
        let rightNode = bvhNodes[node.rightIndex];
        let leftDist = nodeRayIntersection(rayOrigin, rayDirection, leftNode);
        let rightDist = nodeRayIntersection(rayOrigin, rayDirection, rightNode);
        let hitLeft = leftDist >= 0.0;
        let hitRight = rightDist >= 0.0;
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
        hitIndices[leafHitCount] = node.leftIndex;
        leafHitCount += 1;
      }
      iterations += 1;
    }

    // Raymarch neighbor pixels
    for(var i = 0u; i < 8u; i = i + 1){
      iterations = 0;
      let neighborPixel = vec2<i32>(idx.xy) + NEIGHBOR_PIXEL_POSITIONS[i];
      let uv = vec2<f32>(neighborPixel) / vec2<f32>(numWorkgroups.xy * WORKGROUP_SIZE);
      if(any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))){
        continue;
      }
      let rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
      var stack = stack_new();
      stack_push(&stack, 0);
      while (stack.head > 0u && iterations < 256 && leafHitCount < 16) {
        let nodeIndex = stack_pop(&stack);
        let node = bvhNodes[nodeIndex];
        if(node.objectCount > 1){
          let leftNode = bvhNodes[node.leftIndex];
          let rightNode = bvhNodes[node.rightIndex];
          let leftDist = nodeRayIntersection(rayOrigin, rayDirection, leftNode);
          let rightDist = nodeRayIntersection(rayOrigin, rayDirection, rightNode);
          let hitLeft = leftDist >= 0.0;
          let hitRight = rightDist >= 0.0;
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
        else if(node.objectCount == 1){
          // Check if we already hit this leaf
          var alreadyHit = false;
          for(var j = 0u; j < 16u; j = j + 1){
            if(hitIndices[j] == node.leftIndex){
              alreadyHit = true;
              break;
            }
          }
          if(!alreadyHit){
            hitIndices[leafHitCount] = node.leftIndex;
            leafHitCount += 1;
          }
        }
        iterations += 1;
      }
    }


     // We hit a leaf, store the screen position and update the indirect buffer
     for(var i = 0u; i < 16u; i = i + 1){
        let nodeIndex = hitIndices[i];
        if(nodeIndex == -1){
          break;
        }
        let currentCount = atomicAdd(&indirectBuffer[0], 1);
        screenRayBuffer[currentCount + 1] = vec3(vec2<i32>(idx.xy * WORKGROUP_SIZE), nodeIndex);
     }

}