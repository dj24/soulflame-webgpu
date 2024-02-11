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

fn BVHNodeIntersection(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, bvhNode: BVHNode) -> BoxIntersectionResult {
  let boxSize = (bvhNode.max.xyz - bvhNode.min.xyz) / 2;
  let boxPosition = bvhNode.min.xyz;

  let isInside = all(rayOrigin >= boxPosition - boxSize) && all(rayOrigin <= boxPosition + boxSize);
  if(isInside){
    return BoxIntersectionResult(0.0, 0.0, vec3(0.0), true);
  }
  return boxIntersection(rayOrigin - boxPosition, rayDirection, boxSize);
}

const FAR_PLANE = 10000.0;

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

    let maxDepth = 16;

    for(var i = 0; i < maxDepth; i++){
      iterations++;
      let bvhNode = bvhNodes[nodeIndex];
      let isLeaf = bvhNode.objectCount == 1;
      if(isLeaf){
        debugColour = vec3(0.0, 0.0, 1.0);
        break;
      }

      let leftIndex = bvhNode.leftIndex;
      let leftChild = bvhNodes[leftIndex];
      let leftIntersect = BVHNodeIntersection(rayOrigin, rayDirection, leftChild);

      let rightIndex = bvhNode.rightIndex;
      let rightChild = bvhNodes[rightIndex];
      let rightIntersect = BVHNodeIntersection(rayOrigin, rayDirection, rightChild);

      let leftIsCloser = leftIntersect.tNear < rightIntersect.tNear + EPSILON;
      let rightIsCloser = rightIntersect.tNear < leftIntersect.tNear;

      let isBothHit = leftIntersect.isHit && rightIntersect.isHit;
      let isOnlyLeftHit = leftIntersect.isHit && !rightIntersect.isHit;
      let isOnlyRightHit = rightIntersect.isHit && !leftIntersect.isHit;

      if(isOnlyLeftHit || (isBothHit && leftIsCloser)){
        nodeIndex = leftIndex;
        debugColour = vec3(1.0, 0, 0);
      }
      else if(isOnlyRightHit || (isBothHit && rightIsCloser)){
        nodeIndex = rightIndex;
        debugColour = vec3(0,0,1.0);
      } else{
        break; // TODO: go back up the tree
      }
    }

//      for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
//        let voxelObject = voxelObjects[i];
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
//        let raymarchResult = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 1);
//        if(raymarchResult.hit){
//          closestIntersection = raymarchResult;
//          break;
//        }
//      }

  let normal = closestIntersection.normal;
  let depth = distance(cameraPosition, closestIntersection.worldPos);
  let albedo = closestIntersection.colour;
  let velocity = getVelocity(closestIntersection, viewProjections);

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(closestIntersection.worldPos, depth));
  textureStore(albedoTex, pixel, vec4(albedo + vec3(f32(iterations) /f32(maxDepth) * 1.5) * debugColour, 1));
  textureStore(normalTex, pixel, vec4(normal,1));
  textureStore(velocityTex, pixel, vec4(velocity,0));
}
