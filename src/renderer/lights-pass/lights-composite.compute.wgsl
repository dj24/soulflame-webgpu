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

const BLUR_RADIUS = 2;

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
  let uv = vec2<f32>(pixel) / vec2<f32>(textureDimensions(outputTex));
  let normalRef = textureLoad(normalTex, pixel, 0).xyz;
  let worldPosRef = textureLoad(worldPosTex, pixel, 0).xyz;
  let depthRef = distance(cameraPosition, worldPosRef);

  var blueNoisePixel = vec2<i32>(id.xy);
  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
  blueNoisePixel.x += frameOffsetX;
  blueNoisePixel.y += frameOffsetY;
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;

  // Compute weight based on normal similarity (Gaussian weighting)
  let normalSample = textureLoad(normalTex, pixel, 0).xyz;
  let normalWeight = exp(-dot(normalRef - normalSample, normalRef - normalSample) / (2.0 * svgfConfig.normalSigma * svgfConfig.normalSigma));
  let worldPosSample = textureLoad(worldPosTex, pixel, 0).xyz;
  // Depth weighting
  let depthSample = distance(cameraPosition, worldPosSample);
  let depthWeight = exp(-pow(depthRef - depthSample, 2.0) / (2.0 * svgfConfig.depthSigma * svgfConfig.depthSigma));
  // Spatial weighting
//  let gauss = distance(vec2<f32>(pixel), vec2<f32>(downscaledPixel));
//  let gaussWeight = exp(-pow(gauss, 2.0) / (2.0 * svgfConfig.spatialSigma * svgfConfig.spatialSigma));

//  var blurWeightSum = gaussWeight * normalWeight * depthWeight;
var blurWeightSum = 1.0;
  let reservoir = unpackReservoir(textureLoad(reservoirTex, pixel, 0));
  let linearReservoir = unpackReservoir(textureSampleLevel(reservoirTex, linearSampler, uv, 0));
  var averageSampleCount = f32(reservoir.sampleCount) * blurWeightSum;
  var averageWeightSum = linearReservoir.weightSum * blurWeightSum;
  var averageWeight = linearReservoir.lightWeight * blurWeightSum;
  var averageContribution = linearReservoir.lightWeight * lightsBuffer[reservoir.lightIndex].color * blurWeightSum;

//  for(var x = -BLUR_RADIUS; x <= BLUR_RADIUS; x++){
//    for(var y = -BLUR_RADIUS; y <= BLUR_RADIUS; y++){
//      if(x == 0 && y == 0) {
//      continue;
//      }
//      let neighbor = vec2<i32>(downscaledPixel) + vec2<i32>(x, y) + vec2<i32>(r * svgfConfig.blueNoiseScale);
//      let neighborIndex = convert2DTo1D(downscaledResolution.x, vec2<u32>(neighbor));
//      let neighborLightIndex = pixelBuffer[neighborIndex].lightIndex;
//      let neighborLightPosition = lightsBuffer[neighborLightIndex].position;
//      let neighborLightSampleCount = pixelBuffer[neighborIndex].sampleCount;
//      let neighborWeight = pixelBuffer[neighborIndex].lightWeight;
//      let neighborWeightSum = pixelBuffer[neighborIndex].weightSum;
//
//      let neighborContribution = neighborWeight * normalize(lightsBuffer[neighborLightIndex].color);
//      let normalSample = textureLoad(normalTex, vec2<u32>(neighbor) * DOWN_SAMPLE_FACTOR, 0).xyz;
//      let worldPosSample = textureLoad(worldPosTex, vec2<u32>(neighbor) * DOWN_SAMPLE_FACTOR, 0).xyz;
//      let depthSample = distance(cameraPosition, worldPosSample);
//
//      // Compute weight based on normal similarity (Gaussian weighting)
//      let normalWeight = exp(-dot(normalRef - normalSample, normalRef - normalSample) / (2.0 * svgfConfig.normalSigma * svgfConfig.normalSigma));
//      // Compute weight based on depth similarity (Gaussian weighting)
//      let depthWeight = exp(-pow(depthRef - depthSample, 2.0) / (2.0 * svgfConfig.depthSigma * svgfConfig.depthSigma));
//      // Compute distance from source pixel to downscaled resevoir pixel
//      let fullResNeighbor = vec2<i32>(neighbor) * DOWN_SAMPLE_FACTOR;
//      let gauss = distance(vec2<f32>(fullResNeighbor), vec2<f32>(pixel));
//      let gaussWeight = exp(-pow(gauss, 2.0) / (2.0 * svgfConfig.spatialSigma * svgfConfig.spatialSigma));
//      let finalWeight = gaussWeight * normalWeight * depthWeight;
//
//      averageSampleCount += f32(neighborLightSampleCount) * finalWeight;
//      averageContribution += neighborContribution * finalWeight;
//      averageWeight += neighborWeight * finalWeight;
//      averageWeightSum += neighborWeightSum * finalWeight;
//      blurWeightSum += finalWeight;
//    }
//  }
  blurWeightSum = max(blurWeightSum, 0.0001); // Prevent division by zero (or close to zero

  averageSampleCount /= blurWeightSum;
  averageWeightSum /= blurWeightSum;
  averageWeight /= blurWeightSum;
  averageContribution /= blurWeightSum;

  let averageLightProbability = 1.0 / averageSampleCount;
  let diffuse = averageContribution * averageWeight * averageLightProbability;

  // Composite the light
  let inputColor = textureLoad(inputTex, pixel, 0).xyz;
  let outputColor = diffuse + inputColor;

  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(diffuse, 1.0));


}