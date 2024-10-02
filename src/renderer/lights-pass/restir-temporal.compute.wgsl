@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read_write> pixelBuffer : array<LightPixel>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;

@group(1) @binding(0) var velocityTex : texture_2d<f32>;
@group(1) @binding(1) var<storage, read> previousPixelBuffer : array<LightPixel>;

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

const DISTANCE_THRESHOLD = 10.0;
const SAMPLE_BLEND_FACTOR = 0.5;

@compute @workgroup_size(8,8,1)
fn main(
@builtin(global_invocation_id) id : vec3<u32>
){
  var downscaledPixel = id.xy;
  let resolution = textureDimensions(inputTex);
  let downscaledResolution = resolution / DOWN_SAMPLE_FACTOR;

  var pixel = downscaledPixel * DOWN_SAMPLE_FACTOR;
  let uv = (vec2<f32>(pixel) + vec2(0.5)) / vec2<f32>(resolution);
  let velocity = textureLoad(velocityTex, pixel, 0).xy;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;


  let pixelVelocity = velocity * vec2<f32>(resolution);
  let previousUv = uv - velocity;
  let previousPixel = vec2<u32>(previousUv * vec2<f32>(resolution));
  let previousDownscaledPixel = vec2<u32>(previousUv * vec2<f32>(downscaledResolution));
  let worldPosAtPrevious = textureLoad(worldPosTex, vec2<u32>(previousPixel), 0).xyz;


  let index = convert2DTo1D(downscaledResolution.x, downscaledPixel);
  let previousIndex = convert2DTo1D(downscaledResolution.x, vec2<u32>(previousDownscaledPixel));

  if(distance(worldPos, worldPosAtPrevious) > DISTANCE_THRESHOLD){
    pixelBuffer[index].weight = 0.0;
    pixelBuffer[index].sampleCount = 0;
    pixelBuffer[index].contribution = vec3<f32>(0.0);
    return;
  }

  var previousLightPixel = previousPixelBuffer[previousIndex];

  if(previousLightPixel.weight > pixelBuffer[index].weight){
    pixelBuffer[index] = previousLightPixel;
    pixelBuffer[index].sampleCount += previousLightPixel.sampleCount;
  }
}
