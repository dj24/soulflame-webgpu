const EPSILON = 0.0001;
const MAX_RAY_STEPS = 256;

// Function to transform a normal vector from object to world space
fn transformNormal(inverseTransform: mat4x4<f32>, normal: vec3<f32>) -> vec3<f32> {
    let worldNormal = normalize((vec4<f32>(normal, 0.0) * inverseTransform).xyz);
    return worldNormal;
}

// Function to transform an object space position to world space
fn transformPosition(transform: mat4x4<f32>, position: vec3<f32>) -> vec3<f32> {
    let worldPosition = (transform * vec4<f32>(position, 1.0)).xyz;
    return worldPosition;
}

fn getMaxMipLevel(size: vec3<f32>) -> u32 {
  return u32(log2(max(size.x, max(size.y, size.z))));
}

struct VoxelObject {
  transform: mat4x4<f32>,
  inverseTransform: mat4x4<f32>,
  previousTransform: mat4x4<f32>,
  previousInverseTransform: mat4x4<f32>,
  size : vec3<f32>,
  sizePadding : f32,
  atlasLocation : vec3<f32>,
  atlasLocationPadding : f32,
}

struct RayMarchResult {
  colour: vec3<f32>,
  normal: vec3<f32>,
  objectPos: vec3<f32>,
  worldPos: vec3<f32>,
  hit: bool,
  modelMatrix: mat4x4<f32>,
  previousModelMatrix: mat4x4<f32>,
  inverseModelMatrix: mat4x4<f32>,
  previousInverseModelMatrix: mat4x4<f32>,
  stepsTaken: i32,
}

fn rayMarchAtMip(voxelObject: VoxelObject, objectRayDirection: vec3<f32>, objectRayOrigin: vec3<f32>, mipLevel: u32, boundsMin: vec3<i32>, boundsMax: vec3<i32>) -> RayMarchResult {
  var output = RayMarchResult();
  let voxelStep = sign(objectRayDirection);
  let voxelSize = pow(2.0, f32(mipLevel));
  let tDelta = voxelSize / abs(objectRayDirection);
  let scaledRayOrigin = objectRayOrigin / voxelSize;
  var currentIndex = floor(scaledRayOrigin);
  var voxelOriginDifference = currentIndex - scaledRayOrigin;
  var clampedVoxelBoundary = (voxelStep * 0.5) + 0.5; // 0 if <= 0, 1 if > 0
  var tMax = (voxelStep * voxelOriginDifference + clampedVoxelBoundary) * tDelta;
  var objectNormal = vec3(0.0);
  var objectPos = vec3(0.0);
  var tIntersection = 0.0;

  // RAYMARCH
  for(var i = 0; i < MAX_RAY_STEPS; i++)
  {
    output.stepsTaken = i;
    let isInBounds = all(currentIndex >= vec3<f32>(boundsMin)) && all(currentIndex <= vec3<f32>(boundsMax));
    if(!isInBounds){
        break;
    }
    tIntersection = min(min(tMax.x, tMax.y), tMax.z);
    // Check for voxel at current index
    let atlasLocation = vec3<u32>(voxelObject.atlasLocation / voxelSize);
    let voxelSample = textureLoad(voxels, vec3<u32>(currentIndex) + atlasLocation, mipLevel);
    if(voxelSample.a > 0.0 && tIntersection > EPSILON){
        output.objectPos = objectPos;
        output.worldPos = transformPosition(voxelObject.transform, objectPos);
        output.normal = transformNormal(voxelObject.inverseTransform,objectNormal);
        output.colour = voxelSample.rgb;
        output.hit = true;
        output.modelMatrix = voxelObject.transform;
        output.previousModelMatrix = voxelObject.previousTransform;
        output.inverseModelMatrix = voxelObject.inverseTransform;
        output.previousInverseModelMatrix = voxelObject.previousInverseTransform;
        return output;
    }

    // Iterate to next voxel
    let mask = vec3(
        select(0.0, 1.0, tMax.x == tIntersection),
        select(0.0, 1.0, tMax.y == tIntersection),
        select(0.0, 1.0, tMax.z == tIntersection)
    );
    tMax += mask * tDelta;
    currentIndex += mask * voxelStep;
    objectNormal = vec3(mask * -voxelStep);
    objectPos = objectRayOrigin + objectRayDirection * tIntersection;
  }
  return output;
}