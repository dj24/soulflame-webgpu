import { device, RenderPass, RenderArgs } from "../app";
import { GBufferTexture } from "../abstractions/g-buffer-texture";
import { getWorldPosReconstructionPipeline } from "./passes/get-world-pos-reconstruction-pass";
import { getInterpolatePipeline } from "./passes/get-interpolation-pass";
import { getSparseRaymarchPipeline } from "./passes/get-sparse-raymarch-pass";
import {
  copyGBufferTexture,
  createCopyOfGBufferTexture,
} from "../abstractions/copy-g-buffer-texture";
import { getSparseRaymarchPassCPU } from "./passes/get-sparse-raymarch-pass-cpu";

export type OutputTextures = {
  finalTexture: GBufferTexture;
  albedoTexture?: GBufferTexture;
  normalTexture?: GBufferTexture;
  velocityTexture?: GBufferTexture;
  depthTexture?: GBufferTexture;
  worldPositionTexture?: GBufferTexture;
  skyTexture?: GPUTexture;
};

export const getGBufferPass = async (): Promise<RenderPass> => {
  const worldPosReconstruct = await getWorldPosReconstructionPipeline();
  const rayMarch = await getSparseRaymarchPipeline();
  const interpolate = await getInterpolatePipeline();
  const cpuRayMarch = await getSparseRaymarchPassCPU();

  let copyTextures: Partial<
    Record<keyof OutputTextures, GBufferTexture | null>
  > = {
    albedoTexture: null,
    velocityTexture: null,
    depthTexture: null,
    normalTexture: null,
  };

  const render = (renderArgs: RenderArgs) => {
    Object.keys(copyTextures).forEach((key: keyof OutputTextures) => {
      const source = renderArgs.outputTextures[key] as GBufferTexture;
      if (copyTextures[key] === null) {
        copyTextures[key] = createCopyOfGBufferTexture(device, source);
      }
    });

    const { commandEncoder, timestampWrites } = renderArgs;
    let computePass = commandEncoder.beginComputePass({ timestampWrites });
    rayMarch(computePass, renderArgs);
    computePass.end();

    Object.keys(copyTextures).forEach((key: keyof OutputTextures) => {
      const source = renderArgs.outputTextures[key] as GBufferTexture;
      const destination = copyTextures[key] as GBufferTexture;
      copyGBufferTexture(commandEncoder, source, destination);
    });

    computePass = commandEncoder.beginComputePass();
    interpolate(
      computePass,
      renderArgs,
      copyTextures.albedoTexture.view,
      copyTextures.velocityTexture.view,
      copyTextures.depthTexture.view,
      copyTextures.normalTexture.view,
    );
    worldPosReconstruct(computePass, renderArgs);
    computePass.end();
    cpuRayMarch(commandEncoder, renderArgs);
  };

  return { render, label: "raymarched g-buffer" };
};
