import { device, RenderArgs, resolution } from "../../app";
import "./foo.c";
import foo from "./foo.js";

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

export const getSparseRaymarchPassCPU = async () => {
  let testBuffer: GPUBuffer;

  console.log({ foo: await foo() });

  const enqueuePass = (
    commandEncoder: GPUCommandEncoder,
    renderArgs: RenderArgs,
  ) => {
    const { texture: albedoTexture } = renderArgs.outputTextures.albedoTexture;
    const { width, height } = albedoTexture;
    // const width = 100;
    // const height = 100;
    const bytesPerRow = ceilToNearestMultipleOf(width * 4, 256);

    if (!testBuffer) {
      testBuffer = device.createBuffer({
        size: bytesPerRow * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
    }

    // const data = new Uint8Array(testBuffer.size);
    // for (let i = 0; i < testBuffer.size; i += 4) {
    //   // data.set([255, 0, 0, 255], i);
    //   data[i] = 255;
    //   data[i + 1] = 0;
    //   data[i + 2] = 0;
    //   data[i + 3] = 255;
    // }

    // for (let i = 0; i < testBuffer.size; i += 4) {
    //   const data = new Uint8Array([255, 0, 0, 255]);
    //   device.queue.writeBuffer(testBuffer, 4 * i, data);
    // }

    // Copy buffer data to texture
    // commandEncoder.copyBufferToTexture(
    //   {
    //     buffer: testBuffer,
    //     offset: 0,
    //     bytesPerRow,
    //   },
    //   {
    //     texture: albedoTexture,
    //   },
    //   [width, height, 1],
    // );
  };
  return enqueuePass;
};
