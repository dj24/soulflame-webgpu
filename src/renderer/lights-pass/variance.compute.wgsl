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

@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var previousTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<r32float, write>;

@group(1) @binding(0) var worldPosTex : texture_2d<f32>;
@group(1) @binding(1) var normalTex : texture_2d<f32>;
@group(1) @binding(2) var velocityTex : texture_2d<f32>;

const MIN_SOURCE_BLEND = 0.2;
const SPATIAL_WEIGHT = 8.0;

@compute @workgroup_size(8,8,1)
fn main(
 @builtin(global_invocation_id) id : vec3<u32>
){
    let resolution = textureDimensions(inputTex);
    let pixel = vec2<i32>(id.xy);
    let colour = textureLoad(inputTex, pixel, 0).rgb;
    let normalRef = textureLoad(normalTex, pixel, 0).rgb;
    let worldPosRef = textureLoad(worldPosTex, pixel, 0);
    if(worldPosRef.w > 9999.0){
        textureStore(outputTex, id.xy, vec4<f32>(0.0));
        return;
    }
    let velocity = textureLoad(velocityTex, pixel, 0).xy;
    let pixelVelocity = velocity * vec2<f32>(resolution);
    let previousPixel = vec2<i32>(vec2<f32>(id.xy) + vec2(0.5) - pixelVelocity);
    var previousVariance = textureLoad(previousTex, previousPixel, 0).r;

    // Get variance
    var newVariance = 0.0;
    for(var i = 0; i < 8; i = i + 1){
        let offset = NEIGHBOUR_OFFSETS[i];
        let colourSample = textureLoad(inputTex, pixel + offset[i], 0).rgb;
        let colourVariance = length(colourSample.rgb - colour) * length(colourSample.rgb - colour);
        newVariance += max(colourVariance, 0.0);

        let normal = textureLoad(normalTex, pixel + offset[i], 0).rgb;
        let normalVariance = length(normalRef - normal) * length(normalRef - normal);
        newVariance += max(normalVariance, 0.0);

        let worldPos = textureLoad(worldPosTex, pixel + offset[i], 0);
        let worldPosVariance = length(worldPosRef.xyz - worldPos.xyz) * length(worldPosRef.xyz - worldPos.xyz);
        newVariance += max(worldPosVariance * SPATIAL_WEIGHT, 0.0);
    }
    newVariance /= 8.0;

    if(any(pixel < vec2(0)) || any(pixel >= vec2<i32>(resolution))){
        textureStore(outputTex, id.xy, vec4<f32>(newVariance));
        return;
    }

    var sourceWeight: f32 = clamp(length(velocity), MIN_SOURCE_BLEND, 1.0);
    var historyWeight: f32 = 1.0 - sourceWeight;
    sourceWeight *= 1.0 / (1.0 + newVariance);
    historyWeight *= 1.0 / (1.0 + previousVariance);
    let result = (newVariance * sourceWeight + previousVariance * historyWeight) / max(sourceWeight + historyWeight, 0.0001);

    textureStore(outputTex, id.xy, vec4<f32>(result));
}