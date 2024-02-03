import { RenderPass } from "../app";
import volumetricFog from "./volumetric-fog.wgsl";
import { createComputeCompositePass } from "../abstractions/compute-composite-pass";

export const getVolumetricFog = async (): Promise<RenderPass> => {
  return createComputeCompositePass({
    shaderCode: volumetricFog,
    effectEntryPoint: "main",
    compositeEntryPoint: "blur",
    downscale: 2,
    label: "volumetric fog",
  });
};
