
struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>,
  viewMatrix : mat4x4<f32>,
};

struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
};

fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
    return index2D.y * width + index2D.x;
}

fn convert1DTo2D(width: u32, index1D: u32) -> vec2<u32> {
    return vec2<u32>(index1D % width, index1D / width);
}

struct Light {
  position: vec3<f32>,
  color: vec3<f32>,
};

struct LightConfig {
  constantAttenuation: f32,
  linearAttenuation: f32,
  quadraticAttenuation: f32,
  normalSigma: f32
}

// 8 byte
struct Resevoir {
  sampleCount: u32,
  weightSum: f32,
  lightWeight: f32,
  lightIndex: u32,
}

@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var reservoirTex : texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;

@group(1) @binding(0) var<uniform> lightConfig : LightConfig;


const CONSTANT_ATTENUATION = 0.0;
const LINEAR_ATTENUATION = 0.1;
const QUADRATIC_ATTENUATION = 0.1;
const LIGHT_COUNT = 32;
const SAMPLES_PER_FRAME = 8;

fn getLightWeight(lightPos: vec3<f32>, lightColour: vec3<f32>, worldPos: vec3<f32>, normal: vec3<f32>) -> f32 {
  let lightDir = lightPos - worldPos;
  let d = length(lightDir);
  let attenuation = lightConfig.constantAttenuation + lightConfig.linearAttenuation * d + lightConfig.quadraticAttenuation * d * d;
  let ndotl = dot(normalize(lightDir), normal);
  return (1.0 / attenuation) * length(lightColour) * ndotl;
}

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>,
) {
  let worldPos = textureLoad(worldPosTex, id.xy * DOWN_SAMPLE_FACTOR, 0).xyz;
  let normal = textureLoad(normalTex, id.xy * DOWN_SAMPLE_FACTOR, 0).xyz;
  var blueNoisePixel = vec2<i32>(id.xy);
  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;
  let jitterOffset = randomInUnitSphere(r);

  var bestWeight = 0.0;
  var weightSum = 0.0;
  var lightIndex = 0u;
  for(var i = 0; i < SAMPLES_PER_FRAME; i++){
    let iterOffsetX = (i * 193) % 512; // Large prime numbers for frame variation
    let iterOffsetY = (i * 257) % 512; // Different prime numbers
    let sampleR = textureLoad(blueNoiseTex, (blueNoisePixel + vec2(frameOffsetX + iterOffsetX, frameOffsetY + iterOffsetY)) % 512, 0).xy;
    let sampleLightIndex = u32(sampleR.x * f32(LIGHT_COUNT));
    let light = lightsBuffer[sampleLightIndex];
    let lightPos = light.position + jitterOffset;
    let weight = getLightWeight(lightPos, light.color, worldPos, normal);

    weightSum += weight;
    if(r.y < weight / weightSum){
      bestWeight = weight;
      lightIndex = sampleLightIndex;
    }
  }

  let light = lightsBuffer[lightIndex];
  let lightDir = light.position + jitterOffset - worldPos;

  let raymarchResult = rayMarchBVH(worldPos + normal * 0.001, normalize(lightDir));
  if(raymarchResult.hit){
      bestWeight *= 0.1;
  }

  var reservoir = vec4(
    bitcast<f32>(SAMPLES_PER_FRAME),
     weightSum,
     bestWeight,
     bitcast<f32>(lightIndex),
  );

//  textureStore(reservoirTex, id.xy * DOWN_SAMPLE_FACTOR, reservoir);


  for(var x = 0u; x < DOWN_SAMPLE_FACTOR; x++){
    for(var y = 0u; y < DOWN_SAMPLE_FACTOR; y++){
      textureStore(reservoirTex, id.xy * DOWN_SAMPLE_FACTOR + vec2(x, y), reservoir);
    }
  }
}