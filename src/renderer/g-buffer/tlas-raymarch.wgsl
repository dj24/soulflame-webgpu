
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
  @builtin(global_invocation_id) globalId : vec3<u32>,
  @builtin(num_workgroups) numWorkgroups : vec3<u32>,
  @builtin(workgroup_id) workgroupId : vec3<u32>,
  @builtin(local_invocation_id) localId : vec3<u32>,
) {
    if(all(globalId.xy == vec2(0u))){
      atomicStore(&indirectBuffer[2], 0);
      atomicStore(&indirectBuffer[3], 0);
    }
    let screenWidth = numWorkgroups.xy * WORKGROUP_SIZE * 3;
    let idx = vec2<u32>(globalId.xy * 3);
    let uv = vec2<f32>(idx.xy) / vec2<f32>(screenWidth);
    let rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
    let rayOrigin = cameraPosition;
    var stack = stack_new();
    stack_push(&stack, 0);
    var leafHitCount = 0;
    var iterations = 0;
    while (stack.head > 0u && iterations < 256 && leafHitCount < 16) {
      let node = bvhNodes[stack_pop(&stack)];
      if(node.objectCount == 1){
        let newCount = atomicAdd(&indirectBuffer[3], 1) + 1;
        if(newCount >= 1000000){
          return;
        }
        if(newCount % 8 == 0){
          atomicAdd(&indirectBuffer[2], 1);
        }
        screenRayBuffer[newCount] = vec3(vec2<i32>(idx.xy), node.leftIndex);
        leafHitCount += 1;
      }
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
      iterations += 1;
    }
}