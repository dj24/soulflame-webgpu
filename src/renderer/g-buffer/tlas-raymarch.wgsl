
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

struct Frustum {
  planes: array<vec4<f32>, 4>,
}

fn projectWorldToUV(worldPosition: vec3<f32>, viewProjection: mat4x4<f32>) -> vec2<f32> {
  let clipSpace = viewProjection * vec4<f32>(worldPosition, 1.0);
  let ndc = clipSpace.xyz / clipSpace.w;
  var uv = ndc.xy * 0.5 + 0.5;
  uv.x = 1.0 - uv.x;
  uv.y = 1.0 - uv.y;
  return uv;
}

fn createFrustum(originPixel: vec2<u32>, numWorkgroups: vec2<u32>) -> Frustum {
  let uv00 = vec2<f32>(originPixel) / vec2<f32>(numWorkgroups * WORKGROUP_SIZE);
  let uv10 = vec2<f32>(originPixel + vec2(1, 0)) / vec2<f32>(numWorkgroups * WORKGROUP_SIZE);
  let uv01 = vec2<f32>(originPixel + vec2(0, 1)) / vec2<f32>(numWorkgroups * WORKGROUP_SIZE);
  let uv11 = vec2<f32>(originPixel + vec2(1, 1)) / vec2<f32>(numWorkgroups * WORKGROUP_SIZE);

  let ray00 = calculateRayDirection(uv00, viewProjections.inverseViewProjection);
  let ray10 = calculateRayDirection(uv10, viewProjections.inverseViewProjection);
  let ray01 = calculateRayDirection(uv01, viewProjections.inverseViewProjection);
  let ray11 = calculateRayDirection(uv11, viewProjections.inverseViewProjection);

  let planeLeft = vec4<f32>(cross(ray00, ray01), 0.0);
  let planeRight = vec4<f32>(cross(ray11, ray10), 0.0);
  let planeTop = vec4<f32>(cross(ray01, ray11), 0.0);
  let planeBottom = vec4<f32>(cross(ray10, ray00), 0.0);

  return Frustum(array<vec4<f32>, 4>(planeLeft, planeRight, planeTop, planeBottom));
}

fn nodeScreenRectIntersect(basePixel: vec2<u32>, node: BVHNode, numWorkgroups: vec2<u32>) -> vec4<f32> {
  var minUV = vec2<f32>(1.0);
  var maxUV = vec2<f32>(0.0);
  for(var i = 0u; i < 8u; i = i + 1u){
    let corner = nodeCorners[i];
    let uv = projectWorldToUV(corner, viewProjections.viewProjection);
    minUV = min(minUV, uv);
    maxUV = max(maxUV, uv);
  }


}

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
    let frustum = createFrustum(idx.xy, numWorkgroups.xy);
    let rayOrigin = cameraPosition;
    var stack = stack_new();
    stack_push(&stack, 0);

    var leafHitCount = 0;
    var hitIndices = array<i32, 16>(-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1);

    // Raymarch centroid pixel
    var iterations = 0;
    while (stack.head > 0u && iterations < 256 && leafHitCount < 1) {
      let node = bvhNodes[stack_pop(&stack)];
      if(node.objectCount > 1){
        let leftNode = bvhNodes[node.leftIndex];
        let rightNode = bvhNodes[node.rightIndex];
        let hitLeft = nodeFrustumIntersection(frustum, leftNode);
        let hitRight = nodeFrustumIntersection(frustum, rightNode);
//        let hitLeft = nodeRayIntersection(rayOrigin, rayDirection, leftNode) >= 0.0;
//        let hitRight = nodeRayIntersection(rayOrigin, rayDirection, rightNode) >= 0.0;

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
        screenRayBuffer[currentCount + 1] = vec3(vec2<i32>(idx.xy * WORKGROUP_SIZE), node.leftIndex);
        leafHitCount += 1;
      }
      iterations += 1;
    }



}