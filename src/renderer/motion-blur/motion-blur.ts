import { RenderPass } from "../app";
import motionBlur from "./motion-blur.wgsl";
import { createComputeCompositePass } from "../abstractions/compute-composite-pass";
import { createComputePass } from "../abstractions/compute-pass";

export const getMotionBlurPass = async (): Promise<RenderPass> => {
  return createComputePass({
    shaderCode: motionBlur,
    entryPoint: "main",
    label: "motion blur",
  });
};
