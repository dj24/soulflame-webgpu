import { device, RenderPass, RenderArgs, resolution } from "../app";
import { GBufferTexture } from "../abstractions/g-buffer-texture";
import { getWorldPosReconstructionPipeline } from "./passes/get-world-pos-reconstruction-pass";
import { getInterpolatePipeline } from "./passes/get-interpolation-pass";
import { getSparseRaymarchPipeline } from "./passes/get-sparse-raymarch-pass";
import {
  copyGBufferTexture,
  createCopyOfGBufferTexture,
} from "../abstractions/copy-g-buffer-texture";
import { getSparseRaymarchPassCPU } from "./passes/get-sparse-raymarch-pass-cpu";
import { getBufferRaymarchPipeline } from "./passes/get-buffer-raymarch-pass";

export type OutputTextures = {
  finalTexture: GBufferTexture;
  albedoTexture?: GBufferTexture;
  normalTexture?: GBufferTexture;
  velocityTexture?: GBufferTexture;
  depthTexture?: GBufferTexture;
  worldPositionTexture?: GBufferTexture;
  skyTexture?: GPUTexture;
};

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

export const getGBufferPass = async (): Promise<RenderPass> => {
  const worldPosReconstruct = await getWorldPosReconstructionPipeline();
  const sparseRayMarch = await getSparseRaymarchPipeline();
  const interpolate = await getInterpolatePipeline();
  const bufferMarch = await getBufferRaymarchPipeline();

  let copyTextures: Partial<
    Record<keyof OutputTextures, GBufferTexture | null>
  > = {
    albedoTexture: null,
    velocityTexture: null,
    depthTexture: null,
    normalTexture: null,
  };

  let indirectBuffer: GPUBuffer;
  let screenRayBufferCopy: GPUBuffer;
  let screenRayBuffer: GPUBuffer;
  //
  // setInterval(() => {
  //   if (screenRayBufferCopy) {
  //     screenRayBufferCopy
  //       .mapAsync(GPUMapMode.READ)
  //       .then(() => {
  //         const mapped = new Uint32Array(
  //           screenRayBufferCopy.getMappedRange(0, 640),
  //         );
  //         console.log(mapped[0]);
  //         screenRayBufferCopy.unmap();
  //       })
  //       .catch();
  //   }
  // }, 500);

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
      const uint32 = new Uint32Array(3);
      uint32[0] = 1; // The X value
      uint32[1] = 1; // The Y value
      uint32[2] = 1; // The Z value
      // Write values into a GPUBuffer
      device.queue.writeBuffer(indirectBuffer, 0, uint32, 0, uint32.length);

      const { width, height } = renderArgs.outputTextures.finalTexture;
      const maxScreenRays = (width / 3) * (height / 3);
      const bufferSizeBytes = ceilToNearestMultipleOf(maxScreenRays * 4, 4);
      console.log({ maxScreenRays, bufferSizeBytes });
      screenRayBuffer = device.createBuffer({
        size: bufferSizeBytes,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      });
      screenRayBufferCopy = device.createBuffer({
        size: screenRayBuffer.size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    }

    Object.keys(copyTextures).forEach((key: keyof OutputTextures) => {
      const source = renderArgs.outputTextures[key] as GBufferTexture;
      if (copyTextures[key] === null) {
        copyTextures[key] = createCopyOfGBufferTexture(device, source);
      }
    });

    const { commandEncoder, timestampWrites } = renderArgs;

    commandEncoder.clearBuffer(indirectBuffer, 0, 4);
    commandEncoder.clearBuffer(screenRayBuffer);

    let computePass = commandEncoder.beginComputePass({ timestampWrites });
    sparseRayMarch(computePass, renderArgs);
    computePass.end();

    Object.keys(copyTextures).forEach((key: keyof OutputTextures) => {
      const source = renderArgs.outputTextures[key] as GBufferTexture;
      const destination = copyTextures[key] as GBufferTexture;
      copyGBufferTexture(commandEncoder, source, destination);
    });

    computePass = commandEncoder.beginComputePass({ timestampWrites });
    interpolate(
      computePass,
      renderArgs,
      copyTextures.albedoTexture.view,
      copyTextures.velocityTexture.view,
      copyTextures.depthTexture.view,
      copyTextures.normalTexture.view,
      indirectBuffer,
      screenRayBuffer,
    );
    computePass.end();

    computePass = commandEncoder.beginComputePass();
    bufferMarch(computePass, renderArgs, screenRayBuffer, indirectBuffer);
    computePass.end();

    computePass = commandEncoder.beginComputePass();
    worldPosReconstruct(computePass, renderArgs);
    computePass.end();

    // commandEncoder.copyBufferToBuffer(
    //   indirectBuffer,
    //   0,
    //   screenRayBufferCopy,
    //   0,
    //   indirectBuffer.size,
    // );
  };

  return { render, label: "raymarched g-buffer" };
};
