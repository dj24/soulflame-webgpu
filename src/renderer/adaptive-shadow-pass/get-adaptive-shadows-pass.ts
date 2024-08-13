import { RenderPass } from "../app";
import shadows from "./adaptive-shadows.wgsl";
import { createComputeCompositePass } from "../abstractions/compute-composite-pass";

export const getAdaptiveShadowsPass = async (): Promise<RenderPass> => {
  return createComputeCompositePass({
    shaderCode: shadows,
    effectEntryPoint: "main",
    compositeEntryPoint: "composite",
    downscale: 1,
    label: "adaptive shadows",
  });
};
