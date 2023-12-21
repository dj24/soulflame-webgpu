const EPSILON = 0.001;
const MAX_RAY_STEPS = 512;

// Function to transform a normal vector from object to world space
fn transformNormal(inverseTransform: mat4x4<f32>, normal: vec3<f32>) -> vec3<f32> {
    let worldNormal = normalize((vec4<f32>(normal, 0.0) * inverseTransform).xyz);
    return worldNormal;
}

// Function to transform an object space position to world space
fn transformPosition(inverseTransform: mat4x4<f32>, position: vec3<f32>) -> vec3<f32> {
    let worldPosition = (vec4<f32>(position, 1.0) * inverseTransform).xyz;
    return worldPosition;
}

struct VoxelObject {
  transform: mat4x4<f32>,
  size : vec3<f32>,
  padding : f32
}

struct RayMarchResult {
  colour: vec3<f32>,
  normal: vec3<f32>,
  worldPos: vec3<f32>,
  hit: bool,
}

const MIN_RAY_DISTANCE = 0.5;

fn rayMarch(startingObjectIndex: i32, rayOrigin: vec3<f32>, rayDirection: vec3<f32>, voxelObjects: array<VoxelObject, VOXEL_OBJECT_COUNT>, voxelsSampler: sampler) -> RayMarchResult {
  var output = RayMarchResult();
  output.hit = false;
  output.colour = vec3(0.0);
  output.normal = vec3(0.0);
  output.worldPos = vec3(0.0);

  var voxelSize = 1.0;
  var tNear = 999999.0;
  var closestIntersection = 9999999.0;
  var stepsTaken = 0;
  var objectsTraversed = 0;

  for (var voxelObjectIndex = startingObjectIndex; voxelObjectIndex < VOXEL_OBJECT_COUNT; voxelObjectIndex++) {
    var voxelObject = voxelObjects[voxelObjectIndex];
    objectsTraversed ++;

    // Empty object, go to next
    if(voxelObject.size.x == 0.0){
      continue;
    }

    let objectRayOrigin = (voxelObject.transform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.transform * vec4<f32>(rayDirection, 0.0)).xyz;
    let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
    tNear = intersect.tNear;

    // bounding box is further away than the closest intersection, so we can skip this object
    let isInsideAlreadyMarchedVoxel = tNear > closestIntersection - EPSILON;
    if(isInsideAlreadyMarchedVoxel){
        continue;
    }

    let boundingBoxSurfacePosition = objectRayOrigin + (tNear - EPSILON)  * objectRayDirection;
    let isStartingInBounds = all(boundingBoxSurfacePosition > vec3(0.0)) && all(boundingBoxSurfacePosition < vec3(voxelObject.size / voxelSize));

    let isBackwardsIntersection = tNear < 0.0 && !isStartingInBounds;
    if(isBackwardsIntersection){
      continue;
    }

    var objectPos = boundingBoxSurfacePosition;
    var objectNormal = vec3(0.0);
    var tIntersection = 0.0;
    var voxelStep = sign(objectRayDirection);
    var tDelta = vec3(voxelSize / abs(objectRayDirection));
    var scaledStartingPoint = objectPos / voxelSize;
    var scaledRayOrigin = vec3<f32>(objectRayOrigin) / voxelSize;
    var currentIndex = floor(scaledStartingPoint);
    var voxelOriginDifference = vec3<f32>(currentIndex) - scaledRayOrigin;
    var clampedVoxelBoundary = (voxelStep * 0.5) + 0.5; // 0 if <= 0, 1 if > 0
    var tMax = (voxelStep * voxelOriginDifference + clampedVoxelBoundary) * tDelta + EPSILON;
    let maxSteps = max(voxelObject.size.x,voxelObject.size.y) * 2;
    var objectStepsTaken = 0;
    while(objectStepsTaken <= i32(maxSteps) && stepsTaken < MAX_RAY_STEPS)
    {
      stepsTaken ++;
      objectStepsTaken ++;
      tIntersection = min(min(tMax.x, tMax.y), tMax.z);
      let mask = vec3(
          select(0.0, 1.0, tMax.x == tIntersection),
          select(0.0, 1.0, tMax.y == tIntersection),
          select(0.0, 1.0, tMax.z == tIntersection)
      );
      tMax += mask * tDelta;
      currentIndex += mask * voxelStep;
      objectNormal = vec3(mask * -voxelStep);
      objectPos = objectRayOrigin + objectRayDirection * tIntersection;
      let isInBounds = all(currentIndex > vec3(-1.0)) && all(currentIndex < vec3(voxelObject.size / voxelSize));
      if(!isInBounds){
          break;
      }
      // we marched further than the closest intersection, so we are "inside" voxels now
      let isInsideAlreadyMarchedVoxel = tIntersection > closestIntersection + EPSILON;
      if(isInsideAlreadyMarchedVoxel){
          break;
      }
      let foo = textureSampleLevel(voxels, voxelsSampler, vec3(currentIndex) / voxelObject.size, 0.0);
      if(foo.a > 0.0 && tIntersection > MIN_RAY_DISTANCE){
          closestIntersection = tIntersection;
          output.worldPos = transformPosition(voxelObject.transform, objectPos);
          output.normal = transformNormal(voxelObject.transform,objectNormal);
          output.colour = foo.rgb;
          output.hit = true;
          break;
      }
    }
    if(output.hit){
      break;
    }
  }
  return output;
}