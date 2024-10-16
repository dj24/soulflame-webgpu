@group(0) @binding(0) var nearestSampler : sampler;
@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var reservoirTex : texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(13) var linearSampler : sampler;


@group(1) @binding(0) var inputReservoirTex : texture_2d<f32>;

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

struct Reservoir {
  sampleCount: u32,
  weightSum: f32,
  lightWeight: f32,
  lightIndex: u32,
}

const NEIGHBOUR_OFFSETS = array<vec2<i32>, 4>(
  vec2<i32>(-1, 0),
  vec2<i32>(1, 0),
  vec2<i32>(0, -1),
  vec2<i32>(0, 1),
//  vec2<i32>(-1, -1),
//  vec2<i32>(1, -1),
//  vec2<i32>(-1, 1),
//  vec2<i32>(1, 1)
);

const SAMPLE_RADIUS = 1;
const MAX_WEIGHT = 5.0;
const WEIGHT_THRESHOLD = 50.0;


fn unpackReservoir(reservoir: vec4<f32>) -> Reservoir {
    return Reservoir(
        bitcast<u32>(reservoir.x),
        reservoir.y,
        reservoir.z,
        bitcast<u32>(reservoir.w)
    );
}

fn packReservoir(reservoir: Reservoir) -> vec4<f32> {
    return vec4<f32>(
        bitcast<f32>(reservoir.sampleCount),
        reservoir.weightSum,
        reservoir.lightWeight,
        bitcast<f32>(reservoir.lightIndex)
    );
}

const DEPTH_THRESHOLD = 16.0;

@compute @workgroup_size(8,8,1)
fn spatial(
@builtin(global_invocation_id) id : vec3<u32>
){

  let resolution = textureDimensions(worldPosTex).xy;
  let uv = (vec2<f32>(id.xy) + vec2(0.5)) / vec2<f32>(resolution);
  let normalRef = textureSampleLevel(normalTex, nearestSampler, uv, 0).xyz;
  let worldPos = textureLoad(worldPosTex, id.xy, 0);

  if(worldPos.w > 10000.0){
    return;
  }

  let reservoir = unpackReservoir(textureSampleLevel(inputReservoirTex, nearestSampler, uv, 0));
  var weightSum = reservoir.weightSum;
  var currentWeight = reservoir.lightWeight;
  var currentSampleCount = reservoir.sampleCount;
  var lightIndex = reservoir.lightIndex;

  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers

  for(var i = 0u; i < 4; i = i + 1u){
    let offset = NEIGHBOUR_OFFSETS[i];
    let neighbor = vec2<i32>(id.xy) + offset;
    let neighborUv = vec2<f32>(neighbor) / vec2<f32>(resolution);
    let neighborReservoir = unpackReservoir(textureLoad(inputReservoirTex, neighbor, 0));
    let linearReservoir = unpackReservoir(textureSampleLevel(inputReservoirTex, linearSampler, neighborUv, 0));
    let neighborWeight = neighborReservoir.lightWeight;
    let normalSample = textureSampleLevel(normalTex, nearestSampler, neighborUv, 0).xyz;
    let normalSimilarity = dot(normalRef, normalSample);

    weightSum += neighborWeight;
    currentSampleCount += neighborReservoir.sampleCount;

    let sampleR = textureLoad(blueNoiseTex, (neighbor + vec2(frameOffsetX, frameOffsetY)) % 512, 0).xy;

    let depthSample = textureLoad(worldPosTex, neighbor, 0).w;
    let depthDifference: f32 = abs(depthSample - worldPos.w);

    if(sampleR.y < neighborWeight / weightSum && normalSimilarity > 0.5 && depthDifference < DEPTH_THRESHOLD){
        lightIndex = neighborReservoir.lightIndex;
        currentWeight = neighborWeight;
    }

  }

  let newReservoir = Reservoir(currentSampleCount, weightSum, currentWeight, lightIndex);
  textureStore(reservoirTex, id.xy, packReservoir(newReservoir));
}
