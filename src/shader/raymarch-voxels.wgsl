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
  worldPos: vec3<f32>,
  hit: bool,
  modelMatrix: mat4x4<f32>,
  previousModelMatrix: mat4x4<f32>,
  inverseModelMatrix: mat4x4<f32>,
  previousInverseModelMatrix: mat4x4<f32>,
}

fn rayMarchAtMip(voxelObject: VoxelObject, objectRayDirection: vec3<f32>, objectRayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
  var output = RayMarchResult();
  var voxelSize = pow(2.0, f32(mipLevel));
  var tIntersection = 0.0;
  var objectPos = objectRayOrigin + tIntersection * objectRayDirection;
  var voxelStep = sign(objectRayDirection);
  var tDelta = vec3(voxelSize / abs(objectRayDirection));
  let scaledRayOrigin = vec3<f32>(objectRayOrigin) / voxelSize;
  var currentIndex = floor(objectPos / voxelSize);
  var voxelOriginDifference = currentIndex - scaledRayOrigin;
  var clampedVoxelBoundary = (voxelStep * 0.5) + 0.5; // 0 if <= 0, 1 if > 0
  var tMax = (voxelStep * voxelOriginDifference + clampedVoxelBoundary) * tDelta;
  var objectNormal = vec3(0.0);

  // RAYMARCH
  for(var i = 0; i < MAX_RAY_STEPS; i++)
  {
    let worldPos = transformPosition(voxelObject.transform, objectPos);
    tIntersection = min(min(tMax.x, tMax.y), tMax.z);
    let isInBounds = all(currentIndex >= vec3(0.0)) && all(currentIndex <= vec3(voxelObject.size / voxelSize));
    if(!isInBounds){
        break;
    }

    let atlasLocation = vec3<u32>(voxelObject.atlasLocation / voxelSize);
    let voxelSample = textureLoad(voxels, vec3<u32>(currentIndex) + atlasLocation, mipLevel);
    output.colour = mix(vec3(0,0,1), vec3(1,0.7,0.5), vec3<f32>(f32(i) / f32(MAX_RAY_STEPS)));
    if(voxelSample.a > 0.0 && tIntersection > EPSILON){
        output.worldPos = transformPosition(voxelObject.transform, objectPos);
        output.normal = transformNormal(voxelObject.inverseTransform,objectNormal);
//        output.colour = voxelSample.rgb;
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

fn rayMarch(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, voxelObjects: array<VoxelObject, VOXEL_OBJECT_COUNT>) -> RayMarchResult {
  var output = RayMarchResult();
  output.hit = false;
  output.colour = vec3(0.0);
  output.normal = vec3(0.0);
  // TODO: output distance instead - this is a hack to make sure the distance is high when we hit nothing
  output.worldPos = rayOrigin + rayDirection * 1000000.0;
  output.modelMatrix = mat4x4<f32>(vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0));
  output.previousModelMatrix = mat4x4<f32>(vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.0));

  // TODO: depth sort voxel objects, maybe track closest hit
  for (var voxelObjectIndex = 0; voxelObjectIndex < VOXEL_OBJECT_COUNT; voxelObjectIndex++) {
    var voxelObject = voxelObjects[0];
    let isObjectEmpty = voxelObject.size.x == 0.0;
    if(isObjectEmpty){
      continue;
    }
    // Raycast in object space
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size);
    if(!isInBounds){
      let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
      if(!intersect.isHit){
        continue;
      }
      objectRayOrigin = objectRayOrigin + objectRayDirection * intersect.tNear + EPSILON;
    }

    var mipLevel = getMaxMipLevel(voxelObject.size);
    mipLevel = 0;
    var result = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, mipLevel);
    output = result;
  }
  return output;
}