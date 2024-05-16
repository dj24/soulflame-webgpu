struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};


fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

fn getVelocity(objectPos: vec3<f32>, modelMatrix: mat4x4<f32>, previousModelMatrix: mat4x4<f32>, viewProjections: ViewProjectionMatrices) -> vec3<f32> {
  let vp = viewProjections.viewProjection;
  let previousVp = viewProjections.previousViewProjection;

  // Get current object space position of the current pixel
  let objectClipSpace = vp * modelMatrix * vec4(objectPos.xyz, 1.0);
  let objectNDC = objectClipSpace.xyz / objectClipSpace.w;

  // Get previous position of the current object space position
  let previousObjectClipSpace = previousVp * previousModelMatrix * vec4(objectPos.xyz, 1.0);
  let previousObjectNDC = previousObjectClipSpace.xyz / previousObjectClipSpace.w;

  // Get velocity based on the difference between the current and previous positions
  var velocity = previousObjectNDC - objectNDC;
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

fn tracePixel(pixel: vec2<u32>){
   let resolution = textureDimensions(albedoTex);
   var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
   let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
    var rayOrigin = cameraPosition;
    var closestIntersection = RayMarchResult();

    let bvhResult = rayMarchBVH(rayOrigin, rayDirection);
    if(!bvhResult.hit){
      textureStore(albedoTex, pixel, vec4(0));
      textureStore(normalTex, pixel, vec4(0));
      textureStore(velocityTex, pixel, vec4(0));
      textureStore(depthWrite, pixel, vec4(FAR_PLANE, 0, 0, 0));
      return;
    }
    closestIntersection = bvhResult;

    let voxelObject = voxelObjects[closestIntersection.voxelObjectIndex];
    let paletteX = i32(closestIntersection.palettePosition * 255.0);
    let paletteY = i32(voxelObject.paletteIndex);
    let albedo = textureLoad(paletteTex, vec2(paletteX, paletteY), 0).rgb;
    let normal = closestIntersection.normal;
    let velocity = getVelocity(closestIntersection.objectPos, voxelObject.transform, voxelObject.previousTransform, viewProjections);
    let worldPos = closestIntersection.worldPos;
    let depth = distance(cameraPosition, worldPos);

    textureStore(albedoTex, pixel, vec4(albedo, 1));
    textureStore(normalTex, pixel, vec4(normal,1));
    textureStore(velocityTex, pixel, vec4(velocity ,0));
    textureStore(depthWrite, pixel, vec4(depth, 0, 0, 0));
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(local_invocation_index) LocalInvocationIndex : u32,
  @builtin(workgroup_id) WorkgroupID : vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  tracePixel(GlobalInvocationID.xy);
}