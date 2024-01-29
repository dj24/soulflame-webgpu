struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var depthTex : texture_2d<f32>;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(4) var voxels : texture_3d<f32>;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(6) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>;
@group(0) @binding(7) var<uniform> sunDirection : vec3<f32>;
@group(0) @binding(8) var linearSampler : sampler;
@group(0) @binding(9) var fogTex : texture_2d<f32>;

const FOG_COLOUR: vec3<f32> = vec3<f32>(1.0);
const START_DISTANCE: f32 = 0.0;
const END_DISTANCE: f32 = 32.0;
const FOG_DENSITY: f32 = 0.005;
const FOG_HEIGHT_START: f32 = 0.0;
const FOG_HEIGHT_END: f32 = 72.0;

// Dense fog at fog start, no fog at fog end
fn calculateDensity(worldPos: vec3<f32>) -> f32 {
  let height = worldPos.y;
  let heightFactor = clamp((height - FOG_HEIGHT_START) / (FOG_HEIGHT_END - FOG_HEIGHT_START), 0.0, 1.0);
  return heightFactor;
}

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
  for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
      let voxelObject = voxelObjects[i];
      if(any(voxelObject.size == vec3(0.0))){
        continue;
      }
      var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(worldPos, 1.0)).xyz;
      let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(shadowRayDirection, 0.0)).xyz;
      let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
      let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size);
      if(!intersect.isHit && !isInBounds) {
        continue;
      }
      // Advance ray origin to the point of intersection
      if(!isInBounds){
        objectRayOrigin = objectRayOrigin + objectRayDirection * intersect.tNear + EPSILON;
      }
      let output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 0);
      if(output.hit){
        return true;
      }
  }
  return false;
}

fn worldToScreen(worldPos: vec3<f32>) -> vec2<f32> {
  let clipSpace = viewProjections.viewProjection * vec4<f32>(worldPos, 1.0);
  let ndc = clipSpace.xyz / clipSpace.w;
  let screenSpace = (ndc + vec3<f32>(1.0)) * vec3<f32>(0.5);
  return screenSpace.xy;
}

const DOWNSCALE = 8;
const ANISOTROPY_FACTOR = 0.0;
const MULTIPLE_SCATTERING_STEPS = 4;
const SUN_COLOR = vec3<f32>(1.0, 1.0, 0.87);

// Checkerboard pattern
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    var pixel = GlobalInvocationID.xy * DOWNSCALE;

    let resolution = textureDimensions(depthTex);
    var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);

    let depthSample = textureLoad(depthTex, pixel, 0);
    var rayOrigin = cameraPosition;
    let worldPos = depthSample.rgb;
    let relativeWorldPos = worldPos - rayOrigin;
    var rayDirection = normalize(relativeWorldPos);
    let depth = length(relativeWorldPos.z);


    let endDistance = END_DISTANCE;
    let startDistance = START_DISTANCE;
    let randomCo = uv;
    let scatterAmount = 0.1;
    let shadowRayDirection = -sunDirection + randomInHemisphere(randomCo, -sunDirection) * scatterAmount;

    let foo = randomInUnitSphere(randomCo);
    var totalLight = vec3(0.0);
    var count = 0.0;
    var d = 0.5;

    for(var i = startDistance; i < endDistance; i += d) {
      let samplePos = rayOrigin + rayDirection * f32(i) + foo * 0.01;
//      let distanceFromCamera = length(samplePos - rayOrigin);
      if(i > depth) {
        break;
      }
      // Multiple scattering loop
      for(var j = 0; j < MULTIPLE_SCATTERING_STEPS; j++) {
        let scatterPos = samplePos + randomInHemisphere(randomCo, rayDirection) * 0.05;
        let distanceFromCamera = length(scatterPos - rayOrigin);
        let isInShadow = shadowRay(scatterPos, shadowRayDirection);
        let scatterDensity = calculateDensity(scatterPos);
        let scatterLightSample = select(SUN_COLOR, vec3<f32>(0.0, 0.0, 0.0), isInShadow);
//        let scatterLightSample = select(mix(SUN_COLOR, vec3<f32>(0.2, 0.2, 0.2), scatterDensity), vec3<f32>(0.0, 0.0, 0.0), isInShadow);
        let anisotropy = pow(max(0.0, dot(rayDirection, -sunDirection)), ANISOTROPY_FACTOR);
        totalLight += scatterLightSample * exp(-scatterDensity * distanceFromCamera) * anisotropy;
      }
    }
    // Apply tone mapping to totalLight
//    totalLight = totalLight / (totalLight + vec3<f32>(1.0, 1.0, 1.0));
  totalLight *= FOG_DENSITY;
  textureStore(outputTex, GlobalInvocationID.xy, vec4(totalLight, 1.0));
}

const PI = 3.1415926535897932384626433832795;

@compute @workgroup_size(8, 8, 1)
fn blur(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let fogTexDimensions = vec2<f32>(textureDimensions(fogTex));
  let outputTexDimensions = vec2<f32>(textureDimensions(outputTex));
  let uv = (vec2<f32>(GlobalInvocationID.xy) + vec2(4.0)) / outputTexDimensions;
  var pixel = GlobalInvocationID.xy;

  let depthRef = textureLoad(depthTex, pixel, 0).a;
  // gaussian blur
  var total = vec4(0.0);
  var count = 0.0;
  for(var i = -2; i <= 2; i+= 1) {
    for(var j = -2; j <= 2; j += 1) {
      let fogSample = textureSampleLevel(fogTex, linearSampler, uv + vec2(f32(i), f32(j)) / fogTexDimensions, 0.0);
      let depthSample = textureLoad(depthTex, vec2<i32>(pixel) + vec2(i, j), 0).a;
      // bilateral blur
      let depthDifference = abs(depthSample - depthRef);
      let depthWeight = exp(-depthDifference * depthDifference * 50.0);
      let gaussianWeight = exp(-(f32(i) * f32(i) + f32(j) * f32(j)) / 2.0);
      total += fogSample * depthWeight * gaussianWeight;
      count += depthWeight * gaussianWeight;
    }
  }
  let fogAmount = (total / count);
  let inputSample = textureLoad(inputTex, pixel, 0);
  textureStore(outputTex, GlobalInvocationID.xy, mix(inputSample, fogAmount, fogAmount.r));
}