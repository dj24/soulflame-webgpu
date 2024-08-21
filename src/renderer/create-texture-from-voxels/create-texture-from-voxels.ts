import { TVoxels } from "../convert-vxm";
import { VOLUME_ATLAS_FORMAT, VOLUME_MIP_LEVELS } from "../constants";
import { Vec3 } from "wgpu-matrix";

const convert3DTo1D = (
  size: [number, number, number] | Vec3,
  position: [number, number, number] | Vec3,
) => {
  return (
    position[0] + position[1] * size[0] + position[2] * (size[0] * size[1])
  );
};

/**
 * Creates a 3D texture from a TVoxels object
 * @param device GPUDevice used to create the texture
 * @param voxels TVoxels object containing the voxel data
 * @returns GPUTexture containing the voxel data, with a single mip level
 */
export const createTextureFromVoxels = async (
  device: GPUDevice,
  voxels: TVoxels,
): Promise<GPUTexture> => {
  const texture = device.createTexture({
    size: {
      width: voxels.SIZE[0],
      height: voxels.SIZE[1],
      depthOrArrayLayers: voxels.SIZE[2],
    },
    format: VOLUME_ATLAS_FORMAT,
    usage:
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
    dimension: "2d",
    mipLevelCount: VOLUME_MIP_LEVELS,
  });

  const totalVoxels =
    texture.width * texture.height * texture.depthOrArrayLayers;

  const voxelsBuffer = device.createBuffer({
    size: totalVoxels * 4 * 4,
    usage:
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.STORAGE,
  });

  const zIndicesBuffer = device.createBuffer({
    size: voxels.SIZE[2] * 256,
    usage:
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC |
      GPUBufferUsage.UNIFORM,
    label: "voxels buffer",
  });

  const incrementingIndices = Array.from(
    { length: voxels.SIZE[2] },
    (_, i) => i,
  );

  for (let i = 0; i < incrementingIndices.length; i++) {
    device.queue.writeBuffer(
      zIndicesBuffer,
      256 * i, // offset
      new Uint32Array([incrementingIndices[i]]).buffer,
    );
  }

  for (let i = 0; i < voxels.XYZI.length; i++) {
    const { x, y, z, c } = voxels.XYZI[i];
    const bufferIndex = convert3DTo1D(voxels.SIZE, [x, y, z]);
    device.queue.writeBuffer(
      voxelsBuffer,
      16 * bufferIndex, // offset
      new Uint32Array([x, y, z, c]).buffer,
    );
  }

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "storage",
        },
      },
    ],
  });

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
          
          @vertex
          fn vertex_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
            const pos = array(
              vec2( 1.0,  1.0),
              vec2( 1.0, -1.0),
              vec2(-1.0, -1.0),
              vec2( 1.0,  1.0),
              vec2(-1.0, -1.0),
              vec2(-1.0,  1.0),
            );
            var output : VertexOutput;
            output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
            return output;
          }`,
      }),
      entryPoint: "vertex_main",
    },
    fragment: {
      module: device.createShaderModule({
        code: `
          @group(0) @binding(0) var<uniform> zIndex: u32;
          @group(0) @binding(1) var<storage, read_write> voxelBuffer: array<vec4<u32>>;
          
          override sizeX: u32;
          override sizeY: u32;
          override sizeZ: u32;
           
          fn convert3DTo1D(size: vec3<u32>, position: vec3<u32>) -> u32 {
            return position.x + position.y * size.x + position.z * (size.x * size.y);
          }
          
          @fragment
          fn fragment_main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> { 
            let voxelPosition = vec3(position.xy, f32(zIndex));
            let voxelIndex = convert3DTo1D(vec3<u32>(sizeX, sizeY, sizeZ), vec3<u32>(voxelPosition));
            let voxel = voxelBuffer[voxelIndex];
            let normalisedPaletteIndex = f32(voxel.a) / 255.0;
            return vec4(normalisedPaletteIndex,0,0,0);
          }
        `,
      }),
      entryPoint: "fragment_main",
      targets: [{ format: VOLUME_ATLAS_FORMAT }],
      constants: {
        sizeX: voxels.SIZE[0],
        sizeY: voxels.SIZE[1],
        sizeZ: voxels.SIZE[2],
      },
    },
  });

  const commandEncoder = device.createCommandEncoder();

  // Render each slice of the 3D texture
  for (let i = 0; i < texture.depthOrArrayLayers; i++) {
    const bindGroup = device.createBindGroup({
      label: "create-texture-from-voxels",
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: zIndicesBuffer,
            offset: i * 256,
            size: 4,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: voxelsBuffer,
          },
        },
      ],
    });
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: texture.createView({
            baseArrayLayer: i,
            arrayLayerCount: 1,
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

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  const mb = totalVoxels / 1024 / 1024;

  console.log(`Created texture of size ${mb.toFixed(3)} MB`);
  return texture;
};
