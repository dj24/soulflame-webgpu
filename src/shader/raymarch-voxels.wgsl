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

fn isInBounds(position: vec3<f32>, size: vec3<f32>) -> bool {
  return all(position >= vec3<f32>(0.0)) && all(position <= size);
}

fn rayMarchAtMip(voxelObject: VoxelObject, objectRayDirection: vec3<f32>, objectRayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
  var output = RayMarchResult();
  let rayDirSign = sign(objectRayDirection);
  var currentIndex = floor(objectRayOrigin);
  var objectNormal = vec3(0.0);
  var tCurrent = 0.0;

  // RAYMARCH
  for(var i = 0; i < MAX_RAY_STEPS; i++)
  {
    output.stepsTaken = i;

    let atlasLocation = vec3<u32>(voxelObject.atlasLocation);
    let samplePosition = vec3<u32>(currentIndex) + atlasLocation;

    let mip0Index = currentIndex;
    let mip1Index = currentIndex / 2;
    let mip2Index = currentIndex / 4;

    let mip0SamplePosition = vec3<u32>(mip0Index) + atlasLocation;
    let mip1SamplePosition = vec3<u32>(mip1Index) + atlasLocation;
    let mip2SamplePosition = vec3<u32>(mip2Index) + atlasLocation;

    let mipSample0 = textureLoad(voxels, mip0SamplePosition, 0);
    let mipSample1 = textureLoad(voxels, mip1SamplePosition, 1);
    let mipSample2 = textureLoad(voxels, mip2SamplePosition, 2);

    // Hit voxel at finiest miplevel, return result
    if(mipSample0.a > 0.0){
        output.objectPos = objectRayOrigin + objectRayDirection * tCurrent;
        output.worldPos = transformPosition(voxelObject.transform, output.objectPos);
        output.normal = transformNormal(voxelObject.inverseTransform,objectNormal);
        output.colour = mipSample0.rgb;
        output.hit = true;
        output.modelMatrix = voxelObject.transform;
        output.previousModelMatrix = voxelObject.previousTransform;
        output.inverseModelMatrix = voxelObject.inverseTransform;
        output.previousInverseModelMatrix = voxelObject.previousInverseTransform;
        return output;
    }

    // Iterate to next voxel
    var voxelOriginDifference = currentIndex - objectRayOrigin;
    var tMax = voxelOriginDifference / objectRayDirection;
    tCurrent = min(min(tMax.x, tMax.y), tMax.z);
    let mask = vec3<f32>(tMax.xyz <= min(tMax.yzx, tMax.zxy));
    objectNormal = vec3(mask * -rayDirSign);
    currentIndex += mask * rayDirSign;

    if(!isInBounds(currentIndex, voxelObject.size)){
        break;
    }
  }
  return output;
}