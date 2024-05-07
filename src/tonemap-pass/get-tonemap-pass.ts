import { RenderPass } from "../app";
import { createComputePass } from "../abstractions/compute-pass";
import toneMapCompute from "./tonemap.compute.wgsl";

export const getTonemapPass = async (): Promise<RenderPass> => {
  return createComputePass({
    shaderCode: toneMapCompute,
    entryPoint: "main",
    label: "tonemap",
  });
};
