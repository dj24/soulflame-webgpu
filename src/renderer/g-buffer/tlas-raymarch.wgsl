
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

fn nodeRayIntersection(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, node: BVHNode) -> vec2<f32> {
  if(all(rayOrigin >= node.AABBMin) && all(rayOrigin <= node.AABBMax)){
    return vec2(0.0, 0.0);
  }
  let boxSize = (node.AABBMax - node.AABBMin) / 2;
  let offsetRayOrigin = rayOrigin - boxSize - node.AABBMin;
  let m: vec3<f32> = 1.0 / rayDirection;
  let n: vec3<f32> = m * offsetRayOrigin;
  let k: vec3<f32> = abs(m) * boxSize;
  let t1: vec3<f32> = -n - k;
  let t2: vec3<f32> = -n + k;
  let tN: f32 = max(max(t1.x, t1.y), t1.z);
  let tF: f32 = min(min(t2.x, t2.y), t2.z);
  return vec2(tN, tF);
}

@compute @workgroup_size(WORKGROUP_SIZE, WORKGROUP_SIZE, 1)
fn main(
  @builtin(global_invocation_id) globalId : vec3<u32>,
  @builtin(num_workgroups) numWorkgroups : vec3<u32>,
  @builtin(workgroup_id) workgroupId : vec3<u32>,
  @builtin(local_invocation_id) localId : vec3<u32>,
) {
    if(all(globalId.xy == vec2(0u))){
      atomicStore(&indirectBuffer[0], 0);
      atomicStore(&indirectBuffer[3], 0);
    }
    let screenWidth = numWorkgroups.xy * WORKGROUP_SIZE;
    let idx = vec2<u32>(globalId.xy);
    let uv = vec2<f32>(idx.xy) / vec2<f32>(screenWidth);
    let rayDirection = calculateRayDirection(uv, viewProjections.inverseViewProjection);
    let rayOrigin = cameraPosition;
    var stack = stack_new();
    stack_push(&stack, 0);
    var leafHitCount = 0;
    var iterations = 0;
    while (stack.head > 0u && iterations < 256 && leafHitCount < 16) {
      let node = bvhNodes[stack_pop(&stack)];
      if(node.objectCount > 1){
        let leftNode = bvhNodes[node.leftIndex];
        let rightNode = bvhNodes[node.rightIndex];
        let leftIntersect = nodeRayIntersection(rayOrigin, rayDirection, leftNode);
        let rightIntersect = nodeRayIntersection(rayOrigin, rayDirection, rightNode);
        let hitLeft = leftIntersect.x <= leftIntersect.y;
        let hitRight = rightIntersect.x <= rightIntersect.y;
        if(hitLeft && hitRight){
          if(leftIntersect.x < rightIntersect.x){
            stack_push(&stack, node.leftIndex);
            stack_push(&stack, node.rightIndex);
          }
          else{
            stack_push(&stack, node.rightIndex);
            stack_push(&stack, node.leftIndex);
          }
        }
        else{
          if(hitRight){
            stack_push(&stack, node.rightIndex);
          }
          if(hitLeft){
            stack_push(&stack, node.leftIndex);
          }
        }
      }
      else if(node.objectCount == 1){
        let currentCount = atomicAdd(&indirectBuffer[3], 1) + 1;
        if(currentCount % 256 == 0){
          atomicAdd(&indirectBuffer[0], 1);
        }
        screenRayBuffer[currentCount + 1] = vec3(vec2<i32>(idx.xy), node.leftIndex);
        leafHitCount += 1;
      }
      iterations += 1;
    }
}