import { RenderPass } from "../app";
import fog from "./simple-fog.compute.wgsl";
import { createComputePass } from "../abstractions/compute-pass";

export const getSimpleFogPass = async (): Promise<RenderPass> => {
  return createComputePass({
    shaderCode: fog,
    entryPoint: "main",
    label: "fog",
  });
};
