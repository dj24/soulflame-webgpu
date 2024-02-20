import { RenderPass } from "../app";
import water from "./water.wgsl";
import { createComputeCompositePass } from "../abstractions/compute-composite-pass";

export const getWaterPass = async (): Promise<RenderPass> => {
  return createComputeCompositePass({
    shaderCode: water,
    effectEntryPoint: "main",
    compositeEntryPoint: "composite",
    downscale: 1,
    label: "water",
  });
};
