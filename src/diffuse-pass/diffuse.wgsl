struct RadianceCacheEntry {
  worldPosition: vec3<f32>,
  normal: vec3<f32>,
  colour: vec3<f32>,
}

@group(0) @binding(1) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(3) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(4) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
@group(0) @binding(5) var voxelsSampler : sampler;
@group(0) @binding(6) var diffuseStore : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(7) var<uniform> frameIndex : u32;
@group(0) @binding(8) var blueNoise : texture_2d<f32>;
@group(0) @binding(9) var<storage, read_write> radianceCache : array<RadianceCacheEntry>;

// g-buffer
@group(1) @binding(0) var normalTex : texture_2d<f32>;
@group(1) @binding(1) var albedoTex : texture_2d<f32>;
@group(1) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(3) var depthTex : texture_2d<f32>;

fn reconstructPosition(cameraPosition: vec3<f32>, rayDirection: vec3<f32>, depth: f32) -> vec3<f32> {
  return cameraPosition + rayDirection * depth;
}

const PI = 3.1415926535897932384626433832795;
const BLUE_NOISE_TEXTURE_SIZE = 512;
// Function to compute Lambertian diffuse reflection
fn lambertianReflectance(normal: vec3<f32>, co: vec2<f32>) -> f32 {
    // Generate a random direction in the hemisphere
    let randomDir : vec3<f32> = randomInHemisphere(co, normal);

    // Lambertian reflectance model
    let cosTheta = dot(randomDir, normal);
    let lambertianTerm = max(cosTheta, 0.0) / PI;

    return lambertianTerm;
}

override reflectance: f32 = 0.5;
const SAMPLES_PER_PIXEL = 2;
const SKY_COLOUR = vec3(0.99);
const BOUNCES = 2;

fn cosineWeightedSample(rngSample: vec2<f32>, normal: vec3<f32>) -> vec3<f32> {
    // Generate spherical coordinates
    let r = sqrt(rngSample.x);
    let theta = 2.0 * PI * rngSample.y;

    // Convert to Cartesian coordinates
    let x = r * cos(theta);
    let y = r * sin(theta);

    // Transform to local coordinates
    let tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal));
    let bitangent = cross(normal, tangent);

    return normalize(tangent * x + bitangent * y + normal * sqrt(max(0.0, 1.0 - rngSample.x)));
}

struct BounceResult {
  isValidHit: bool,
  rayColour: vec3<f32>,
  rayDirection: vec3<f32>,
  rayOrigin: vec3<f32>,
};

fn getBounce(rayColour: vec3<f32>, rayOrigin: vec3<f32>, rayDirection: vec3<f32>, blueNoiseSample: vec2<f32>, uv: vec2<f32>) -> BounceResult {
  var output: BounceResult;
  output.isValidHit = true;
  output.rayColour = rayColour;
  output.rayDirection = vec3(0.0);
  output.rayOrigin = rayOrigin;
  let rayMarchResult = rayMarch(rayOrigin, rayDirection, voxelObjects);
  // TODO: find better way of sampling instead of rejecting samples here
  let hitDistance = distance(rayMarchResult.worldPos, rayOrigin);
  let isValidHit = rayMarchResult.hit && hitDistance < 16.0;
  if(!isValidHit){
    var unitDirection = unitVector(rayDirection);
    var attenuation = reflectance * (unitDirection.y + 1.0);
    output.isValidHit = false;
    output.rayColour = vec3(1.0-attenuation) + attenuation * SKY_COLOUR;
    return output;
  }
  output.rayDirection = cosineWeightedSample(blueNoiseSample, rayMarchResult.normal);
  output.rayOrigin = rayMarchResult.worldPos;
  output.rayColour = rayColour * (rayMarchResult.colour * reflectance);
  output.isValidHit = true;
  return output;
}

// Convert 2D index to 1D
fn convert2DTo1D(size: vec2<u32>, index2D: vec2<u32>) -> u32 {
    return index2D.y * size.x + index2D.x;
}

