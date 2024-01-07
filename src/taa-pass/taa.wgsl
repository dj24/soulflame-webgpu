// Helper function to compute luminance
fn Luminance(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.299, 0.587, 0.114));
}

fn rcp(x: f32) -> f32 {
    return 1.0 / x;
}

@group(0) @binding(0) var CurrentColor : texture_2d<f32>;
@group(0) @binding(1) var Velocity : texture_2d<f32>;
@group(0) @binding(2) var HistoryWrite : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var HistoryRead : texture_2d<f32>;
@group(0) @binding(5) var Depth : texture_2d<f32>;

const DEPTH_THRESHOLD : f32 = 0.01;

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>
) {
    let texSize = textureDimensions(CurrentColor);
    let uv = vec2<f32>(id.xy / texSize);
    let sourceSample: vec3<f32> = textureLoad(CurrentColor, id.xy, 0).rgb;

    let uvVelocity: vec2<f32> = textureLoad(Velocity, id.xy, 0).xy * vec2(0.5, -0.5);
    let previousUv: vec2<f32> = clamp(uv - uvVelocity, vec2(0.0), vec2(1.0));
    let previousPixel: vec2<u32> = vec2<u32>(round(previousUv * vec2<f32>(texSize)));

    var historySample: vec3<f32> = textureLoad(HistoryRead, previousPixel, 0).rgb;

    // Sample depth from the Depth texture
    let depthSample: f32 = textureLoad(Depth, id.xy, 0).r;
    let depthAtPreviousPixel: f32 = textureLoad(Depth, previousPixel, 0).r;

    // Calculate depth difference between source and history samples
    let depthDifference: f32 = abs(depthSample - depthAtPreviousPixel);

    // Apply depth clamping
    if (depthDifference > DEPTH_THRESHOLD) {
        // Discard or handle the pixel differently
        // For example, you can discard the pixel or use a different blending approach.
        return;
    }

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

    var sourceWeight: f32 = 0.05;
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
