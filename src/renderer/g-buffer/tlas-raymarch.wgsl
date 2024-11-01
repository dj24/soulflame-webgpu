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

const STACK_LEN: u32 = 32u;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) idx : vec3<u32>,
) {
    var texSize = textureDimensions(outputTex);
    let uv = vec2<f32>(idx.xy) / vec2<f32>(texSize.xy);
    let rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
    let rayOrigin = cameraPosition;

    var stack = stack_new();
    stack_push(&stack, 0);
    var iterations = 0;
    var hitLeafIndex = 0;

    while (stack.head > 0u && iterations < 256 && hitLeafIndex < i32(texSize.z)) {
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
        textureStore(outputTex, vec3(idx.xy, u32(hitLeafIndex)), vec4(i32(node.leftIndex)));
        hitLeafIndex += 1;
      }
      iterations += 1;
    }

    // We hit a leaf, store the screen position and update the indirect buffer
    if(hitLeafIndex > 0){
      let currentCount = atomicAdd(&indirectBuffer[0], 1);
      screenRayBuffer[currentCount + 1] = idx.xy;
    }
}