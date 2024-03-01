const EPSILON = 0.0001;
const MAX_RAY_STEPS = 128;

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
  atlasLocation : vec3<f32>,
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

fn isInBounds(position: vec3<i32>, size: vec3<i32>) -> bool {
  return all(position >= vec3(0)) && all(position <= size - vec3(1));
}

fn getMipLevelFromVoxelSize(voxelSize: vec3<f32>) -> u32 {
  return u32(log2(max(voxelSize.x, max(voxelSize.y, voxelSize.z))));
}

fn rayMarchAtMip(voxelObject: VoxelObject, objectRayDirection: vec3<f32>, objectRayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
  var output = RayMarchResult();
  let rayDirSign = sign(objectRayDirection);

  var voxelSize = vec3<f32>(2.0);
  var shiftedRayOrigin = objectRayOrigin - objectRayDirection * EPSILON;
  var objectPos = shiftedRayOrigin;
  var currentIndex = vec3<i32>(floor(objectPos));
  var scaledRayOrigin =  objectRayOrigin/ voxelSize;
  var scaledObjectPos = floor(objectPos / voxelSize);
  var scaledOriginDifference = scaledObjectPos - scaledRayOrigin;
  var tMax = voxelSize * (rayDirSign * scaledOriginDifference + (rayDirSign * 0.5) + 0.5) / abs(objectRayDirection);
  let mask = vec3<f32>(tMax.xyz <= min(tMax.yzx, tMax.zxy));
  var objectNormal = mask * -rayDirSign;
  var tCurrent = min(tMax.x, min(tMax.y, tMax.z));

  // RAYMARCH
  for(var i = 0; i < MAX_RAY_STEPS; i++)
  {
    output.stepsTaken = i;

    let atlasLocation = vec3<u32>(voxelObject.atlasLocation);
    let samplePosition = vec3<u32>(currentIndex) + atlasLocation;

    let mip0Index = currentIndex;
    let mip1Index = currentIndex / 2;
    let mip2Index = currentIndex / 4;
    let mip3Index = currentIndex / 8;
    let mip4Index = currentIndex / 16;

    let mip0SamplePosition = vec3<u32>(mip0Index) + atlasLocation;
    let mip1SamplePosition = vec3<u32>(mip1Index) + atlasLocation;
    let mip2SamplePosition = vec3<u32>(mip2Index) + atlasLocation;
    let mip3SamplePosition = vec3<u32>(mip3Index) + atlasLocation;
    let mip4SamplePosition = vec3<u32>(mip4Index) + atlasLocation;

    let mipSample0 = textureLoad(voxels, mip0SamplePosition, 0);
    let mipSample1 = textureLoad(voxels, mip1SamplePosition, 1);
    let mipSample2 = textureLoad(voxels, mip2SamplePosition, 2);
    let mipSample3 = textureLoad(voxels, mip3SamplePosition, 3);
    let mipSample4 = textureLoad(voxels, mip3SamplePosition, 4);

    if(mipSample0.a > 0.0 && isInBounds(currentIndex, vec3<i32>(voxelObject.size))){
//    if(true){
        output.objectPos = objectPos;
        output.worldPos = (voxelObject.transform *  vec4(output.objectPos, 1.0)).xyz;
        output.normal = transformNormal(voxelObject.inverseTransform,vec3<f32>(objectNormal));
        output.colour = mipSample0.rgb;
        output.hit = true;
        output.modelMatrix = voxelObject.transform;
        output.previousModelMatrix = voxelObject.previousTransform;
        output.inverseModelMatrix = voxelObject.inverseTransform;
        output.previousInverseModelMatrix = voxelObject.previousInverseTransform;
        return output;
    }
    voxelSize = vec3<f32>(1.0);
//    if (mipSample1.a == 0.0){
//      voxelSize = vec3<f32>(2.0);
//    }
//    if (mipSample2.a == 0.0){
//      voxelSize = vec3<f32>(4.0);
//    }
//    if (mipSample3.a == 0.0){
//      voxelSize = vec3<f32>(8.0);
//    }
//    if (mipSample4.a == 0.0){
//      voxelSize = vec3<f32>(16.0);
//    }

    var scaledRayOrigin = shiftedRayOrigin / voxelSize;
    var scaledObjectPos = floor(objectPos / voxelSize);
    var scaledOriginDifference = scaledObjectPos - scaledRayOrigin;
    var tMax = voxelSize * (rayDirSign * scaledOriginDifference + (rayDirSign * 0.5) + 0.5) / abs(objectRayDirection);
    let mask = vec3<f32>(tMax.xyz <= min(tMax.yzx, tMax.zxy));

    tCurrent = min(tMax.x, min(tMax.y, tMax.z));
    objectPos = objectRayOrigin + objectRayDirection * tCurrent;
    currentIndex = vec3<i32>(floor(objectPos / voxelSize) * voxelSize);
    objectNormal = mask * -rayDirSign;

    if(!isInBounds(currentIndex, vec3<i32>(voxelObject.size))){
        break;
    }
  }
  return output;
}

fn rayMarchTransformed(voxelObject: VoxelObject, rayDirection: vec3<f32>, rayOrigin: vec3<f32>, mipLevel: u32) -> RayMarchResult {
      var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
      let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
      return  rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
}