// Convert 1D index to 2D
fn convert1DTo2D(size: vec2<u32>, index1D: u32) -> vec2<u32> {
    return vec2(index1D % size.x, index1D / size.x);
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
  var averageRayColour = vec3(0.0);
  let frameIndex = u32(frameIndex);
  var outputPixel = GlobalInvocationID.xy * 2 + vec2(frameIndex % 2, (frameIndex / 2) %2); // (0,1), (1,0),

  let radianceCachePosition = outputPixel / RADIANCE_CACHE_DOWNSCALE;
  let cacheSize = textureDimensions(diffuseStore) / RADIANCE_CACHE_DOWNSCALE;
  let radianceCacheEntry = radianceCache[convert2DTo1D(cacheSize, radianceCachePosition)];

  var uv = vec2<f32>(outputPixel) / vec2<f32>(textureDimensions(normalTex).xy);
  uv = vec2(uv.x, 1.0 - uv.y);
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  let normalSample = textureLoad(normalTex, outputPixel, 0).rgb;
  let depthSample = textureLoad(depthTex, outputPixel, 0).r;
  let worldPos = reconstructPosition(cameraPosition, rayDirection, depthSample) + normalSample * EPSILON; // EPSILON accounts for floating point errors

//  for(var s = 0; s < SAMPLES_PER_PIXEL; s++){
//    let blueNoiseSamplePosition = outputPixel + vec2(frameIndex * 16, 512 - u32(s) * 32);
//    let blueNoiseSample = textureLoad(blueNoise, blueNoiseSamplePosition % BLUE_NOISE_TEXTURE_SIZE, 0).rg;
//    rayDirection = cosineWeightedSample(blueNoiseSample, normalSample);
//    var rayColour = SKY_COLOUR;
//    var rayOrigin = worldPos;
//    for(var bounce = 0; bounce < BOUNCES; bounce++){
//      let bounce = getBounce(rayColour, rayOrigin, rayDirection, blueNoiseSample, uv);
//      rayColour = bounce.rayColour;
//      rayDirection = bounce.rayDirection;
//      rayOrigin = bounce.rayOrigin;
//      if(!bounce.isValidHit){
//        break;
//      }
//    }
//    averageRayColour = averageRayColour + rayColour;
//  }
//  averageRayColour = averageRayColour / f32(SAMPLES_PER_PIXEL);

  var totalWeight = 0.0;
  let radius = 2;
  for(var x = -radius; x <= radius; x++){
    for(var y = -radius; y <= radius; y++){
      let neighbourPosition = vec2<i32>(radianceCachePosition) + vec2(x,y);
      let neighbour = radianceCache[convert2DTo1D(cacheSize, vec2<u32>(neighbourPosition))];
      var weight = pow(dot(neighbour.normal, normalSample),2);
      weight += sqrt(0.01 / distance(worldPos, neighbour.worldPosition));
      totalWeight = totalWeight + weight;
      averageRayColour = averageRayColour + neighbour.colour * weight;
    }
  }

  averageRayColour = averageRayColour / totalWeight;
//
//  if(distance(worldPos, radianceCacheEntry.worldPosition) < 0.025){
//    averageRayColour = vec3(1.0,0.0,0.0);
//  }

  textureStore(
    diffuseStore,
    outputPixel,
    vec4(averageRayColour, 1.0),
  );
}

const RADIANCE_CACHE_DOWNSCALE = 32;
const RADIANCE_CACHE_SAMPLES = 8;
const RADIANCE_CACHE_BOUNCES = 4;

// TODO: reproject previous cache values
@compute @workgroup_size(8, 8, 1)
fn getRadianceCache(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
){
  var averageRayColour = vec3(0.0);
  let frameIndex = u32(frameIndex);
  var outputPixel = GlobalInvocationID.xy * RADIANCE_CACHE_DOWNSCALE;
  var cachePoint = vec2<i32>(outputPixel);

  cachePoint = cachePoint + RADIANCE_CACHE_DOWNSCALE / 2;
    let randomOffset = vec2<i32>(randomInUnitDisk(vec2<f32>(GlobalInvocationID.xy) + vec2(f32(frameIndex % 64), f32(frameIndex % 32))) * 8.0);

//  cachePoint = cachePoint + randomOffset;

  var uv = vec2<f32>(cachePoint) / vec2<f32>(textureDimensions(normalTex).xy);
  uv = vec2(uv.x, 1.0 - uv.y);

  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  let normalSample = textureLoad(normalTex, cachePoint, 0).rgb;
  let depthSample = textureLoad(depthTex, cachePoint, 0).r;
  // TODO: vary the position to change each frame
  let worldPos = reconstructPosition(cameraPosition, rayDirection, depthSample) + normalSample * EPSILON; // EPSILON accounts for floating point errors

  for(var s = 0; s < RADIANCE_CACHE_SAMPLES; s++){
    let blueNoiseSamplePosition = cachePoint + vec2(s,0);
    let blueNoiseSample = textureLoad(blueNoise, blueNoiseSamplePosition % BLUE_NOISE_TEXTURE_SIZE, 0).rg;
    rayDirection = randomInHemisphere(blueNoiseSample, normalSample);
    var rayColour = SKY_COLOUR;
    var rayOrigin = worldPos;
    for(var bounce = 0; bounce < RADIANCE_CACHE_BOUNCES; bounce++){
      let bounce = getBounce(rayColour, rayOrigin, rayDirection, blueNoiseSample, uv);
      if(!bounce.isValidHit){
              break;
            }
      rayColour = bounce.rayColour;
      rayDirection = bounce.rayDirection;
      rayOrigin = bounce.rayOrigin;
    }
    averageRayColour = averageRayColour + rayColour;
  }
  averageRayColour = averageRayColour / f32(RADIANCE_CACHE_SAMPLES);

  let cacheSize = textureDimensions(diffuseStore) / RADIANCE_CACHE_DOWNSCALE;
  var radianceCacheEntry = RadianceCacheEntry();
  let blendAmount = 0.66;
  radianceCacheEntry.worldPosition = mix(radianceCache[convert2DTo1D(cacheSize, GlobalInvocationID.xy)].worldPosition,worldPos,blendAmount);
  radianceCacheEntry.normal = mix(radianceCache[convert2DTo1D(cacheSize, GlobalInvocationID.xy)].normal,normalSample,blendAmount);
  radianceCacheEntry.colour = mix(radianceCache[convert2DTo1D(cacheSize, GlobalInvocationID.xy)].colour,averageRayColour,blendAmount);
  radianceCache[convert2DTo1D(cacheSize, GlobalInvocationID.xy)] = radianceCacheEntry;
}
