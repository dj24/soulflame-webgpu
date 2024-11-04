
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

const WORKGROUP_SIZE: u32 = 8u;

fn nodeRayIntersection(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, node: BVHNode) -> bool {
  if(all(rayOrigin >= node.AABBMin) && all(rayOrigin <= node.AABBMax)){
    return true;
  }
  let boxSize = (node.AABBMax - node.AABBMin) / 2;
  return boxIntersection(rayOrigin - node.AABBMin, rayDirection, boxSize).isHit;
}

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
    var iterations = 0;
    while (stack.head > 0u && iterations < 256 && leafHitCount < 4) {
      let node = bvhNodes[stack_pop(&stack)];
      if(node.objectCount > 1){
        let leftNode = bvhNodes[node.leftIndex];
        let rightNode = bvhNodes[node.rightIndex];
        let hitLeft = nodeRayIntersection(rayOrigin, rayDirection, leftNode);
        let hitRight = nodeRayIntersection(rayOrigin, rayDirection, rightNode);

        if(hitRight){
          stack_push(&stack, node.rightIndex);
        }
        if(hitLeft){
          stack_push(&stack, node.leftIndex);
        }
      }
      // valid leaf, raymarch it
      else if(node.objectCount == 1){
        let currentCount = atomicAdd(&indirectBuffer[0], 1);
        screenRayBuffer[currentCount + 1] = vec3(vec2<i32>(idx.xy), node.leftIndex);
        leafHitCount += 1;
      }
      iterations += 1;
    }



}