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


const GROUPS_X = 8;
const GROUPS_Y = 8;

@compute @workgroup_size(GROUPS_X, GROUPS_Y, 1)
fn main(
  @builtin(local_invocation_index) LocalInvocationIndex : u32,
  @builtin(workgroup_id) WorkgroupID : vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let resolution = textureDimensions(albedoTex);
  let pixel = GlobalInvocationID.xy;
  var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
  let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  var rayOrigin = cameraPosition;
  var closestIntersection = RayMarchResult();

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
  textureStore(normalTex, pixel, vec4(normal,1));
  textureStore(velocityTex, pixel, vec4(velocity ,0));
}