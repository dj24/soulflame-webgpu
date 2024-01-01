const EPSILON = 0.0001;
const MAX_RAY_STEPS = 512;

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

struct VoxelObject {
  transform: mat4x4<f32>,
  inverseTransform: mat4x4<f32>,
  size : vec3<f32>,
  sizePadding : f32,
  atlasLocation : vec3<f32>,
  atlasLocationPadding : f32,
}

struct RayMarchResult {
  colour: vec3<f32>,
  normal: vec3<f32>,
  worldPos: vec3<f32>,
  hit: bool,
}

fn rayMarch(startingObjectIndex: i32, rayOrigin: vec3<f32>, rayDirection: vec3<f32>, voxelObjects: array<VoxelObject, VOXEL_OBJECT_COUNT>, voxelsSampler: sampler) -> RayMarchResult {
  var output = RayMarchResult();
  output.hit = false;
  output.colour = vec3(0.0);
  output.normal = vec3(0.0);
  output.worldPos = vec3(0.0);

  var voxelSize = 1.0;
  var tNear = 999999.0;
  var clostestDistance = 9999999.0;
  var stepsTaken = 0;
  var objectsTraversed = 0;

  for (var voxelObjectIndex = startingObjectIndex; voxelObjectIndex < VOXEL_OBJECT_COUNT; voxelObjectIndex++) {
    var voxelObject = voxelObjects[voxelObjectIndex];
    objectsTraversed ++;

    // Empty object, go to next
    if(voxelObject.size.x == 0.0){
      continue;
    }

    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;

    let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
    tNear = intersect.tNear + EPSILON;

    let boundingBoxSurfacePosition = objectRayOrigin + tNear * objectRayDirection;
    let isStartingInBounds = all(objectRayOrigin >= vec3(-1.0)) && all(objectRayOrigin < vec3(voxelObject.size / voxelSize));
    let isBackwardsIntersection = tNear < EPSILON && !isStartingInBounds;
    if(isBackwardsIntersection){
      continue;
    }

    var tIntersection = tNear;
    var objectPos = boundingBoxSurfacePosition;
    var voxelStep = sign(objectRayDirection);
    var tDelta = vec3(voxelSize / abs(objectRayDirection));
    let scaledRayOrigin = vec3<f32>(objectRayOrigin) / voxelSize;
    var currentIndex = floor(objectPos / voxelSize);
    var voxelOriginDifference = currentIndex - scaledRayOrigin;
    var clampedVoxelBoundary = (voxelStep * 0.5) + 0.5; // 0 if <= 0, 1 if > 0
    var tMax = (voxelStep * voxelOriginDifference + clampedVoxelBoundary) * tDelta;
    let maxSteps = max(voxelObject.size.x,voxelObject.size.y) * 2;
    var objectStepsTaken = 0;
    let mask = vec3(
        select(0.0, 1.0, tMax.x == tIntersection),
        select(0.0, 1.0, tMax.y == tIntersection),
        select(0.0, 1.0, tMax.z == tIntersection)
    );
    var objectNormal = intersect.normal;

    while(objectStepsTaken <= i32(maxSteps) && stepsTaken < MAX_RAY_STEPS)
    {
      let worldPos = transformPosition(voxelObject.transform, objectPos);
      let hitDistance = distance(worldPos, rayOrigin);

      stepsTaken ++;
      objectStepsTaken ++;
      tIntersection = min(min(tMax.x, tMax.y), tMax.z);

      let isInBounds = all(currentIndex >= vec3(0.0)) && all(currentIndex <= vec3(voxelObject.size / voxelSize));
      if(!isInBounds){
          break;
      }

      let foo = textureLoad(voxels, vec3<u32>(currentIndex) + vec3<u32>(voxelObject.atlasLocation), 0);

      if(foo.a > 0.0 && tIntersection > EPSILON && hitDistance < clostestDistance){
          clostestDistance = hitDistance;
          output.worldPos = transformPosition(voxelObject.transform, objectPos);
          output.normal = transformNormal(voxelObject.inverseTransform,objectNormal);
          output.colour = foo.rgb;
          output.hit = true;
          break; // Found hit in this object, continue to next
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
  }
  return output;
}