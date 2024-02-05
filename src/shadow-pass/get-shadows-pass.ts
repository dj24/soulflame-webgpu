import { RenderPass } from "../app";
import shadows from "./shadows.wgsl";
import { createComputeCompositePass } from "../abstractions/compute-composite-pass";

export const getShadowsPass = async (): Promise<RenderPass> => {
  return createComputeCompositePass({
    shaderCode: shadows,
    effectEntryPoint: "main",
    compositeEntryPoint: "composite",
    downscale: 2,
    label: "shadows",
  });
};
