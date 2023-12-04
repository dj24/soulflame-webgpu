struct FrustumCornerDirections {
  topLeft : vec3<f32>,
  topRight : vec3<f32>,
  bottomLeft : vec3<f32>,
  bottomRight : vec3<f32>
}

fn calculateRayDirection(uv: vec2<f32>, directions: FrustumCornerDirections) -> vec3<f32> {
  let topInterpolated = mix(directions.topLeft, directions.topRight, uv.x);
  let bottomInterpolated = mix(directions.bottomLeft, directions.bottomRight, uv.x);
  let finalInterpolated = mix(bottomInterpolated, topInterpolated, uv.y);
  return normalize(finalInterpolated);
}

fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

struct BoxIntersectionResult {
    tNear: f32,
    tFar: f32,
    normal: vec3<f32>,
}

fn boxIntersection(
    ro: vec3<f32>,
    rd: vec3<f32>,
    boxSize: vec3<f32>,
) -> BoxIntersectionResult {
    var result = BoxIntersectionResult();

    let offsetRayOrigin = ro - boxSize;
    let m: vec3<f32> = 1.0 / rd;
    let n: vec3<f32> = m * offsetRayOrigin;
    let k: vec3<f32> = abs(m) * boxSize;

    let t1: vec3<f32> = -n - k;
    let t2: vec3<f32> = -n + k;

    let tN: f32 = max(max(t1.x, t1.y), t1.z);
    let tF: f32 = min(min(t2.x, t2.y), t2.z);

    if (tN > tF || tF < 0.0) {
        result.tNear = -1.0;
        result.tFar = -1.0;
        result.normal = vec3(0.0);

        return result;
    }

    // Check if the ray starts inside the volume
    let insideVolume = tN < 0.0;

    var normal = select(
        step(vec3<f32>(tN), t1),
        step(t2, vec3<f32>(tF)),
        tN < 0.0,
    );

    normal *= -sign(rd);

    // Check if the intersection is in the correct direction, only if inside the volume
    if (insideVolume && dot(normal, rd) < 0.0) {
        result.tNear = -1.0;
        result.tFar = -1.0;
        result.normal = vec3(0.0);
        return result;
    }



    result.tNear = tN;
    result.tFar = tF;
    result.normal = normal;

    return result;
}

struct VoxelObject {
  transform: mat4x4<f32>,
  size : vec3<f32>,
  padding : f32
}

@group(0) @binding(0) var outputTex : texture_storage_2d<rgba8unorm, write>;
//@group(0) @binding(1) var<uniform> time : u32;
@group(0) @binding(2) var<uniform> resolution : vec2<u32>;
@group(0) @binding(3) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(5) var<uniform> voxelObjects : array<VoxelObject, 2>; // TODO: dynamic amount of these using string interpolation

const EPSILON = 0.0001;
const BORDER_WIDTH = 0.05;
const MAX_RAY_STEPS = 256;

fn addVoxelBorderColour(baseColour: vec3<f32>, worldPos: vec3<f32>) -> vec3<f32> {
  let positionInVoxel = fract(worldPos);
  let voxelBorder = step(positionInVoxel, vec3(1 - BORDER_WIDTH)) - step(positionInVoxel, vec3(BORDER_WIDTH));
  let isVoxelBorder = step(length(voxelBorder), 1.0);
  return mix(baseColour,baseColour * 0.8,isVoxelBorder);
}

fn addBoundsBorderColour(baseColour: vec3<f32>, worldPos: vec3<f32>, bounds: vec3<f32>) -> vec3<f32> {
  let positionInBounds = fract(worldPos / bounds);
  let boundsBorderWidth = BORDER_WIDTH / bounds * 4.0;
  let boundsBorder = step(positionInBounds, vec3(1 - boundsBorderWidth)) - step(positionInBounds, vec3(boundsBorderWidth));
  let isBoundsBorder = step(length(boundsBorder), 1.0);
  return mix(baseColour,vec3(1.0,0.0,1.0),isBoundsBorder);
}

fn sampleVoxel(position: vec3<f32>) -> bool {
  let layer1 = (sin(position.x * 0.25) - sin(position.z * 0.25)) * 2;
  let layer2 = (sin(position.x * 0.125) - sin(position.z * 0.125)) * 4;
  let isSolidVoxel = layer1 + layer2 > (position.y - 32);
  return isSolidVoxel;
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  // background
  var voxelSize = 1.0;
  let pixel = vec2<f32>(f32(GlobalInvocationID.x), f32(resolution.y - GlobalInvocationID.y));
  let uv = pixel / vec2<f32>(resolution);
  var rayOrigin = cameraPosition;
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var colour = sample_sky(rayDirection);
  let plainIntersection = plainIntersect(rayOrigin, rayDirection, vec4<f32>(0.0, 1.0, 0.0, 0.0));
  if(plainIntersection > 0.0){
    let worldPos = plainIntersection * rayDirection + rayOrigin;
    var borderColour = addVoxelBorderColour(colour, worldPos * 0.25);
    colour = borderColour;
  }

  // voxel objects
  var voxelObject = voxelObjects[0];
  rayOrigin = (voxelObject.transform * vec4<f32>(rayOrigin, 1.0)).xyz;
  rayDirection = (voxelObject.transform * vec4<f32>(rayDirection, 0.0)).xyz;
  let intersect = boxIntersection(rayOrigin, rayDirection, voxelObject.size * 0.5);
  let tNear = intersect.tNear;
  let boundingBoxSurfacePosition = rayOrigin + (tNear - EPSILON)  * rayDirection;
  let isStartingInBounds = all(boundingBoxSurfacePosition > vec3(0.0)) && all(boundingBoxSurfacePosition < vec3(voxelObject.size / voxelSize));

  if(tNear > 0.0 || isStartingInBounds){
    var pos = boundingBoxSurfacePosition;
    var normal = vec3(0.0);
    var stepsTaken = 0;
    var voxelStep = sign(rayDirection);
    var tIntersection = 0.0;
    var tDelta = vec3(voxelSize / abs(rayDirection));
    var scaledStartingPoint = pos / voxelSize;
    var scaledRayOrigin = vec3<f32>(rayOrigin) / voxelSize;
    var currentIndex = floor(scaledStartingPoint);
    var voxelOriginDifference = vec3<f32>(currentIndex) - scaledRayOrigin;
    var clampedVoxelBoundary = (voxelStep * 0.5) + 0.5; // 0 if <= 0, 1 if > 0
    var tMax = (voxelStep * voxelOriginDifference + clampedVoxelBoundary) * tDelta + EPSILON;
    var occlusion = false;

    while(stepsTaken <= MAX_RAY_STEPS)
    {
      tIntersection = min(min(tMax.x, tMax.y), tMax.z);
      let mask = vec3(
          select(0.0, 1.0, tMax.x == tIntersection),
          select(0.0, 1.0, tMax.y == tIntersection),
          select(0.0, 1.0, tMax.z == tIntersection)
      );
      tMax += mask * tDelta;
      currentIndex += mask * voxelStep;
      normal = vec3(mask * -voxelStep);
      pos = rayOrigin + rayDirection * tIntersection;
      stepsTaken ++;
      let isInBounds = all(currentIndex > vec3(-1.0)) && all(currentIndex < vec3(voxelObject.size / voxelSize));
      if(!isInBounds){
          break;
      }
      if(sampleVoxel(currentIndex)){
          occlusion = true;
          break;
      }
    }

    if(occlusion){
      colour = normal;
      colour = addVoxelBorderColour(colour, pos);
    }
  }

  textureStore(outputTex, GlobalInvocationID.xy, vec4(colour,1));
}
