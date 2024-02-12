struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(3) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
// TODO: maybe make a G-Buffer bind group to resuse across shaders
@group(0) @binding(4) var normalTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(5) var albedoTex : texture_storage_2d<rgba8unorm, write>;
//@group(0) @binding(6) var depthRead : texture_2d<f32>;
@group(0) @binding(6) var depthWrite : texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var velocityTex : texture_storage_2d<rg32float, write>;
@group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(9) var<uniform> sunDirection : vec3<f32>;
//TODO: make this a buffer
@group(0) @binding(10) var<storage> bvhNodes: array<BVHNode>;

var<private> BDEPTH: f32 = 0.;
var<private> TDEPTH: f32 = -1.;

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

fn BVHNodeIntersection(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, bvhNode: BVHNode) -> f32 {
  let boxSize = (bvhNode.max.xyz - bvhNode.min.xyz) / 2;
  let boxPosition = bvhNode.min.xyz;

  let isInside = all(rayOrigin >= boxPosition - boxSize) && all(rayOrigin <= boxPosition + boxSize);
  if(isInside){
    return 0.0;
  }
  return boxIntersection(rayOrigin - boxPosition, rayDirection, boxSize).tNear;
}

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

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(albedoTex);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  let pixel = GlobalInvocationID.xy;
  let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  let rayOrigin = cameraPosition;
  var closestIntersection = RayMarchResult();
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;

  // Floor plane for debugging
//  let planeIntersect = planeIntersection(rayOrigin, rayDirection, vec3(0,1,0), 0.0);
//  if(planeIntersect.isHit){
//    closestIntersection.worldPos = rayOrigin + rayDirection * planeIntersect.tNear;
//    closestIntersection.hit = planeIntersect.isHit;
//    closestIntersection.normal = planeIntersect.normal;
//    closestIntersection.colour = vec3(0.15,0.3,0.1);
//  }

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(vec3(0.0), FAR_PLANE));
  textureStore(normalTex, GlobalInvocationID.xy, vec4(0.0));
  textureStore(albedoTex, GlobalInvocationID.xy, vec4(0.0));
  textureStore(velocityTex, pixel, vec4(0.0));

  var totalSteps = 0;
  let maxMipLevel = u32(0);
  let minMipLevel = u32(0);
  var mipLevel = maxMipLevel;

    var colour = vec3(0.0);
    var nodeIndex = 0;

    var iterations = 0;
    var debugColour = vec3(0.0);

     var stack = stack_new();
    stack_push(&stack, 0);

    var voxelObjectIndex = -1;

    // TODO: make this struct
    var hit = 0.0;
    while (stack.head > 0u && iterations < 16) {
      nodeIndex = stack_pop(&stack);
      let node = bvhNodes[nodeIndex];
      let isLeaf = node.objectCount == 1;
      if(isLeaf){
      debugColour = vec3(0.0, 0.5, 0.0);
//        voxelObjectIndex = node.leftIndex;
        break;
      }

      let intersect = BVHNodeIntersection(rayOrigin, rayDirection, node);
      if(intersect < 0.0){
        continue;
      }
      debugColour += vec3(0.1, 0.0, 0.0);

      var minIndex = getLeftChildIndex(nodeIndex);
      var maxIndex = getRightChildIndex(nodeIndex);
//      minIndex = node.leftIndex;
//      maxIndex = node.rightIndex;

      let minChild = bvhNodes[minIndex];
      let maxChild = bvhNodes[maxIndex];

      var minDist = BVHNodeIntersection(rayOrigin, rayDirection, minChild);
      var maxDist = BVHNodeIntersection(rayOrigin, rayDirection, maxChild);

      // Ensure minDist is the closest intersection
      if(minDist > maxDist) {
        swapi(&minIndex, &maxIndex);
        swapf(&minDist, &maxDist);
      }
      // valid hit
      if(maxDist > -1.0) {
        stack_push(&stack, maxIndex);
      }
      if(minDist > -1.0) {
        stack_push(&stack, minIndex);
      }

      BDEPTH += 1.0;
      iterations += 1;
    }

      for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
        let voxelObject = voxelObjects[i];
        if(any(voxelObject.size == vec3(0.0))){
          continue;
        }
        var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
        let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
        let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
        let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size);
        if(!intersect.isHit && !isInBounds) {
          continue;
        }
        // Advance ray origin to the point of intersection
        if(!isInBounds){
          objectRayOrigin = objectRayOrigin + objectRayDirection * intersect.tNear + EPSILON;
        }

        // Bounds for octree node
        let raymarchResult = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
        if(raymarchResult.hit){
          closestIntersection = raymarchResult;
          break;
        }
      }

//      let voxelObject = voxelObjects[0];
//      var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
//      let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
//      let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
//      let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size);
//
//      // Advance ray origin to the point of intersection
//      if(!isInBounds){
//        objectRayOrigin = objectRayOrigin + objectRayDirection * intersect.tNear + EPSILON;
//      }
//
//      // Bounds for octree node
//      let raymarchResult = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
//      if(raymarchResult.hit){
//        closestIntersection = raymarchResult;
//      }


  let normal = closestIntersection.normal;
  let depth = distance(cameraPosition, closestIntersection.worldPos);
  let albedo = closestIntersection.colour;
  let velocity = getVelocity(closestIntersection, viewProjections);

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(closestIntersection.worldPos, depth));
  textureStore(albedoTex, pixel, vec4(albedo + debugColour, 1));
  textureStore(normalTex, pixel, vec4(normal,1));
  textureStore(velocityTex, pixel, vec4(velocity,0));
}
