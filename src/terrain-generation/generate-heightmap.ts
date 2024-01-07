import terrainHeight from "./terrain-height.wgsl";

export const generateHeightmap = (device: GPUDevice): GPUTexture => {
  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: terrainHeight,
      }),
      entryPoint: "main",
    },
  });
};
