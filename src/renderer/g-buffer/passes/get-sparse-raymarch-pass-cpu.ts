import {
  device,
  frameCount,
  frameTimeTracker,
  RenderArgs,
  resolution,
} from "../../app";
import getWasmModule from "./foo.c";

const ceilToNearestMultipleOf = (n: number, multiple: number) => {
  return Math.ceil(n / multiple) * multiple;
};

// CPU raymarch is at 3x downscale, so we put each sample into the bottom left origin of a 3x3 grid
export const writeBufferToTextureCompute = () => {
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: `
          fn convert1DTo2D(size: vec2<u32>, index: u32) -> vec2<u32> {
            return vec2(
              index % size.x,
              index / size.x
            );
          }

          @group(0) @binding(0) var<storage> albedoBuffer : array<u32>;
          @group(0) @binding(1) var outputTex : texture_storage_2d<rgba8unorm, write>;

          @compute @workgroup_size(64, 1, 1)
          fn main(
            @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
          ) {
            let bufferIndex = GlobalInvocationID.x;
            let texSize = textureDimensions(outputTex) / 3;
            let texCoord = convert1DTo2D(texSize, bufferIndex);
            if(any(texCoord >= texSize)) {
              return;
            }
            let albedo = unpack4x8unorm(albedoBuffer[bufferIndex]);
            textureStore(outputTex, texCoord * 3, albedo);
          }
        `,
      }),
      entryPoint: "main",
    },
  });

  let bindGroup: GPUBindGroup;

  const enqueuePass = (
    commandEncoder: GPUCommandEncoder,
    renderArgs: RenderArgs,
    buffer: GPUBuffer,
  ) => {
    if (!bindGroup) {
      bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: {
              buffer,
            },
          },
          {
            binding: 1,
            resource: renderArgs.outputTextures.albedoTexture.view,
          },
        ],
      });
    }
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(buffer.size / 64));
    pass.end();
  };

  return enqueuePass;
};

export const getSparseRaymarchPassCPU = async () => {
  let testBuffer: GPUBuffer;
  let outputPtr: number;
  let resolutionPtr: number;
  let cameraMatricesPtr: number;

  const wasmModule = await getWasmModule();
  const writeBufferToTexture = writeBufferToTextureCompute();

  const enqueuePass = (
    commandEncoder: GPUCommandEncoder,
    renderArgs: RenderArgs,
  ) => {
    const { texture: albedoTexture } = renderArgs.outputTextures.albedoTexture;
    const width = Math.ceil(albedoTexture.width / 3);
    const height = Math.ceil(albedoTexture.height / 3);
    const bytesPerRow = ceilToNearestMultipleOf(width * 4, 256);
    const totalBytes = bytesPerRow * height;
    if (!testBuffer) {
      testBuffer = device.createBuffer({
        size: totalBytes,
        usage:
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.STORAGE,
      });
      outputPtr = wasmModule._malloc(totalBytes);
      resolutionPtr = wasmModule._malloc(Uint32Array.BYTES_PER_ELEMENT * 2);
      cameraMatricesPtr = wasmModule._malloc(
        Float32Array.BYTES_PER_ELEMENT * 16,
      );
    }

    // Write the resolution to the wasm memory
    new Uint32Array(wasmModule.HEAPU32.buffer, resolutionPtr, 2).set([
      resolution[0] / 3,
      resolution[1] / 3,
    ]);

    // Write the camera matrices to the wasm memory
    new Float32Array(
      wasmModule.HEAPF32.buffer,
      cameraMatricesPtr,
      renderArgs.viewProjectionMatricesArray.length,
    ).set(renderArgs.viewProjectionMatricesArray);

    const start = performance.now();
    wasmModule.ccall(
      "populate",
      null,
      ["uint8_t*", "uint32_t", "uint32_t", "vec2_u32*", "camera_matrices*"],
      [outputPtr, totalBytes, frameCount, resolutionPtr, cameraMatricesPtr],
    );
    const end = performance.now();
    frameTimeTracker.addSample("wasm raymarch", end - start);
    device.queue.writeBuffer(
      testBuffer,
      0,
      wasmModule.HEAPU8.buffer,
      outputPtr,
      totalBytes,
    );
    writeBufferToTexture(commandEncoder, renderArgs, testBuffer);
  };
  return enqueuePass;
};
