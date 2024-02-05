import { RenderPass } from "../app";
import boxOutline from "./box-outline.wgsl";
import { createComputePass } from "../abstractions/compute-pass";

export const getBoxOutlinePass = async (): Promise<RenderPass> => {
  return createComputePass({
    shaderCode: boxOutline,
    entryPoint: "main",
    label: "box outline",
  });
};
