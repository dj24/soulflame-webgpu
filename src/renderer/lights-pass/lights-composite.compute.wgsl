struct Light {
  position: vec3<f32>,
  color: vec3<f32>,
};

struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
};

struct Reservoir {
  sampleCount: u32,
  weightSum: f32,
  lightWeight: f32,
  lightIndex: u32,
}

struct SVGFConfig {
  normalSigma: f32,
  depthSigma: f32,
  blueNoiseScale: f32,
  spatialSigma: f32,
}

@group(0) @binding(0) var nearestSampler : sampler;
@group(0) @binding(1) var worldPosTex : texture_2d<f32>;
@group(0) @binding(2) var normalTex : texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lightsBuffer : array<Light>;
@group(0) @binding(4) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(13) var linearSampler : sampler;

@group(1) @binding(0) var<uniform> svgfConfig : SVGFConfig;
@group(1) @binding(1) var reservoirTex : texture_2d<f32>;

const NEIGHBORHOOD_SAMPLE_POSITIONS = array<vec2<i32>, 8>(
    vec2<i32>(-1, -1),
    vec2<i32>(0, -1),
    vec2<i32>(1, -1),
    vec2<i32>(-1, 0),
    vec2<i32>(1, 0),
    vec2<i32>(-1, 1),
    vec2<i32>(0, 1),
    vec2<i32>(1, 1)
);

const BLUR_RADIUS = 6;

fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
    return index2D.y * width + index2D.x;
}

fn convert1DTo2D(width: u32, index1D: u32) -> vec2<u32> {
    return vec2<u32>(index1D % width, index1D / width);
}

fn unpackReservoir(reservoir: vec4<f32>) -> Reservoir {
    return Reservoir(
        bitcast<u32>(reservoir.x),
        reservoir.y,
        reservoir.z,
        bitcast<u32>(reservoir.w)
    );
}

@compute @workgroup_size(8,8,1)
fn composite(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;
  let resolution = textureDimensions(outputTex);
  let uv = vec2<f32>(pixel) / vec2<f32>(resolution);
  let normalRef = textureSampleLevel(normalTex, nearestSampler, uv, 0).xyz;
  let worldPosRef = textureLoad(worldPosTex, pixel, 0);
  let depthRef = worldPosRef.w;

  //TODO: add to seperate denoise pass
//  var blurWeightSum = 0.00001;
//  var averageDiffuse = vec3<f32>(0.0);
//  for(var x = -BLUR_RADIUS; x <= BLUR_RADIUS; x+= DOWN_SAMPLE_FACTOR){
//    for(var y = -BLUR_RADIUS; y <= BLUR_RADIUS; y+= DOWN_SAMPLE_FACTOR){
//      let neighbor = vec2<i32>(id.xy) + vec2<i32>(x, y);
//      let neighborUv = vec2<f32>(neighbor) / vec2<f32>(resolution);
//      let neighborReservoir = unpackReservoir(textureSampleLevel(reservoirTex, nearestSampler, neighborUv, 0));
//      let neighborLightIndex = neighborReservoir.lightIndex;
//      let neighborLightSampleCount = neighborReservoir.sampleCount;
//      let neighborWeight = neighborReservoir.lightWeight;
//      let neighborWeightSum = neighborReservoir.weightSum;
//      let neighborContribution = neighborWeight * lightsBuffer[neighborLightIndex].color;
//      let normalSample = textureSampleLevel(normalTex, nearestSampler, neighborUv, 0).xyz;
//      let worldPosSample = textureSampleLevel(worldPosTex, nearestSampler, neighborUv, 0);
//      let depthSample = worldPosSample.w;
//
//      // Compute weight based on normal similarity (Gaussian weighting)
//      let normalWeight = exp(-dot(normalRef - normalSample, normalRef - normalSample) / (2.0 * svgfConfig.normalSigma * svgfConfig.normalSigma));
//      // Compute weight based on depth similarity (Gaussian weighting)
//      let depthWeight = exp(-pow(depthRef - depthSample, 2.0) / (2.0 * svgfConfig.depthSigma * svgfConfig.depthSigma));
//      // Compute distance from source pixel to downscaled resevoir pixel
//      let gauss = distance(vec2<f32>(id.xy), vec2<f32>(neighbor));
//      let gaussWeight = exp(-pow(gauss, 2.0) / (2.0 * svgfConfig.spatialSigma * svgfConfig.spatialSigma));
//      let finalWeight = normalWeight * depthWeight * gaussWeight;
//
//      let probability = 1.0 / f32(neighborLightSampleCount);
//      let diffuse = neighborContribution * neighborWeight * probability;
//      averageDiffuse += diffuse * finalWeight;
//      blurWeightSum += finalWeight;
//    }
//  }
//  averageDiffuse /= blurWeightSum;
  let reservoir = unpackReservoir(textureSampleLevel(reservoirTex, nearestSampler, uv, 0));
  let diffuse = reservoir.lightWeight * lightsBuffer[reservoir.lightIndex].color;

  // Composite the light
  let inputColor = textureLoad(inputTex, pixel, 0).xyz;
  let outputColor = diffuse + inputColor;

  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(diffuse, 1.0));


}