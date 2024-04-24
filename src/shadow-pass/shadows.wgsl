

fn shadowRay(worldPos: vec3<f32>, shadowRayDirection: vec3<f32>) -> bool {
  return rayMarchBVHFirstHit(worldPos, shadowRayDirection);
//    return rayMarchTransformed(voxelObjects[0], shadowRayDirection, worldPos, 0).hit;
}


const SUN_COLOR = vec3<f32>(0.9);
const MOON_COLOR = vec3<f32>(0.5, 0.5, 1.0);
const SKY_AMBIENT_INTENSITY = 0.1;
const SUBPIXEL_SAMPLE_POSITIONS: array<vec2<f32>, 8> = array<vec2<f32>, 8>(
  vec2<f32>(0.25, 0.25),
  vec2<f32>(0.75, 0.25),
  vec2<f32>(0.25, 0.75),
  vec2<f32>(0.75, 0.75),
  vec2<f32>(0.125, 0.125),
  vec2<f32>(0.375, 0.125),
  vec2<f32>(0.625, 0.125),
  vec2<f32>(0.875, 0.125)
);
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

  var worldPos = textureLoad(worldPosTex, samplePixel, 0).rgb + normalSample * SHADOW_ACNE_OFFSET;
  if(all(worldPos <= vec3(0.0))){
    textureStore(outputTex, outputPixel, vec4(1.0));
    return;
  }

var blueNoisePixel = outputPixel % BLUE_NOISE_SIZE;
//  var blueNoisePixel = vec2(outputPixel.x + time.frame * 32, outputPixel.y + time.frame * 16) % BLUE_NOISE_SIZE;
//  if(time.frame % 2 == 0){
//    blueNoisePixel.y = BLUE_NOISE_SIZE - blueNoisePixel.y;
//  }
//  if(time.frame % 3 == 0){
//    blueNoisePixel.x = BLUE_NOISE_SIZE - blueNoisePixel.x;
//  }

  var r = textureLoad(blueNoiseTex, blueNoisePixel, 0).xy;
  var shadowRayDirection = randomInCosineWeightedHemisphere(r, normalSample);
  shadowRayDirection = mix(sunDirection, shadowRayDirection, SCATTER_AMOUNT);

  if(shadowRay(worldPos, shadowRayDirection)){
      textureStore(outputTex, outputPixel, vec4(0.0));
  } else{
      let sky = textureSampleLevel(skyCube, linearSampler, shadowRayDirection, 0.0) * 2.0;
      textureStore(outputTex, outputPixel, sky);
  }
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
  let normalRef = textureLoad(normalTex, pixel, 0).rgb;
  let worldPosRef = textureLoad(worldPosTex, pixel, 0).rgb;
  let distanceRef = distance(worldPosRef, cameraPosition);

  var output = vec3(0.0);
  var totalWeight = 0.0;
  for(var i = 0; i <= 8; i++){
    let angle = i * 30; // 0, 90, 180, 270
    let radius = (i + 1) / 2;
    let offsetPixel = vec2<i32>(pixel) + vec2<i32>(polarToCartesian(f32(angle), f32(radius)));
    let shadowSample =  textureLoad(intermediaryTexture, offsetPixel, 0);
    let normalSample = textureLoad(normalTex, offsetPixel, 0).rgb;
    let worldPosSample = textureLoad(worldPosTex, offsetPixel, 0).rgb;
    let normalWeight = select(0.0, 1.0, dot(normalSample, normalRef) > 0.99);
    let distanceWeight = 1.0 - clamp(distance(worldPosRef, worldPosSample) * DISTANCE_IMPORTANCE,0.0,1.0);
    let sampleWeight =   distanceWeight * normalWeight;
    output += shadowSample.rgb * sampleWeight;
    totalWeight+= sampleWeight;
  }
  output/= totalWeight;

  textureStore(outputTex, pixel,shadowRef * albedoSample);
//    textureStore(outputTex, pixel, vec4(output * albedoSample.rgb, 1));
}
