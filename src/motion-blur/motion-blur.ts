import { RenderPass } from "../app";
import motionBlur from "./motion-blur.wgsl";
import { createComputeCompositePass } from "../abstractions/compute-composite-pass";

export const getMotionBlurPass = async (): Promise<RenderPass> => {
  return createComputeCompositePass({
    shaderCode: motionBlur,
    effectEntryPoint: "main",
    compositeEntryPoint: "composite",
    downscale: 1,
    label: "motion blur",
  });
};
