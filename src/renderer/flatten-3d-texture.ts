export const flatten3dTexture = async (
  device: GPUDevice,
  texture: GPUTexture,
): Promise<GPUTexture> => {
  const { width, height, depthOrArrayLayers } = texture;
  const textureFormat = texture.format;

  const stagingTexture = device.createTexture({
    size: { width, height, depthOrArrayLayers: 1 },
    format: textureFormat,
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });

  const computeShaderModule = device.createShaderModule({
    code: `
      @group(0) @binding(0) var voxels : texture_3d<f32>;
      @group(0) @binding(1) var outputTex : texture_storage_2d<rgba8unorm, write>;

      @compute @workgroup_size(8, 8, 1)
      fn main(
       @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
      ) {
        let textureSize = textureDimensions(voxels);
        for (var z = 0u; z < textureSize.z; z++) {
          let texel = textureLoad(voxels, vec3(GlobalInvocationID.xy, z), 0);
          if(texel.a > 0.0) {
            textureStore(outputTex, vec2(GlobalInvocationID.xy), texel);
            return;
          }
        }
      }
    `,
  });

  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: computeShaderModule,
      entryPoint: "main",
    },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: texture.createView(),
      },
      {
        binding: 1,
        resource: stagingTexture.createView(),
      },
    ],
  });

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(width / 8, height / 8);
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  return stagingTexture;
};
