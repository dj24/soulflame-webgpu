@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> pixelBuffer : array<LightPixel>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;

@group(1) @binding(0) var<uniform> lightConfig : LightConfig;

fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
    return index2D.y * width + index2D.x;
}

fn convert1DTo2D(width: u32, index1D: u32) -> vec2<u32> {
    return vec2<u32>(index1D % width, index1D / width);
}


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

struct Light {
  position: vec3<f32>,
  color: vec3<f32>,
};

struct LightConfig {
  constantAttenuation: f32,
  linearAttenuation: f32,
  quadraticAttenuation: f32,
  maxSampleCount: f32,
}


struct LightPixel {
  sampleCount: u32,
  weight: f32,
  contribution: vec3<f32>,
  lightIndex: atomic<u32>,
}

const NEIGHBOUR_OFFSETS = array<vec2<i32>, 4>(
  vec2<i32>(-1, 0),
  vec2<i32>(1, 0),
  vec2<i32>(0, -1),
  vec2<i32>(0, 1)
);

@compute @workgroup_size(8,8,1)
fn spatial(
@builtin(global_invocation_id) id : vec3<u32>
){
  var downscaledPixel = id.xy / DOWN_SAMPLE_FACTOR;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let index = convert2DTo1D(downscaledResolution.x, id.xy);

  var totalWeight = 0.0;
  var totalContribution = vec3<f32>(0.0);
  var normalAtBestSample = textureLoad(normalTex, id.xy, 0).xyz;
  for(var i = 0; i < 4; i++){
    // TODO: figure out how to stop the temporal propagation
    let neighbor = clamp(vec2<i32>(id.xy) + NEIGHBOUR_OFFSETS[i], vec2<i32>(0), vec2<i32>(downscaledResolution - vec2<u32>(1)));
    let normalSample = textureLoad(normalTex, vec2<u32>(neighbor) * DOWN_SAMPLE_FACTOR, 0).xyz;
    let normalDiff = dot(normalSample, normalAtBestSample);
    if(normalDiff < 0.8){
      continue;
    }
    let neighborIndex = convert2DTo1D(downscaledResolution.x,vec2<u32>(neighbor));
    let neighborContribution = pixelBuffer[neighborIndex].contribution;
    let neighborWeight = pixelBuffer[neighborIndex].weight;
    pixelBuffer[index].weight += neighborWeight;

    let currentWeight = pixelBuffer[index].weight;

    if(neighborWeight > currentWeight){
       pixelBuffer[index].contribution = neighborContribution;
       let neighborLightIndex = atomicLoad(&pixelBuffer[neighborIndex].lightIndex);
       atomicStore(&pixelBuffer[index].lightIndex, neighborLightIndex);
       pixelBuffer[index].weight = neighborWeight;
    }
    pixelBuffer[index].sampleCount+= pixelBuffer[neighborIndex].sampleCount;
  }
}
