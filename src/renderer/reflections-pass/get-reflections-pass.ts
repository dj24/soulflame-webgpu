import { RenderPass } from "../app";
import reflections from "./reflections.wgsl";
import { createComputeCompositePass } from "../abstractions/compute-composite-pass";

export const getReflectionsPass = async (): Promise<RenderPass> => {
  return createComputeCompositePass({
    shaderCode: reflections,
    effectEntryPoint: "main",
    compositeEntryPoint: "composite",
    downscale: 1,
    label: "reflections",
  });
};
