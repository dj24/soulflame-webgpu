struct SVGFConfig {
  normalSigma: f32,
  varianceSigma: f32,
  blueNoiseScale: f32,
  spatialSigma: f32,
}

struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
};

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var normalTex : texture_2d<f32>;
@group(0) @binding(2) var worldPosTex : texture_2d<f32>;
@group(0) @binding(3) var outputTex : texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<uniform> atrousRate : u32;
@group(0) @binding(5) var linearSampler : sampler;
@group(0) @binding(6) var nearestSampler : sampler;
@group(0) @binding(7) var<uniform> time : Time;
@group(0) @binding(8) var varianceTex : texture_2d<f32>;

@group(1) @binding(0) var<uniform> svgfConfig : SVGFConfig;

const POISSON_DISK_OFFSETS = array<vec2<f32>, 8>(
    vec2<f32>(-0.326212, -0.405345),
    vec2<f32>(-0.840144, -0.073580),
    vec2<f32>(-0.695914,  0.457137),
    vec2<f32>(-0.203345,  0.620716),
    vec2<f32>( 0.962340, -0.194983),
    vec2<f32>( 0.473434, -0.480026),
    vec2<f32>( 0.519456,  0.767022),
    vec2<f32>( 0.185461, -0.893124)
);

// random rotation angles
const ROTATIONS = array<f32, 8>(
    257.0,
    117.0,
    231.0,
    179.0,
    13.0,
    229.0,
    311.0,
    123.0
);

fn rotatePoissonDisk(angle: f32) -> array<vec2<f32>, 8> {
    let rotationMatrix = rotate2D(angle);
    var rotatedOffsets: array<vec2<f32>, 8>;
    for (var i = 0; i < 8; i = i + 1) {
        rotatedOffsets[i] = rotationMatrix * POISSON_DISK_OFFSETS[i];
    }
    return rotatedOffsets;
}

const SOURCE_WEIGHT = 1.0;

fn rotate2D(angle: f32) -> mat2x2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return mat2x2<f32>(
        vec2<f32>(c, -s),
        vec2<f32>(s, c)
    );
}

@compute @workgroup_size(8,8,1)
fn main(
 @builtin(global_invocation_id) id : vec3<u32>
){

    var weightSum = SOURCE_WEIGHT;
    var resolution = vec2<f32>(textureDimensions(inputTex));
    let uv = (vec2<f32>(id.xy) + vec2(0.5)) / resolution;
    var colourRef = textureLoad(inputTex, id.xy, 0).rgb;
    let normalRef = textureSampleLevel(normalTex, nearestSampler, uv, 0).rgb;
    let varianceRef = textureSampleLevel(varianceTex, nearestSampler, uv, 0).r;

    var colour = colourRef;
    let rotation = ROTATIONS[id.x % 8];
    let rotatedOffsets = rotatePoissonDisk(rotation);

    for(var i = 0; i < 8; i = i + 1){
        let uvOffset = rotatedOffsets[i] / resolution * f32(atrousRate);
        let colourSample = textureSampleLevel(inputTex, nearestSampler, uv + uvOffset, 0);

        let normal = textureSampleLevel(normalTex, nearestSampler, uv + uvOffset, 0).rgb;
        let normalWeight = exp(-dot(normalRef - normal, normalRef - normal) / (2.0 * svgfConfig.normalSigma * svgfConfig.normalSigma));

        let variance = textureSampleLevel(varianceTex, nearestSampler, uv + uvOffset, 0).r;
        let varianceWeight = exp(-pow(varianceRef - variance, 2.0) / (2.0 * svgfConfig.varianceSigma * svgfConfig.varianceSigma));

        let weight = clamp(normalWeight, 0.0, 1.0) * clamp(varianceWeight, 0.0, 1.0);

        colour += colourSample.rgb * weight;
        weightSum += weight;
    }
    colour /= weightSum;

    let variance = textureLoad(varianceTex, id.xy, 0).r;

    textureStore(outputTex, id.xy, vec4<f32>(colour, 1.0));
}