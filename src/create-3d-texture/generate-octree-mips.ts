import renderOctreeFragmentShader from "./generate-octree-mips.frag.wgsl";
import { device } from "../app";

const copy3dTextureTo2dArray = async (
  device: GPUDevice,
  texture: GPUTexture,
) => {
  if (texture.dimension !== "3d") {
    throw new Error("Input texture should be a 3D texture");
  }
  const arrayTexture = device.createTexture({
    size: {
      width: texture.width,
      height: texture.height,
      depthOrArrayLayers: texture.depthOrArrayLayers,
    },
    format: texture.format,
    usage:
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT,
    dimension: "2d",
    mipLevelCount: texture.mipLevelCount,
  });

  const commandEncoder = device.createCommandEncoder();
  for (let m = 0; m < texture.mipLevelCount; m++) {
    for (let i = 0; i < texture.depthOrArrayLayers >> m; i++) {
      commandEncoder.copyTextureToTexture(
        {
          texture: texture,
          mipLevel: m,
          origin: { x: 0, y: 0, z: i },
        },
        {
          texture: arrayTexture,
          mipLevel: m,
          origin: { x: 0, y: 0, z: i },
        },
        {
          width: texture.width >> m,
          height: texture.height >> m,
          depthOrArrayLayers: 1,
        },
      );
    }
  }
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  return arrayTexture;
};

const copy2dArrayTo3dTexture = async (
  device: GPUDevice,
  texture: GPUTexture,
) => {
  if (texture.dimension !== "2d") {
    throw new Error("Input texture should be a 2D texture");
  }
  const volumeTexture = device.createTexture({
    size: {
      width: texture.width,
      height: texture.height,
      depthOrArrayLayers: texture.depthOrArrayLayers,
    },
    format: texture.format,
    usage:
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING,
    dimension: "3d",
    mipLevelCount: texture.mipLevelCount,
  });

  const commandEncoder = device.createCommandEncoder();
  for (let m = 0; m < texture.mipLevelCount; m++) {
    for (let i = 0; i < texture.depthOrArrayLayers >> m; i++) {
      commandEncoder.copyTextureToTexture(
        {
          texture: texture,
          mipLevel: m,
          origin: { x: 0, y: 0, z: i },
        },
        {
          texture: volumeTexture,
          mipLevel: m,
          origin: { x: 0, y: 0, z: i },
        },
        {
          width: texture.width >> m,
          height: texture.height >> m,
          depthOrArrayLayers: 1,
        },
      );
    }
  }
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  return volumeTexture;
};

/** Generate the next mip level of an octree texture */
const generateNextOctreeMip = async (
  device: GPUDevice,
  volume: GPUTexture,
  mipLevel: number,
) => {
  if (volume.dimension !== "3d") {
    throw new Error("Input texture should be a 3D texture");
  }

  const arrayTexture = await copy3dTextureTo2dArray(device, volume);

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
  const depthAtMipLevel = Math.max(1, volume.depthOrArrayLayers >> mipLevel);

  // Render each slice of the 3D texture
  for (let i = 0; i < depthAtMipLevel; i++) {
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: volume.createView({
            label: `${mipLevel} mip level of volume texture`,
            dimension: "3d",
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
          view: arrayTexture.createView({
            label: "volume slice for rendering mips",
            baseArrayLayer: i, // Render to the current slice
            arrayLayerCount: 1,
            baseMipLevel: mipLevel, // Use the previous mip, so that we do not need to check every voxel for every level
            mipLevelCount: 1,
            dimension: "2d-array",
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

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  return await copy2dArrayTo3dTexture(device, arrayTexture);
};

/**
 * Generate mips for an octree texture, input texture should be a 3D texture
 * @param device
 * @param volume
 */
export const generateOctreeMips = async (
  device: GPUDevice,
  volume: GPUTexture,
) => {
  if (volume.dimension !== "3d") {
    throw new Error("Input texture should be a 3D texture");
  }

  let texture = volume;
  for (let mipLevel = 1; mipLevel < volume.mipLevelCount; mipLevel++) {
    texture = await generateNextOctreeMip(device, texture, mipLevel);
  }
  return texture;
};
