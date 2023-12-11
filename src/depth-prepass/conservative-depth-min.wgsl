@group(0) @binding(0) var inputTex : texture_2d<f32>;
@group(0) @binding(1) var outputTex : texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> resolution : vec2<u32>;

const DOWNSCALE_FACTOR = 8;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    let downscaledResolution = resolution / vec2(DOWNSCALE_FACTOR);
    var downscalePixel = vec2<i32>(GlobalInvocationID.xy / DOWNSCALE_FACTOR);
    var minDistance = textureLoad(inputTex, downscalePixel, 0).r;
    // TODO: maybe use downlscale of 5 so that the pixel is perfectly center in the kernel
    for(var x = -2; x < 2; x++)
      {
          for(var y = -2; y < 2; y++)
          {
              let currentSample = textureLoad(inputTex, downscalePixel + vec2(x, y), 0).r;
              if(currentSample < minDistance && currentSample > 0)
              {
                  minDistance = currentSample;
              }
          }
      }
    textureStore(outputTex, GlobalInvocationID.xy, vec4(minDistance));
}
