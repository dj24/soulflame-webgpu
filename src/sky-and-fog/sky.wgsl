struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var depth : texture_2d<f32>;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> viewProjections : ViewProjectionMatrices;

// Function to mimic the ease_out_expo function
fn ease_out_expo(x: f32) -> f32 {
    let t: f32 = x;
    let b: f32 = 0.0;
    let c: f32 = 1.0;
    let d: f32 = 1.0; // Set the duration within the function
    let intermediate_result: f32 = c * (-pow(2.0, -10.0 * t / d) + 1.0) + b;
    return select(intermediate_result, b + c, t == d);
}

fn sample_sky(rayDirection: vec3<f32>) -> vec3<f32> {
    //TODO: add this to uniforms
    let lightDirection = normalize(vec3(1.0,1.0,0.));
    let y = clamp(ease_out_expo(rayDirection.y * 0.66), 0.0, 1.0);
//    let y = rayDirection.y;
    let sunHeight = clamp(lightDirection.y, 0.0, 1.0);
    let horizon = mix(vec3<f32>(0.95, 0.5, 0.4), vec3<f32>(0.6, 0.8, 1.0), sunHeight);
    let sky = mix(vec3<f32>(0.55, 0.7, 0.7), vec3<f32>(0.3, 0.6, 0.95), sunHeight);
    let sunFalloff = 0.8;
    let sunAmount = 1.0 - ease_out_expo(length(lightDirection - rayDirection) * sunFalloff);
//    let sunAmount = 1.0 - length(lightDirection - rayDirection) * sunFalloff;
    let skyColour = mix(horizon, sky, y);
    let sunColour = mix(vec3<f32>(1.8, 1.6, 1.1), vec3<f32>(1.6, 1.6, 1.4), sunHeight);

    let intensity = clamp(sunHeight, 0.75, 1.0);
    return mix(skyColour, sunColour, clamp(sunAmount, 0.0, 1.0)) * intensity;
}

const SKY_COLOUR: vec3<f32> = vec3<f32>(0.55, 0.7, 0.7);
const START_DISTANCE: f32 = 0.0;
const FOG_DENSITY: f32 = 0.05;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    let resolution = textureDimensions(depth);
    var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
    uv = vec2(uv.x, 1.0 - uv.y);
    let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
    let pixel = GlobalInvocationID.xy;
    let sky = sample_sky(rayDirection);
    let depthSample = textureLoad(depth, pixel, 0).a;
    let inputSample = textureLoad(inputTex, pixel, 0).rgb;
    let depthFactor = clamp(exp(-(depthSample - START_DISTANCE) * FOG_DENSITY), 0.0, 1.0);
    textureStore(outputTex, pixel, vec4(mix(sky,inputSample, depthFactor), 1));
}