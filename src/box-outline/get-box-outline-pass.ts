import { RenderPass } from "../app";
import boxOutline from "./box-outline.wgsl";
import { createPerObjectPass } from "../abstractions/per-object-pass";

export const getBoxOutlinePass = async (): Promise<RenderPass> => {
  return createPerObjectPass({
    shaderCode: boxOutline,
    entryPoint: "main",
    label: "box outline",
  });
};
