@group(0) @binding(0) var inputTex : texture_2d<i32>;
@group(0) @binding(1) var outputTex : texture_storage_2d<rg32sint, write>;
@group(0) @binding(2) var<uniform> resolution : vec2<u32>;

const DOWNSCALE_FACTOR = 4;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    let downscaleRadius = i32(floor(DOWNSCALE_FACTOR / 2));
    let downscaledResolution = resolution / vec2(DOWNSCALE_FACTOR);
    var downscalePixel = vec2<i32>(GlobalInvocationID.xy + u32(downscaleRadius)) / DOWNSCALE_FACTOR;
    var minDistance = textureLoad(inputTex, downscalePixel, 0).r;
    for(var x = -downscaleRadius; x <= downscaleRadius; x++)
      {
          for(var y = -downscaleRadius; y <= downscaleRadius; y++)
          {
              let offset = vec2<i32>(x, y);
              let currentSample = textureLoad(inputTex, downscalePixel + offset, 0).r;
              if(currentSample < minDistance && currentSample > 0)
              {
                  minDistance = currentSample;
              }
          }
      }
    textureStore(outputTex, GlobalInvocationID.xy, vec4(minDistance, 0, 0, 0));
}
