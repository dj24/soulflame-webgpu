struct Light {
  position: vec3<f32>,
  color: vec3<f32>,
};

struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
};

struct LightPixel {
  sampleCount: u32,
  weight: f32,
  contribution: vec3<f32>,
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
@group(0) @binding(5) var<storage, read_write> pixelBuffer : array<LightPixel>;
@group(0) @binding(6) var inputTex : texture_2d<f32>;
@group(0) @binding(10) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(11) var<uniform> time : Time;
@group(0) @binding(12) var<uniform> cameraPosition : vec3<f32>;

@group(1) @binding(0) var<uniform> svgfConfig : SVGFConfig;
@group(1) @binding(1) var depthTex : texture_2d<f32>;

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

const BLUR_RADIUS = 1;

fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
    return index2D.y * width + index2D.x;
}

fn convert1DTo2D(width: u32, index1D: u32) -> vec2<u32> {
    return vec2<u32>(index1D % width, index1D / width);
}

@compute @workgroup_size(8,8,1)
fn composite(
@builtin(global_invocation_id) id : vec3<u32>
){
  let pixel = id.xy;
  var downscaledPixel = pixel / DOWN_SAMPLE_FACTOR;
  let downscaledResolution = textureDimensions(outputTex) / DOWN_SAMPLE_FACTOR;
  let normalRef = textureLoad(normalTex, pixel, 0).xyz;
  let worldPosRef = textureLoad(worldPosTex, pixel, 0).xyz;
  let depthRef = distance(cameraPosition, worldPosRef);

  var blueNoisePixel = vec2<i32>(id.xy);
  let frameOffsetX = (i32(time.frame) * 92821 + 71413) % 512;  // Large prime numbers for frame variation
  let frameOffsetY = (i32(time.frame) * 13761 + 511) % 512;    // Different prime numbers
  blueNoisePixel.x += frameOffsetX;
  blueNoisePixel.y += frameOffsetY;
  let r = textureLoad(blueNoiseTex, blueNoisePixel % 512, 0).xy;
  var index = convert2DTo1D(downscaledResolution.x, downscaledPixel);

  // Get initial light contribution, so we dont have a black screen with no valid blur samples
  let normalSample = textureLoad(normalTex, downscaledPixel * DOWN_SAMPLE_FACTOR, 0).xyz;
  let normalWeight = exp(-dot(normalRef - normalSample, normalRef - normalSample) / (2.0 * svgfConfig.normalSigma * svgfConfig.normalSigma));
  let worldPosSample = textureLoad(worldPosTex, downscaledPixel * DOWN_SAMPLE_FACTOR, 0).xyz;
  let depthSample = distance(cameraPosition, worldPosSample);
  let depthWeight = exp(-pow(depthRef - depthSample, 2.0) / (2.0 * svgfConfig.depthSigma * svgfConfig.depthSigma));
  var blurWeightSum = depthWeight * normalWeight;
  var averageSampleCount = f32(pixelBuffer[index].sampleCount) * blurWeightSum;
  var averageWeight = pixelBuffer[index].weight * blurWeightSum;
  var averageContribution = pixelBuffer[index].contribution * blurWeightSum;

  for(var x = -BLUR_RADIUS; x <= BLUR_RADIUS; x++){
    for(var y = -BLUR_RADIUS; y <= BLUR_RADIUS; y++){
      if(x == 0 && y == 0) {
      continue;
      }
      let neighbor = vec2<i32>(downscaledPixel) + vec2<i32>(x, y) + vec2<i32>(r * svgfConfig.blueNoiseScale);
      let neighborIndex = convert2DTo1D(downscaledResolution.x, vec2<u32>(neighbor));
      let neighborLightIndex = pixelBuffer[neighborIndex].lightIndex;
      let neighborLightPosition = lightsBuffer[neighborLightIndex].position;
      let neighborLightSampleCount = pixelBuffer[neighborIndex].sampleCount;
      let neighborWeight = pixelBuffer[neighborIndex].weight;
      let neighborContribution = pixelBuffer[neighborIndex].contribution;
      let normalSample = textureLoad(normalTex, vec2<u32>(neighbor) * DOWN_SAMPLE_FACTOR, 0).xyz;
      let worldPosSample = textureLoad(worldPosTex, vec2<u32>(neighbor) * DOWN_SAMPLE_FACTOR, 0).xyz;
      let depthSample = distance(cameraPosition, worldPosSample);

      // Compute weight based on normal similarity (Gaussian weighting)
      let normalWeight = exp(-dot(normalRef - normalSample, normalRef - normalSample) / (2.0 * svgfConfig.normalSigma * svgfConfig.normalSigma));
      // Compute weight based on depth similarity (Gaussian weighting)
      let depthWeight = exp(-pow(depthRef - depthSample, 2.0) / (2.0 * svgfConfig.depthSigma * svgfConfig.depthSigma));
      // Compute distance from source pixel to downscaled resevoir pixel
      let fullResNeighbor = vec2<i32>(neighbor) * DOWN_SAMPLE_FACTOR;
      let pixelDistance = distance(vec2<f32>(fullResNeighbor), vec2<f32>(pixel));
      let pixelDistanceWeight = exp(-pow(pixelDistance, 2.0) / (2.0 * svgfConfig.spatialSigma * svgfConfig.spatialSigma));
      let finalWeight = pixelDistanceWeight * depthWeight * normalWeight;

      averageSampleCount += f32(neighborLightSampleCount) * finalWeight;
      averageWeight += neighborWeight * finalWeight;
      averageContribution += neighborContribution * finalWeight;
      blurWeightSum += finalWeight;
    }
  }

  averageSampleCount /= blurWeightSum;
  let averageLightProbability = 1.0 / averageSampleCount;
  averageContribution /= blurWeightSum;
  averageWeight /= blurWeightSum;

  let diffuse = averageContribution * averageWeight * averageLightProbability;

  // Composite the light
  let inputColor = textureLoad(inputTex, pixel, 0).xyz;
  let outputColor = diffuse + inputColor;

  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(diffuse, 1.0));


}