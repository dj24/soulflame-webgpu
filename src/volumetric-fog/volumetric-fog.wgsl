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

const FOG_COLOUR: vec3<f32> = vec3<f32>(1.0, 1.0, 1.0);
const START_DISTANCE: f32 = 1.0;
const END_DISTANCE: f32 = 50.0;
const FOG_DENSITY: f32 = 0.01;
const FOG_HEIGHT_START: f32 = 0.0;
const FOG_HEIGHT_END: f32 = 4.0;

// Dense fog at fog start, no fog at fog end
fn calculateDensity(worldPos: vec3<f32>, depth: f32) -> f32 {
  let height = worldPos.y;
  let heightFactor = 1.0 - clamp((height - FOG_HEIGHT_START) / (FOG_HEIGHT_END - FOG_HEIGHT_START), 0.0, 1.0);
  let distanceFactor = 1.0;

  return heightFactor * distanceFactor;
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

// Checkerboard pattern
@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    var pixel = GlobalInvocationID.xy * 2;

    let resolution = textureDimensions(depthTex);
    var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);

    let depthSample = textureLoad(depthTex, pixel, 0);
    let depth = depthSample.a;
    let worldPos = depthSample.rgb;

    var rayOrigin = cameraPosition;
    var rayDirection = normalize(worldPos - rayOrigin);

    var totalDensity = 0.0;
    var totalColour = vec3<f32>(0.0, 0.0, 0.0);
    let endDistance = END_DISTANCE;
    let startDistance = START_DISTANCE;
    let randomCo = uv;
    let scatterAmount = 0.1;
    let shadowRayDirection = -sunDirection + randomInHemisphere(randomCo, -sunDirection) * scatterAmount;

    var d = 0.1;
    for(var i = startDistance; i < endDistance; i += d) {
      let samplePos = rayOrigin + rayDirection * f32(i);
      if(samplePos.z > depth) {
        break;
      }
      let density = FOG_DENSITY;
//      var hit = false;
//      for(var t = 0.0; t < 64.0; t+= 0.5){
//        let worldPosAtStep = samplePos + shadowRayDirection * t;
//        let screenUvAtStep = worldToScreen(worldPosAtStep);
//        if(any(screenUvAtStep < vec2(0.0)) || any(screenUvAtStep > vec2(1.0))){
//          continue;
//        }
//        let screenPosAtStep = vec2<u32>(screenUvAtStep * vec2<f32>(resolution));
//        let depthAtStep = textureLoad(depthTex, screenPosAtStep, 0).a;
//        if(depthAtStep < depth){
//          hit = true;
//          break;
//        }
//      }
//if(hit) {
//        totalColour += vec3<f32>(0.0, 0.0, 0.0) * density;
//      } else{
//        totalColour += vec3<f32>(1.0, 1.0, 1.0) * density;
//      }
      if(shadowRay(samplePos, shadowRayDirection)) {
        totalColour += vec3<f32>(0.0, 0.0, 0.0) * density;
      } else{
        totalColour += vec3<f32>(1.0, 1.0, 1.0) * density;
      }

      totalDensity += density;
      d *= 1.05;
    }

    let fogColour = totalColour;
    for(var x = 0u; x < 2; x++) {
      for(var y = 0u; y < 2; y++) {
        let inputSample = textureLoad(inputTex, pixel + vec2(x,y), 0).rgb;
         textureStore(outputTex, pixel + vec2(x,y), vec4(mix(inputSample, fogColour, totalDensity), 1));
      }
    }

}