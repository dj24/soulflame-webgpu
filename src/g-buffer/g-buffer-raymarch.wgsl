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
@group(0) @binding(3) var<storage> voxelObjects : array<VoxelObject>;
// TODO: maybe make a G-Buffer bind group to resuse across shaders
@group(0) @binding(4) var normalTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var albedoTex : texture_storage_2d<rgba8unorm, write>;
//@group(0) @binding(6) var depthRead : texture_2d<f32>;
//@group(0) @binding(6) var depthWrite : texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var velocityTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(9) var<uniform> sunDirection : vec3<f32>;


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

fn getLeftChildIndex(index: i32) -> i32 {
  return index * 2 + 1;
}

fn getRightChildIndex(index: i32) -> i32 {
  return index * 2 + 2;
}

fn getParentIndex(index: i32) -> i32 {
  return (index - 1) / 2;
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


fn customNormalize(value: f32, min: f32, max: f32) -> f32 {
    return (value - min) / (max - min);
}

fn catmullRomSpline(t: f32, p0: f32, p1: f32, p2: f32, p3: f32) -> f32 {
  let t2 = t * t;
  let t3 = t2 * t;
  return 0.5 * (
    (2.0 * p1) +
    (-p0 + p2) * t +
    (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
    (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
  );
}

/*

x o x
o x o
x o x

x o x o x
o x o x o
x o x o x
o x o x o
x o x o x

Incremental sampling pattern
1 o o o 2 o o o 1
o o o o o o o o o
o o 2 o o o 2 o o
o o o o o o o o o
2 o o o 1 o o o 2
o o o o o o o o o
o o 2 o o o 2 o o
o o o o o o o o o
1 o o o 2 o o o 1

*/

const SPATIAL_KERNEL_SIZE = 9;
const SPATIAL_SAMPLE_COUNT = 5;

const KERNEL_CORNER_OFFSETS = array<vec2<u32>, SPATIAL_SAMPLE_COUNT>(
  // First set
  vec2(0,0),
  vec2(8,0),
  vec2(0,8),
  vec2(8,8),
  vec2(4,4)
);

// TODO: incrementally sample more points if variance is high
@compute @workgroup_size(8, 8, 1)
fn adaptive(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(albedoTex);
  let originPixel = GlobalInvocationID.xy * (SPATIAL_KERNEL_SIZE);
  var albedos = array<vec3<f32>, SPATIAL_SAMPLE_COUNT>();
  var normals = array<vec3<f32>, SPATIAL_SAMPLE_COUNT>();
  var depths = array<f32, SPATIAL_SAMPLE_COUNT>();
  var worldPositions = array<vec3<f32>, SPATIAL_SAMPLE_COUNT>();
  var velocities = array<vec3<f32>, SPATIAL_SAMPLE_COUNT>();

  // first kernel
  for(var i = 0u; i < SPATIAL_SAMPLE_COUNT; i++){
    let pixelOffset = KERNEL_CORNER_OFFSETS[i];
//    let pixelOffset = getSpatialPosition(i, 3) * 4;
    let pixel = originPixel + pixelOffset;

    textureStore(albedoTex, pixel, vec4(1.0,0.0,0.0,1.0));
    textureStore(normalTex, pixel, vec4(0.0,0.0,0.0,1.0));
//    textureStore(depthWrite, pixel, vec4(0.0,0.0,0.0,FAR_PLANE));
    textureStore(velocityTex, pixel, vec4(0,0,0,0));

    var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
    let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
    var rayOrigin = cameraPosition;
    var closestIntersection = RayMarchResult();
    closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;

    // Floor plane for debugging
    let planeY = 0.0;
    let planeIntersect = planeIntersection(rayOrigin, rayDirection, vec3(0,1,0), planeY);
    if(planeIntersect.isHit){
      closestIntersection.worldPos = rayOrigin + rayDirection * planeIntersect.tNear;
      closestIntersection.worldPos.y = planeY;
      closestIntersection.hit = planeIntersect.isHit;
      closestIntersection.normal = planeIntersect.normal;
      closestIntersection.colour = vec3(0.15,0.3,0.1);
      // TODO: hit water here
    }

    let maxMipLevel = u32(0);
    let minMipLevel = u32(0);
    var mipLevel = maxMipLevel;

    let bvhResult = rayMarchBVH(rayOrigin, rayDirection);
//    if(bvhResult.hit){
      closestIntersection = bvhResult;
//    }

    let normal = closestIntersection.normal;
    let depth = distance(cameraPosition, closestIntersection.worldPos);
    let albedo = closestIntersection.colour;
    let velocity = getVelocity(closestIntersection, viewProjections);

    normals[i] = normal;
    albedos[i] = albedo;
    depths[i] = depth;
    worldPositions[i] = closestIntersection.worldPos;
    velocities[i] = velocity;
  }

  // Get averages
  var normal = vec3<f32>(0.0,0.0,0.0);
  var albedo = vec3<f32>(0.0,0.0,0.0);
  var worldPos = vec3<f32>(0.0,0.0,0.0);
  for(var i = 0; i < SPATIAL_SAMPLE_COUNT; i++){
    normal += normals[i];
    albedo += albedos[i];
    worldPos += worldPositions[i];
  }
  normal /= f32(SPATIAL_SAMPLE_COUNT);
  albedo /= f32(SPATIAL_SAMPLE_COUNT);
  worldPos /= f32(SPATIAL_SAMPLE_COUNT);

  var normalDiff = vec3<f32>(0.0,0.0,0.0);
  var albedoDiff = vec3<f32>(0.0,0.0,0.0);
  var worldPosDiff = vec3<f32>(0.0,0.0,0.0);
  for (var i = 0; i < SPATIAL_SAMPLE_COUNT; i++){
    normalDiff += abs(normals[i] - normal);
    albedoDiff += abs(albedos[i] - albedo);
    worldPosDiff += abs(worldPositions[i] - worldPos);
  }

  let depthWeight = 0.001;
  let normalWeight = 1.0;
  let albedoWeight = 1.0;


  var totalDiff = length(normalDiff) + length(albedoDiff) + length(worldPosDiff) * depthWeight;
  if(totalDiff > 0.05){
//if(true){
    // Difference is too high, sample more points
    let bufferIndex = atomicAdd(&indirectArgs.count, 1);
    groupsToFullyTrace[bufferIndex] = originPixel;
    return;
  }
  // TODO: linear interpolation instead of average colour
  for(var x = 0u; x < SPATIAL_KERNEL_SIZE; x++){
    for(var y = 0u; y < SPATIAL_KERNEL_SIZE; y++){
      var totalWeight = 0.0;
      var totalNormal = vec3<f32>(0.0,0.0,0.0);
      var totalAlbedo = vec3<f32>(0.0,0.0,0.0);
      var totalDepth = 0.0;
      var totalWorldPos = vec3<f32>(0.0,0.0,0.0);
      var totalVelocity = vec3<f32>(0.0,0.0,0.0);
      var weights = array<f32, SPATIAL_SAMPLE_COUNT>();
      let pixel = originPixel + vec2<u32>(x,y);

      var minWeight = 9999999999.0;
      var maxWeight = 0.0;
      for(var i = 0u; i < SPATIAL_SAMPLE_COUNT; i ++){
        let d = distance(vec2(f32(x),f32(y)), vec2<f32>(KERNEL_CORNER_OFFSETS[i]));
        let weight = 1.0 - d;
        minWeight = min(minWeight, weight);
        maxWeight = max(maxWeight, weight);
        weights[i] = weight;
      }

      for(var i = 0u; i < SPATIAL_SAMPLE_COUNT; i ++){
        let weight = customNormalize(weights[i], minWeight, maxWeight);
        totalNormal += normals[i] * weight;
        totalAlbedo += albedos[i] * weight;
        totalDepth += depths[i] * weight;
        totalWorldPos += worldPositions[i] * weight;
        totalVelocity += velocities[i] * weight;
        totalWeight += weight;
      }

//      textureStore(albedoTex, pixel, vec4((totalWorldPos / totalWeight) % 1, 1));
      textureStore(albedoTex, pixel, vec4(totalAlbedo / totalWeight, 1));
      textureStore(normalTex, pixel, vec4(totalNormal / totalWeight,1));
//      textureStore(depthWrite, pixel, vec4(totalWorldPos / totalWeight, totalDepth / totalWeight));
      textureStore(velocityTex, pixel, vec4(totalVelocity / totalWeight,0));
    }
  }
}


@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let resolution = textureDimensions(albedoTex);
  let pixel = GlobalInvocationID.xy;
  var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
//  uv.y = 1.0 - uv.y;
  let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  var rayOrigin = cameraPosition;
  var closestIntersection = RayMarchResult();
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;
  closestIntersection.colour = rayDirection;

  // Floor plane for debugging
  let planeY = 0.0;
  let planeIntersect = planeIntersection(rayOrigin, rayDirection, vec3(0,1,0), planeY);
  if(planeIntersect.isHit){
    closestIntersection.worldPos = rayOrigin + rayDirection * planeIntersect.tNear;
    closestIntersection.worldPos.y = planeY;
    closestIntersection.hit = planeIntersect.isHit;
    closestIntersection.normal = planeIntersect.normal;
    closestIntersection.colour = vec3(0.15,0.3,0.1);
    // TODO: hit water here
  }

  let maxMipLevel = u32(0);
  let minMipLevel = u32(0);
  var mipLevel = maxMipLevel;

  let bvhResult = rayMarchBVH(rayOrigin, rayDirection);
//  if(bvhResult.hit){
    closestIntersection = bvhResult;
//  }

  let normal = closestIntersection.normal;
  let depth = distance(cameraPosition, closestIntersection.worldPos);
  let albedo = closestIntersection.colour;
  let velocity = getVelocity(closestIntersection, viewProjections);
  let worldPos = closestIntersection.worldPos;


  let objectPos = (voxelObjects[0].inverseTransform * vec4(worldPos, 1.0)).xyz;
//  textureStore(albedoTex, pixel, vec4(rayDirection, 1));
  textureStore(albedoTex, pixel, vec4(albedo, 1));
//  textureStore(albedoTex, pixel, vec4(0,0,1, 1));
  textureStore(normalTex, pixel, vec4(normal,1));
//  textureStore(depthWrite, pixel, vec4(worldPos, depth));
  textureStore(velocityTex, pixel, vec4(velocity ,0));
}

@compute @workgroup_size(SPATIAL_KERNEL_SIZE, SPATIAL_KERNEL_SIZE, 1)
fn fullTrace(
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
  @builtin(workgroup_id) WorkgroupID : vec3<u32>,
) {
   let resolution = textureDimensions(albedoTex);
  let pixelOffset = LocalInvocationID.xy;
  let groupOrigin = groupsToFullyTrace[WorkgroupID.x];
//  let groupOrigin = vec2(500 + (WorkgroupID.x % 50) * SPATIAL_KERNEL_SIZE, 500 + (WorkgroupID.x / 50) * SPATIAL_KERNEL_SIZE);
  let pixel = groupOrigin + pixelOffset;

  var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
  let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  var rayOrigin = cameraPosition;
  var closestIntersection = RayMarchResult();
  closestIntersection.worldPos = rayOrigin + rayDirection * FAR_PLANE;
  closestIntersection.colour = rayDirection;

  // Floor plane for debugging
  let planeY = 0.0;
  let planeIntersect = planeIntersection(rayOrigin, rayDirection, vec3(0,1,0), planeY);
  if(planeIntersect.isHit){
    closestIntersection.worldPos = rayOrigin + rayDirection * planeIntersect.tNear;
    closestIntersection.worldPos.y = planeY;
    closestIntersection.hit = planeIntersect.isHit;
    closestIntersection.normal = planeIntersect.normal;
    closestIntersection.colour = vec3(0.15,0.3,0.1);
    // TODO: hit water here
  }

  let maxMipLevel = u32(0);
  let minMipLevel = u32(0);
  var mipLevel = maxMipLevel;

  let bvhResult = rayMarchBVH(rayOrigin, rayDirection);
  if(bvhResult.hit){
    closestIntersection = bvhResult;
  }

  let normal = closestIntersection.normal;
  let depth = distance(cameraPosition, closestIntersection.worldPos);
  let albedo = closestIntersection.colour;
  let velocity = getVelocity(closestIntersection, viewProjections);
  let worldPos = closestIntersection.worldPos;

  textureStore(albedoTex, pixel, vec4(albedo, 1));
//  textureStore(albedoTex, pixel, vec4(0,0,1, 1));
  textureStore(normalTex, pixel, vec4(normal,1));
//  textureStore(depthWrite, pixel, depth);
  textureStore(velocityTex, pixel, vec4(velocity ,0));
}
