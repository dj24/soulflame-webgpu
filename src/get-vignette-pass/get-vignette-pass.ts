import { createComputePass } from "../abstractions/compute-pass";

export const getVignettePass = (strength = 15.0, radius = 0.25) => {
  return createComputePass({
    shaderCode: `
      @compute @workgroup_size(8, 8, 1)
      fn main(
        @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
      ) {
        var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(textureDimensions(inputTex));
        uv *=  1.0 - uv.yx;
        var vig = uv.x * uv.y * ${strength};
        vig = pow(vig, ${radius});
        let blended = textureLoad(inputTex, GlobalInvocationID.xy, 0) * vig;
        textureStore(outputTex, GlobalInvocationID.xy, blended);
      }
    `,
    entryPoint: "main",
    label: "vignette",
  });
};
