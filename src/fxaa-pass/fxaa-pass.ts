import { createComputePass } from "../abstractions/compute-pass";
import fxaa from "./fxaa.compute.wgsl";
import { createComputeCompositePass } from "../abstractions/compute-composite-pass";
export const getFXAAPass = () => {
  return createComputeCompositePass({
    shaderCode: fxaa,
    effectEntryPoint: "main",
    compositeEntryPoint: "composite",
    downscale: 1,
    label: "FXAA",
  });
};
