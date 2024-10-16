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
  let reservoir = unpackReservoir(textureSampleLevel(reservoirTex, nearestSampler, uv, 0));
  let linearReservoir = unpackReservoir(textureSampleLevel(reservoirTex, linearSampler, uv, 0));
  let diffuse = linearReservoir.lightWeight * lightsBuffer[reservoir.lightIndex].color;
//  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(linearReservoir.lightWeight * 200.0));
  textureStore(outputTex, vec2<i32>(id.xy), vec4<f32>(diffuse, 1.0));


}