struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

struct BVHNode {
  leftIndex: i32,
  rightIndex: i32,

  leftObjectCount: u32,
  rightObjectCount: u32,

  leftMin: vec3<f32>,
  leftMax: vec3<f32>,

  rightMin: vec3<f32>,
  rightMax: vec3<f32>,
}

@group(0) @binding(0) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(3) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
// TODO: maybe make a G-Buffer bind group to resuse across shaders
@group(0) @binding(4) var normalTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(5) var albedoTex : texture_storage_2d<rgba8unorm, write>;
//@group(0) @binding(6) var depthRead : texture_2d<f32>;
@group(0) @binding(6) var depthWrite : texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var velocityTex : texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(9) var<uniform> sunDirection : vec3<f32>;
//TODO: make this a buffer
@group(0) @binding(10) var<storage> bvhNodes: array<BVHNode>;

const STACK_LEN: u32 = 24u;
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

fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

fn getVelocity(rayMarchResult: RayMarchResult, viewProjections: ViewProjectionMatrices) -> vec3<f32> {
  let vp = viewProjections.viewProjection;
    let previousVp = viewProjections.previousViewProjection;
    let modelMatrix = rayMarchResult.modelMatrix;
    let previousModelMatrix = rayMarchResult.previousModelMatrix;

    // Get current object space position of the current pixel
    let objectPos = rayMarchResult.objectPos.xyz;
    let objectClipSpace = vp * modelMatrix * vec4(objectPos.xyz, 1.0);
    let objectNDC = objectClipSpace.xyz / objectClipSpace.w;

    // Get previous position of the current object space position
    let previousObjectClipSpace = previousVp * previousModelMatrix * vec4(objectPos.xyz, 1.0);
    let previousObjectNDC = previousObjectClipSpace.xyz / previousObjectClipSpace.w;

    // Get velocity based on the difference between the current and previous positions
    var velocity = objectNDC - previousObjectNDC;
    velocity.y = -velocity.y;
  return velocity;
}

//fn BVHNodeIntersection(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, bvhNode: BVHNode) -> f32 {
//  let boxSize = (bvhNode.max.xyz - bvhNode.min.xyz) / 2;
//  let boxPosition = bvhNode.min.xyz;
//  let isInside = all(rayOrigin >= boxPosition - boxSize) && all(rayOrigin <= boxPosition + boxSize);
//  if(isInside){
//    return 0.0;
//  }
//  return boxIntersection(rayOrigin - boxPosition, rayDirection, boxSize).tNear;
////  return simpleBoxIntersection(rayOrigin - boxPosition, rayDirection, boxSize);
//}

fn getLeftChildIndex(index: i32) -> i32 {
  return index * 2 + 1;
}

fn getRightChildIndex(index: i32) -> i32 {
  return index * 2 + 2;
}

fn getParentIndex(index: i32) -> i32 {
  return (index - 1) / 2;
}

const FAR_PLANE = 10000.0;

fn swapu(a: ptr<function, u32>, b: ptr<function, u32>) {
  let temp = *a;
  *a = *b;
  *b = temp;
}

fn swapf(a: ptr<function, f32>, b: ptr<function, f32>) {
  let temp = *a;
  *a = *b;
  *b = temp;
}

fn swapi(a: ptr<function, i32>, b: ptr<function, i32>) {
  let temp = *a;
  *a = *b;
  *b = temp;
}

fn dirIsNegative(dir: vec3<f32>, axis: i32) -> bool {
  return dir[axis] < 0.0;
}

