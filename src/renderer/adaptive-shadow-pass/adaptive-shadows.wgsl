

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
  return rayMarchBVHFirstHit(worldPos, shadowRayDirection);
//    return rayMarchTransformed(voxelObjects[0], shadowRayDirection, worldPos, 0).hit;
}


const SUN_COLOR = vec3<f32>(0.9);
const MOON_COLOR = vec3<f32>(0.5, 0.5, 1.0);
const SKY_AMBIENT_INTENSITY = 0.1;
const VARIANCE_SAMPLE_POSITIONS: array<vec2<i32>, 8> = array<vec2<i32>, 8>(
  vec2(0,4),
  vec2(4,0),
  vec2(0,-4),
  vec2(-4,0),
  vec2(4,4),
  vec2(4,-4),
  vec2(-4,4),
  vec2(-4,-4)
);

const NORMAL_VARIANCE_IMPORTANCE = 0.5;
const WORLD_POS_VARIANCE_IMPORTANCE = 0.0;

const BLUE_NOISE_SIZE = 511;
const SUN_DIRECTION: vec3<f32> = vec3<f32>(1.0,-1.0,-1.0);
const SKY_COLOUR: vec3<f32> = vec3<f32>(0.6, 0.8, 0.9);
const SHADOW_ACNE_OFFSET: f32 = 0.005;
const SCATTER_AMOUNT: f32 = 0.75;
const POSITION_SCATTER_AMOUNT: f32 = 0.01;


fn blinnPhong(normal: vec3<f32>, lightDirection: vec3<f32>, viewDirection: vec3<f32>, specularStrength: f32, shininess: f32, lightColour: vec3<f32>) -> vec3<f32> {
  let halfDirection = normalize(lightDirection + viewDirection);
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let specular = pow(max(dot(normal, halfDirection), 0.0), shininess);
  return (diffuse + specular * specularStrength) * lightColour;
}

struct Light {
  direction: vec3<f32>,
  colour: vec3<f32>,
};

// Function to remap the blue noise value to a sample index
fn remapToSampleIndex(blueNoiseValue: f32, numSamples: u32) -> u32 {
    // Map blue noise value to the index range [0, numSamples)
    return u32(blueNoiseValue * f32(numSamples));
}

fn randomInCosineWeightedHemisphere(r: vec2<f32>, normal: vec3<f32>) -> vec3<f32> {
  let r1 = 2.0 * PI * r.x;
  let r2 = r.y;
  let r2s = sqrt(r2);
  let w = normal;
  let u = normalize(cross((select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0),abs(w.x) > 0.1)), w));
  let v = cross(w, u);
  return normalize(u * cos(r1) * r2s + v * sin(r1) * r2s + w * sqrt(1.0 - r2));
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = textureDimensions(outputTex);
  let uv = (vec2<f32>(GlobalInvocationID.xy) - vec2(0.5)) / vec2<f32>(texSize);
  let samplePixel = GlobalInvocationID.xy * DOWNSCALE;
  let outputPixel = GlobalInvocationID.xy;
  var normalSample = textureLoad(normalTex, samplePixel, 0).rgb;

  var worldPos = textureLoad(worldPosTex, samplePixel, 0).rgb;

  // Get world position variance from surrounding pixels
  var variance = vec3<f32>(0.0);
  var count = 0.0;
  let radius = 8;
//  for(var x = -radius; x <= radius; x = x + 1) {
//    for(var y = -radius; y <= radius; y = y + 1) {
//      let offsetPixel = vec2<i32>(samplePixel) + vec2<i32>(x, y);
//      let neighbourNormal = textureLoad(normalTex, offsetPixel, 0).rgb;
//      let neighbourWorldPos = textureLoad(worldPosTex, offsetPixel, 0).rgb;
//      let worldPosVariance = abs(neighbourWorldPos - worldPos);
//      let normalVariance = abs(neighbourNormal - normalSample);
//      count = count + 1.0;
//      variance = variance + (worldPosVariance * WORLD_POS_VARIANCE_IMPORTANCE + normalVariance * NORMAL_VARIANCE_IMPORTANCE);
//    }
//  }
  for(var x = -radius; x <= radius; x = x + 2) {
    for(var y = -radius; y <= radius; y = y + 2) {
      let offsetPixel = vec2<i32>(samplePixel) + vec2<i32>(x, y);
      let neighbourNormal = textureLoad(normalTex, offsetPixel, 0).rgb;
      let normalVariance = abs(neighbourNormal - normalSample);
      count = count + 1.0;
      variance = variance + (normalVariance * NORMAL_VARIANCE_IMPORTANCE);
    }
  }
//  for(var x = -radius; x <= radius; x = x + 1) {
//    for(var y = -radius; y <= radius; y = y + 1) {
//      let offsetPixel = vec2<i32>(samplePixel) + vec2<i32>(x, y);
//      let neighbourWorldPos = textureLoad(worldPosTex, offsetPixel, 0).rgb;
//      let worldPosVariance = abs(neighbourWorldPos - worldPos);
//      count = count + 1.0;
//      variance = variance + (worldPosVariance * WORLD_POS_VARIANCE_IMPORTANCE);
//    }
//  }
  variance = variance / count;

  textureStore(outputTex, outputPixel, vec4(length(variance)));
}

const PI = 3.1415926535897932384626433832795;

fn polarToCartesian(angle: f32, radius: f32) -> vec2<f32> {
  let radians = angle * PI / 180.0;
  let x = radius * cos(radians);
  let y = radius * sin(radians);
  return vec2<f32>(x, y);
}

const DISTANCE_IMPORTANCE =1.0;

@compute @workgroup_size(8, 8, 1)
fn composite(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = textureDimensions(outputTex);
  let pixel = GlobalInvocationID.xy;
  let uv = (vec2<f32>(pixel) - vec2(0.5)) / vec2<f32>(texSize);
  let albedoSample = textureLoad(albedoTex, pixel, 0);
  let shadowRef = textureLoad(intermediaryTexture, pixel, 0);

  textureStore(outputTex, pixel,shadowRef);
}
