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

const NEIGHBOUR_OFFSETS = array<vec2<i32>, 8>(
  vec2<i32>(-1, -1),
  vec2<i32>(0, -1),
  vec2<i32>(1, -1),
  vec2<i32>(-1, 0),
  vec2<i32>(1, 0),
  vec2<i32>(-1, 1),
  vec2<i32>(0, 1),
  vec2<i32>(1, 1)
);

const SAMPLE_RADIUS = 2.0;
const SAMPLE_BLEND_FACTOR = 0.95;

@compute @workgroup_size(8,8,1)
fn spatial(
@builtin(global_invocation_id) id : vec3<u32>
){
  var downscaledPixel = id.xy;
  let pixel = downscaledPixel * DOWN_SAMPLE_FACTOR;
  let normalRef = textureLoad(normalTex, pixel, 0).xyz;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let uv = (vec2<f32>(downscaledPixel) + vec2(0.5)) / vec2<f32>(downscaledResolution);
  if(uv.x < 0.5){
    return;
  }

  var blueNoisePixel = vec2<i32>(id.xy);
  let index = convert2DTo1D(downscaledResolution.x, id.xy);
  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
  blueNoisePixel.x += frameOffsetX;
  blueNoisePixel.y += frameOffsetY;

  for(var i = 0; i < 8; i++){
    let iterOffsetX = (i * 193) % 512; // Large prime numbers for frame variation
    let iterOffsetY = (i * 257) % 512; // Different prime numbers
    let r = textureLoad(blueNoiseTex, (blueNoisePixel + vec2(iterOffsetX, iterOffsetY)) % 512, 0).xy;
    let offset = vec2<i32>((r * 2.0 - 1.0) * SAMPLE_RADIUS);
//    let offset = NEIGHBOUR_OFFSETS[i];

    let normal = textureLoad(normalTex, vec2<i32>(pixel) + offset * DOWN_SAMPLE_FACTOR, 0).xyz;
    let normalWeight = max(dot(normal, normalRef), 0.0);

    let neighbor = clamp(vec2<i32>(downscaledPixel) + offset, vec2<i32>(0), vec2<i32>(downscaledResolution - vec2<u32>(1)));
    let neighborIndex = convert2DTo1D(downscaledResolution.x,vec2<u32>(neighbor));

    let sampleWeight =  normalWeight;

    let neighborContribution = inputPixelBuffer[neighborIndex].contribution * sampleWeight;
    let neighborWeight = inputPixelBuffer[neighborIndex].weight * sampleWeight;
    let currentWeight = inputPixelBuffer[index].weight;
    let currentSampleCount = inputPixelBuffer[index].sampleCount;

    if(neighborWeight > currentWeight){
       outputPixelBuffer[index].contribution = neighborContribution;
       outputPixelBuffer[index].weight = neighborWeight;
       outputPixelBuffer[index].lightIndex = inputPixelBuffer[index].lightIndex;
       outputPixelBuffer[index].sampleCount = inputPixelBuffer[neighborIndex].sampleCount;
    }
    outputPixelBuffer[index].sampleCount+= currentSampleCount;
  }
}