fn getDebugColour(index: i32) -> vec3<f32> {
  let colours = array<vec3<f32>, 6>(
    vec3<f32>(1.0, 0.0, 0.0),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(0.0, 0.0, 1.0),
    vec3<f32>(1.0, 1.0, 0.0),
    vec3<f32>(1.0, 0.0, 1.0),
    vec3<f32>(0.0, 1.0, 1.0)
  );
  return colours[index % 6];
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(albedoTex);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  let pixel = GlobalInvocationID.xy;
  let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  var rayOrigin = cameraPosition;
  var closestIntersection = RayMarchResult();
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;
  var isWater = false;

  // Floor plane for debugging
  let planeY = 0.0;
  let planeIntersect = planeIntersection(rayOrigin, rayDirection, vec3(0,1,0), planeY);
  if(planeIntersect.isHit){
    closestIntersection.worldPos = rayOrigin + rayDirection * planeIntersect.tNear;
    closestIntersection.worldPos.y = planeY;
    closestIntersection.hit = planeIntersect.isHit;
    closestIntersection.normal = planeIntersect.normal;
    closestIntersection.colour = vec3(0.15,0.3,0.1);
    isWater = true;
  }

//  textureStore(depthWrite, GlobalInvocationID.xy, vec4(vec3(0.0), FAR_PLANE));
//  textureStore(normalTex, GlobalInvocationID.xy, vec4(0.0));
//  textureStore(albedoTex, GlobalInvocationID.xy, vec4(0.0));
//  textureStore(velocityTex, pixel, vec4(0.0));





  var totalSteps = 0;
  let maxMipLevel = u32(0);
  let minMipLevel = u32(0);
  var mipLevel = maxMipLevel;

  var colour = vec3(0.0);


  var iterations = 0;
  var debugColour = vec3(0.0);

  var stack = stack_new();
//  stack_push(&stack, 0);
  var closestRaymarchDist = 1e30f;

  // TODO: make this struct
  var nodeIndex = 0;
  var intersect = 0.0;
  var voxelObjectIndex = -1;
  while (stack.head > 0u && iterations < 8) {
    let node = bvhNodes[nodeIndex];
    // Get the distance to the left and right child nodes
    let leftBoxSize = (node.leftMax - node.leftMin) / 2;
    let leftDist = boxIntersection(rayOrigin - node.leftMin, rayDirection, leftBoxSize).tNear;
    let rightBoxSize = (node.rightMax - node.rightMin) / 2;
    let rightDist = boxIntersection(rayOrigin - node.rightMin, rayDirection, rightBoxSize).tNear;
    let leftValid  = leftDist > -1.0 && leftDist < closestRaymarchDist;
    let rightValid = rightDist > -1.0 && rightDist < closestRaymarchDist;

    if (leftValid && rightValid) {
      // traverse the closer child first, push the other index to the stack
      if (leftDist < rightDist) {
          // TODO: update the stack push to account for left and right nodes being at the same level
          // sometimes the same node will need to be visited twice, so this logic isnt quite right
          nodeIndex  = node.leftIndex;
          stack_push(&stack, node.rightIndex);
          intersect = leftDist;
          let isLeaf = node.leftObjectCount == 1;
          voxelObjectIndex = select(-1, node.leftIndex, isLeaf);
      } else {
          nodeIndex  = node.rightIndex;
          stack_push(&stack, node.leftIndex);
          intersect = rightDist;
          let isLeaf = node.rightObjectCount == 1;
          voxelObjectIndex = select(-1, node.leftIndex, isLeaf);
      }
    }
    else if (leftValid) {
      nodeIndex = node.leftIndex;
      intersect = leftDist;
      let isLeaf = node.leftObjectCount == 1;
      voxelObjectIndex = select(-1, node.leftIndex, isLeaf);
      debugColour = vec3(1.0, 0.0, 0.0);
    }
    else if (rightValid) {
      nodeIndex = node.rightIndex;
      intersect = rightDist;
      let isLeaf = node.rightObjectCount == 1;
      voxelObjectIndex = select(-1, node.rightIndex, isLeaf);
      debugColour += vec3(0.0, 0.0, 0.5);
    } else {
      //traverse neither, go down the stack
      debugColour += vec3(1.0, 0.0, 0.0);
      nodeIndex = stack_pop(&stack);
    }

    // valid leaf
    if(voxelObjectIndex != -1){
      // Raymarch the voxel object if it's a leaf node
//      let voxelObject = voxelObjects[voxelObjectIndex];
//      debugColour = getDebugColour(voxelObjectIndex);
//      let raymarchResult = rayMarchTransformed(voxelObject, rayDirection, rayOrigin + rayDirection * intersect, 0);
//      let raymarchDist = distance(raymarchResult.worldPos, rayOrigin);

//      if(raymarchResult.hit && raymarchDist < closestRaymarchDist){
//        isWater = false;
//        closestIntersection = raymarchResult;
//        debugColour = raymarchResult.colour;
//        closestRaymarchDist = raymarchDist;
//      }
    }

//    debugColour += vec3(0.05);

    iterations += 1;
  }

    // TODO: pass object count as buffer, otherwise we waste time on empty objects
//      for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
//        let voxelObject = voxelObjects[i];
//        totalSteps += 1;
//        if(any(voxelObject.size == vec3(0.0))){
//          continue;
//        }
//        var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
//        let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
//        let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
//        let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size);
//        if(!intersect.isHit && !isInBounds) {
//          continue;
//        }
//        // Advance ray origin to the point of intersection
//        if(!isInBounds){
//          objectRayOrigin = objectRayOrigin + objectRayDirection * intersect.tNear + EPSILON;
//        }
//
//        // Bounds for octree node
//        let raymarchResult = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
//        if(raymarchResult.hit){
//          closestIntersection = raymarchResult;
//          break;
//        }
//      }

//  debugColour = vec3(f32(totalSteps)) / 120.0;

  let node = bvhNodes[0];
  let rightBoxSize = (node.rightMax - node.rightMin) / 2;
  let rightDist = boxIntersection(rayOrigin - node.rightMin, rayDirection, rightBoxSize).tNear;
  if(rightDist > -1.0){
    debugColour += vec3(0.0, 1.0, 0.0);
  }

  let normal = closestIntersection.normal;
  let depth = distance(cameraPosition, closestIntersection.worldPos);
  let albedo = closestIntersection.colour;
  let velocity = getVelocity(closestIntersection, viewProjections);

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(closestIntersection.worldPos, depth));
  textureStore(albedoTex, pixel, vec4(albedo + debugColour, 1));
  textureStore(normalTex, pixel, vec4(normal,1));
  textureStore(velocityTex, pixel, vec4(velocity,select(0.,1.,isWater)));
}
