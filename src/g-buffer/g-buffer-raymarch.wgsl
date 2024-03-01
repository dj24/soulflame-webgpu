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
@group(0) @binding(4) var normalTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(5) var albedoTex : texture_storage_2d<rgba8unorm, write>;
//@group(0) @binding(6) var depthRead : texture_2d<f32>;
@group(0) @binding(6) var depthWrite : texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var velocityTex : texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(9) var<uniform> sunDirection : vec3<f32>;

const NEAR_PLANE = 1.0;


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

//  textureStore(depthWrite, GlobalInvocationID.xy, vec4(vec3(0.0), FAR_PLANE));
//  textureStore(normalTex, GlobalInvocationID.xy, vec4(0.0));
//  textureStore(albedoTex, GlobalInvocationID.xy, vec4(0.0));
//  textureStore(velocityTex, pixel, vec4(0.0));


  var totalSteps = 0;
  let maxMipLevel = u32(0);
  let minMipLevel = u32(0);
  var mipLevel = maxMipLevel;

  var colour = vec3(0.0);

  let bvhResult = rayMarchBVH(rayOrigin, rayDirection);
  if(bvhResult.hit){
    closestIntersection = bvhResult;
  }

//  debugColour = mix(vec3(0.1,0.2,1.0), vec3(1.0,0.5, 0.0), f32(totalSteps) / 64.0);

  let normal = closestIntersection.normal;
  let depth = distance(cameraPosition, closestIntersection.worldPos);
  let albedo = closestIntersection.colour;
  let velocity = getVelocity(closestIntersection, viewProjections);
  let isWater = false;

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(closestIntersection.worldPos, depth));
  textureStore(albedoTex, pixel, vec4(albedo, 1));
  textureStore(normalTex, pixel, vec4(normal,1));
  textureStore(velocityTex, pixel, vec4(velocity,select(0.,1.,isWater)));
}
