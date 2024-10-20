// Helper function to compute luminance
fn Luminance(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.299, 0.587, 0.114));
}

fn rcp(x: f32) -> f32 {
    return 1.0 / x;
}

struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

fn calculateUvFromWorldPostion(worldPos: vec3<f32>, matrices: ViewProjectionMatrices) -> vec2<f32> {
  let clipPos = matrices.viewProjection * vec4<f32>(worldPos, 1.0);
  let uv = (matrices.inverseProjection * clipPos).xy;
  return uv * 0.5 + 0.5;
}

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

@group(0) @binding(0) var CurrentColor : texture_2d<f32>;
@group(0) @binding(1) var Velocity : texture_2d<f32>;
@group(0) @binding(3) var HistoryRead : texture_2d<f32>;
@group(0) @binding(4) var linearSampler : sampler;
@group(0) @binding(5) var nearestSampler : sampler;
@group(0) @binding(6) var worldPosTex : texture_2d<f32>;
@group(0) @binding(7) var previousWoldPosTex : texture_2d<f32>;

const DEPTH_THRESHOLD : f32 = 16.0;
const MIN_SOURCE_BLEND = 0.1;

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>
) {
    let texSize = vec2<f32>(textureDimensions(CurrentColor));
    let uv = (vec2<f32>(id.xy) + vec2(0.5)) / texSize;
    let worldPosSample = textureLoad(worldPosTex, id.xy, 0);
    let worldPos = worldPosSample.xyz;
    let depthSample = worldPosSample.w;

    // Get velocity from pixel with closest depth value in 3x3 neighborhood
    var closestDepthPixel = vec2<i32>(id.xy);
    var closestDepth = 999999999.0;
    for (var i = 0; i < 8; i = i + 1) {
        let neighbourPixel = clamp(vec2<i32>(id.xy) + NEIGHBORHOOD_SAMPLE_POSITIONS[i], vec2<i32>(0), vec2<i32>(texSize - 1));
        let neighbourDepth = textureLoad(worldPosTex, neighbourPixel, 0).w;
        if (abs(neighbourDepth - depthSample) < abs(closestDepth - depthSample)) {
            closestDepth = neighbourDepth;
            closestDepthPixel = neighbourPixel;
        }
    }

    let velocity = textureLoad(Velocity, closestDepthPixel, 0).xy;
    let previousUv = uv - velocity;
    let previousPixel = vec2<i32>(previousUv * texSize);

    var depthAtPreviousPixel = textureLoad(previousWoldPosTex, previousPixel, 0).w;

    // Apply depth clamping
    if (abs(depthSample - depthAtPreviousPixel) > DEPTH_THRESHOLD) {
        return;
    }

    var sourceSample: vec3<f32> = textureSampleLevel(CurrentColor, nearestSampler, uv, 0).rgb;
    var historySample = textureSampleLevel(HistoryRead, linearSampler, previousUv, 0).rgb;
//
    // Clamp the history sample to the min and max of the 3x3 neighborhood
    var minCol: vec3<f32> = sourceSample;
    var maxCol: vec3<f32> = sourceSample;
    for (var x: i32 = -1; x <= 1; x = x + 1) {
        for (var y: i32 = -1; y <= 1; y = y + 1) {
            let neighbourPixel = clamp(vec2(i32(id.x) + x, i32(id.y) + y), vec2(0), vec2(i32(texSize.x - 1), i32(texSize.y - 1)));
            let s: vec3<f32> = textureLoad(CurrentColor, neighbourPixel, 0).rgb;
            minCol = min(minCol, s);
            maxCol = max(maxCol, s);
        }
    }
    historySample = clamp(historySample, minCol, maxCol);

    var sourceWeight: f32 = clamp(length(velocity), MIN_SOURCE_BLEND, 1.0);
    var historyWeight: f32 = 1.0 - sourceWeight;
    let compressedSource: vec3<f32> = sourceSample * rcp(max(max(sourceSample.r, sourceSample.g), sourceSample.b) + 1.0);
    let compressedHistory: vec3<f32> = historySample * rcp(max(max(historySample.r, historySample.g), historySample.b) + 1.0);
    let luminanceSource: f32 = Luminance(compressedSource);
    let luminanceHistory: f32 = Luminance(compressedHistory);
    sourceWeight *= 1.0 / (1.0 + luminanceSource);
    historyWeight *= 1.0 / (1.0 + luminanceHistory);
    let result: vec3<f32> = (sourceSample * sourceWeight + historySample * historyWeight) / max(sourceWeight + historyWeight, 0.0001);

    textureStore(HistoryWrite, id.xy, vec4<f32>(result, 1.0));
}
