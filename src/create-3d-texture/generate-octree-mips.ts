import renderOctreeFragmentShader from "./generate-octree-mips.frag.wgsl";

export const generateOctreeMips = async (
  device: GPUDevice,
  volume: GPUTexture,
) => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          viewDimension: "3d",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const zIndicesBuffer = device.createBuffer({
    size: volume.depthOrArrayLayers * 256,
    usage:
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.UNIFORM,
  });

  const incrementingIndices = Array.from(
    { length: volume.depthOrArrayLayers },
    (_, i) => i,
  );

  for (let i = 0; i < incrementingIndices.length; i++) {
    device.queue.writeBuffer(
      zIndicesBuffer,
      256 * i, // offset
      new Uint32Array([incrementingIndices[i]]).buffer,
    );
  }

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: device.createShaderModule({
        code: `
          struct VertexOutput {
            @builtin(position) Position : vec4<f32>,
          }
          const pos = array(
              vec2( 1.0,  1.0),
              vec2( 1.0, -1.0),
              vec2(-1.0, -1.0),
              vec2( 1.0,  1.0),
              vec2(-1.0, -1.0),
              vec2(-1.0,  1.0),
            );
          @vertex
          fn vertex_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
            var output : VertexOutput;
            output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
            return output;
          }`,
      }),
      entryPoint: "vertex_main",
    },
    // TODO: Output octree into mipmap here
    fragment: {
      module: device.createShaderModule({
        code: `
          @group(0) @binding(0) var voxels : texture_3d<f32>;
          @group(0) @binding(1) var<uniform> zIndex: u32;
          ${renderOctreeFragmentShader}
        `,
      }),
      entryPoint: "fragment_main",
      targets: [{ format: volume.format }],
    },
  });

  const commandEncoder = device.createCommandEncoder();

  // For each mip level, render each slice of the 3D texture
  for (let mipLevel = 1; mipLevel < volume.mipLevelCount; mipLevel++) {
    console.debug(`Generating mip level ${mipLevel}`);
    const depthAtMipLevel = Math.max(1, volume.depthOrArrayLayers >> mipLevel);

    // Render each slice of the 3D texture
    for (let i = 0; i < depthAtMipLevel; i++) {
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: volume.createView({
              baseMipLevel: mipLevel - 1,
              mipLevelCount: 1,
            }),
          },
          {
            binding: 1,
            resource: {
              buffer: zIndicesBuffer,
              offset: i * 256,
              size: 4,
            },
          },
        ],
      });

      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: volume.createView({
              baseArrayLayer: i, // Render to the current slice
              arrayLayerCount: 1,
              baseMipLevel: mipLevel, // Use the previous mip, so that we do not need to check every voxel for every level
              mipLevelCount: 1,
              dimension: "2d",
            }),
            loadOp: "clear",
            clearValue: [0.0, 0.0, 0.0, 0.0],
            storeOp: "store",
          },
        ],
      });

      passEncoder.setPipeline(renderPipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(6);
      passEncoder.end();
    }
  }
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
};
