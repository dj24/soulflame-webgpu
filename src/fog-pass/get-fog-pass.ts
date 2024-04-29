import { RenderPass } from "../app";
import { createComputeCompositePass } from "../abstractions/compute-composite-pass";
import fog from "./fog.compute.wgsl";

export const getFogPass = async (): Promise<RenderPass> => {
  return createComputeCompositePass({
    shaderCode: fog,
    effectEntryPoint: "main",
    compositeEntryPoint: "composite",
    downscale: 8,
    label: "fog",
  });
};
