@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> outputPixelBuffer : array<LightPixel>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;

@group(1) @binding(0) var<storage, read> inputPixelBuffer : array<LightPixel>;

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

struct LightPixel {
  sampleCount: u32,
  weight: f32,
  contribution: vec3<f32>,
  lightIndex: u32,
}

const NEIGHBOUR_OFFSETS = array<vec2<i32>, 4>(
  vec2<i32>(-1, 0),
  vec2<i32>(1, 0),
  vec2<i32>(0, -1),
  vec2<i32>(0, 1)
);

const SAMPLE_RADIUS = 2.0;

@compute @workgroup_size(8,8,1)
fn spatial(
@builtin(global_invocation_id) id : vec3<u32>
){
  var downscaledPixel = id.xy;
  let pixel = downscaledPixel * DOWN_SAMPLE_FACTOR;
  let normalRef = textureLoad(normalTex, pixel, 0).xyz;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let index = convert2DTo1D(downscaledResolution.x, id.xy);
  let uv = (vec2<f32>(downscaledPixel) + vec2(0.5)) / vec2<f32>(downscaledResolution);
  if(uv.y > 0.66){
    return;
  }

  for(var i = 0; i < 4; i++){
    let offset = NEIGHBOUR_OFFSETS[i];
    let neighbor = clamp(vec2<i32>(downscaledPixel) + offset, vec2<i32>(0), vec2<i32>(downscaledResolution - vec2<u32>(1)));
    let neighborIndex = convert2DTo1D(downscaledResolution.x,vec2<u32>(neighbor));
    let neighborContribution = inputPixelBuffer[neighborIndex].contribution;
    let neighborWeight = inputPixelBuffer[neighborIndex].weight;
    let neighborCount = inputPixelBuffer[neighborIndex].sampleCount;
    let currentWeight = inputPixelBuffer[index].weight;
    let currentSampleCount = inputPixelBuffer[index].sampleCount;

    if(neighborWeight > currentWeight){
      let totalWeight = currentWeight + neighborWeight;
      let normalizedNeighborWeight = neighborWeight / totalWeight;
       outputPixelBuffer[index].contribution = mix(inputPixelBuffer[index].contribution, neighborContribution, normalizedNeighborWeight);
       outputPixelBuffer[index].weight = totalWeight;
       outputPixelBuffer[index].lightIndex = inputPixelBuffer[index].lightIndex;
       outputPixelBuffer[index].sampleCount += u32(f32(neighborCount) * normalizedNeighborWeight);
    }
  }
   if(outputPixelBuffer[index].sampleCount > MAX_SAMPLES){
      outputPixelBuffer[index].contribution = outputPixelBuffer[index].contribution * RESERVOIR_DECAY;
      outputPixelBuffer[index].sampleCount = u32(f32(outputPixelBuffer[index].sampleCount) * RESERVOIR_DECAY);
      outputPixelBuffer[index].weight *= RESERVOIR_DECAY;
    }
}
