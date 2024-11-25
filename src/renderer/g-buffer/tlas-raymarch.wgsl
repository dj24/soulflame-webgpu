
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

fn nodeFrustumCornersIntersection(rayOrigin: vec3<f32>, idx: vec2<i32>, screenWidth:vec2<u32>, node: BVHNode) -> bool {
  if(all(rayOrigin >= node.AABBMin) && all(rayOrigin <= node.AABBMax)){
    return true;
  }
  let idx00 = vec2<u32>(idx * 4);
  let idx10 = vec2<u32>(idx * 4 + vec2(4, 0));
  let idx01 = vec2<u32>(idx * 4 + vec2(0, 4));
  let idx11 = vec2<u32>(idx * 4 + vec2(4, 4));

  let uv00 = vec2<f32>(idx.xy) / vec2<f32>(screenWidth);
  let uv10 = vec2<f32>(idx10) / vec2<f32>(screenWidth);
  let uv01 = vec2<f32>(idx01) / vec2<f32>(screenWidth);
  let uv11 = vec2<f32>(idx11) / vec2<f32>(screenWidth);

  let rayDirection00 = calculateRayDirection(uv00, viewProjections.inverseViewProjection);
  let rayDirection10 = calculateRayDirection(uv10, viewProjections.inverseViewProjection);
  let rayDirection01 = calculateRayDirection(uv01, viewProjections.inverseViewProjection);
  let rayDirection11 = calculateRayDirection(uv11, viewProjections.inverseViewProjection);

  let boxSize = (node.AABBMax - node.AABBMin) / 2;
  let hit00 = boxIntersection(rayOrigin - node.AABBMin, rayDirection00, boxSize).isHit;
  let hit10 = boxIntersection(rayOrigin - node.AABBMin, rayDirection10, boxSize).isHit;
  let hit01 = boxIntersection(rayOrigin - node.AABBMin, rayDirection01, boxSize).isHit;
  let hit11 = boxIntersection(rayOrigin - node.AABBMin, rayDirection11, boxSize).isHit;

  return hit00 || hit10 || hit01 || hit11;
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
    let resolution = textureDimensions(outputTex);
    let idx = vec2<i32>(globalId.xy * 4);
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
        if(newCount % 16 == 0){
          atomicAdd(&indirectBuffer[2], 1);
        }
        screenRayBuffer[newCount] = vec3(vec2<i32>(idx.xy), node.leftIndex);
        leafHitCount += 1;
      }
      if(node.objectCount > 1){
        let leftNode = bvhNodes[node.leftIndex];
        let rightNode = bvhNodes[node.rightIndex];
        let hitLeft = nodeFrustumCornersIntersection(rayOrigin, idx.xy,resolution, leftNode);
        let hitRight = nodeFrustumCornersIntersection(rayOrigin, idx.xy,resolution, rightNode);
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