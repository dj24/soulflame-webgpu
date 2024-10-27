import { device, RenderPass, RenderArgs } from "../app";
import { GBufferTexture } from "../abstractions/g-buffer-texture";
import { getSparseRaymarchPipeline } from "./passes/get-sparse-raymarch-pass";
import { getTLASRaymarchPass } from "@renderer/g-buffer/passes/get-tlas-raymarch-pass";

export type OutputTextures = {
  finalTexture: GBufferTexture;
  albedoTexture?: GBufferTexture;
  normalTexture?: GBufferTexture;
  velocityTexture?: GBufferTexture;
  depthTexture?: GBufferTexture;
  worldPositionTexture?: GBufferTexture;
  skyTexture?: GPUTexture;
  previousWorldPositionTexture?: GBufferTexture;
  previousNormalTexture?: GBufferTexture;
};

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

export const getGBufferPass = async (): Promise<RenderPass> => {
  const sparseRayMarch = await getSparseRaymarchPipeline();
  const { enqueuePass: renderTLAS, outputTexture: TLASTexture } =
    await getTLASRaymarchPass();

  let counterBuffer: GPUBuffer;
  let indirectBuffer: GPUBuffer;
  let screenRayBuffer: GPUBuffer;

  const render = (renderArgs: RenderArgs) => {
    if (!indirectBuffer) {
      indirectBuffer = device.createBuffer({
        size: 3 * 4,
        usage:
          GPUBufferUsage.INDIRECT |
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST,
      });
      counterBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const uint32 = new Uint32Array(3);
      uint32[0] = 1; // The X value
      uint32[1] = 1; // The Y value
      uint32[2] = 1; // The Z value
      // Write values into a GPUBuffer
      device.queue.writeBuffer(indirectBuffer, 0, uint32, 0, uint32.length);

      const { width, height } = renderArgs.outputTextures.finalTexture;
      const maxScreenRays = (width / 3) * (height / 3);
      const bufferSizeBytes = ceilToNearestMultipleOf(maxScreenRays * 4, 4);
      screenRayBuffer = device.createBuffer({
        size: bufferSizeBytes,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      });
    }

    const { commandEncoder, timestampWrites } = renderArgs;

    commandEncoder.clearBuffer(indirectBuffer, 0, 4);
    commandEncoder.clearBuffer(counterBuffer, 0, 4);
    commandEncoder.clearBuffer(screenRayBuffer);

    // Sparse raymarch
    let computePass = commandEncoder.beginComputePass({ timestampWrites });
    renderTLAS(computePass, renderArgs);
    sparseRayMarch(computePass, renderArgs);
    computePass.end();
  };

  return {
    render,
    label: "primary rays",
    timestampLabels: ["full raymarch"],
  };
};
