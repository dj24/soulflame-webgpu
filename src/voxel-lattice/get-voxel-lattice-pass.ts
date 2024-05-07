import {
  camera,
  debugValues,
  device,
  RenderArgs,
  RenderPass,
  resolution,
} from "../app";
import redFrag from "./lattice.frag.wgsl";
import triangleVert from "./lattice.vert.wgsl";
import { mat4, Vec3, vec3 } from "wgpu-matrix";
import { voxelObjects } from "../create-tavern";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";
import { VoxelObject } from "../voxel-object";

const STRIDE = 256;

/** Gets each quad required for the lattice
 * x, y, z plane faces
 *
 * @param size The size of the lattice
 * @returns The vertices of the lattice
 */
const getLatticeVertices = (size: Vec3): Float32Array => {
  const [x, y, z] = size;

  const bottomLeftBack = [0, 0, 0, 1];
  const bottomRightBack = [x, 0, 0, 1];
  const topLeftBack = [0, y, 0, 1];
  const topRightBack = [x, y, 0, 1];
  const bottomLeftFront = [0, 0, z, 1];
  const bottomRightFront = [x, 0, z, 1];
  const topLeftFront = [0, y, z, 1];

  let xyPlane = [
    bottomLeftBack,
    bottomRightBack,
    topLeftBack,
    topRightBack,
  ].flat();

  let xzPlane = [
    bottomLeftBack,
    bottomRightBack,
    bottomLeftFront,
    bottomRightFront,
  ].flat();

  let yzPlane = [
    bottomLeftBack,
    topLeftBack,
    bottomLeftFront,
    topLeftFront,
  ].flat();

  return new Float32Array([...xyPlane, ...xzPlane, ...yzPlane]);
};

export const getVoxelLatticePass = async (): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
        buffer: {
          type: "uniform",
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
          viewDimension: "3d",
        },
      },
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Camera position
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
      // Brick buffer
      {
        binding: 6,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage",
        },
      },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: device.createShaderModule({
        code: `
        ${getRayDirection}
        ${triangleVert}`,
      }),
      entryPoint: "main",
      buffers: [
        {
          arrayStride: 16,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: 0,
              format: "float32x4",
            },
          ],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({
        code: `
        @group(0) @binding(6) var<storage> brickBuffer: array<Brick>;
        ${getRayDirection}
        ${boxIntersection}
        ${raymarchVoxels}
        ${redFrag}
        `,
      }),
      entryPoint: "main",
      targets: [
        // albedo
        { format: "rgba8unorm" },
        // normal
        { format: "rgba16float" },
        // world position
        { format: "rgba32float" },
        // velocity
        { format: "rgba16float" },
      ],
    },
    primitive: {
      topology: "triangle-strip",
      cullMode: "none",
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth32float",
    },
  });

  const render = ({
    commandEncoder,
    outputTextures,
    transformationMatrixBuffer,
    volumeAtlas,
    viewProjectionMatricesBuffer,
    timestampWrites,
    cameraPositionBuffer,
  }: RenderArgs) => {
    const sortedVoxelObjectsFrontToBack = voxelObjects;

    const colorAttachments: GPURenderPassColorAttachment[] = [
      {
        view: outputTextures.albedoTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
      {
        view: outputTextures.normalTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
      {
        view: outputTextures.worldPositionTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
      {
        view: outputTextures.velocityTexture.view,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ];

    const depthStencilAttachment: GPURenderPassDepthStencilAttachment = {
      view: outputTextures.depthTexture.view,
      depthClearValue: 1.0,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    };

    const totalVerticesBytes = sortedVoxelObjectsFrontToBack.reduce(
      (acc, voxelObject) =>
        acc + getLatticeVertices(voxelObject.size).byteLength,
      0,
    );

    const verticesBuffer = device.createBuffer({
      size: totalVerticesBytes,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const modelViewProjectionMatrixBuffer = device.createBuffer({
      size: 256 * sortedVoxelObjectsFrontToBack.length,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const modelMatrixBuffer = device.createBuffer({
      size: 256 * sortedVoxelObjectsFrontToBack.length,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const voxelObjectBuffer = device.createBuffer({
      size: 512 * sortedVoxelObjectsFrontToBack.length,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    let bindGroups = [];

    const vertices = new Float32Array(getLatticeVertices(vec3.create(1, 1, 1)));
    device.queue.writeBuffer(
      verticesBuffer,
      0,
      vertices.buffer,
      vertices.byteOffset,
      vertices.byteLength,
    );

    for (let i = 0; i < sortedVoxelObjectsFrontToBack.length; i++) {
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: modelViewProjectionMatrixBuffer,
              offset: 256 * i,
            },
          },
          {
            binding: 1,
            resource: {
              buffer: modelMatrixBuffer,
              offset: 256 * i,
            },
          },
          {
            binding: 2,
            resource: {
              buffer: viewProjectionMatricesBuffer,
            },
          },
          {
            binding: 3,
            resource: volumeAtlas.atlasTextureView,
          },
          {
            binding: 4,
            resource: {
              buffer: voxelObjectBuffer,
              offset: 512 * i,
            },
          },
          {
            binding: 5,
            resource: {
              buffer: cameraPositionBuffer,
            },
          },
        ],
      });
      bindGroups.push(bindGroup);

      const voxelObject = sortedVoxelObjectsFrontToBack[i];
      const vp = mat4.mul(
        mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
        camera.viewMatrix,
      );
      const mvp = new Float32Array(mat4.mul(vp, voxelObject.transform));
      device.queue.writeBuffer(
        modelViewProjectionMatrixBuffer,
        256 * i,
        mvp.buffer,
        mvp.byteOffset,
        mvp.byteLength,
      );
      const m = new Float32Array(voxelObject.transform);
      device.queue.writeBuffer(
        modelMatrixBuffer,
        256 * i,
        m.buffer,
        m.byteOffset,
        m.byteLength,
      );
      const object = new Float32Array(voxelObject.toArray());
      device.queue.writeBuffer(
        voxelObjectBuffer,
        512 * i,
        object.buffer,
        object.byteOffset,
        object.byteLength,
      );
    }

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments,
      depthStencilAttachment,
      timestampWrites,
    });
    passEncoder.setPipeline(pipeline);

    for (let i = 0; i < sortedVoxelObjectsFrontToBack.length; i++) {
      const bindGroup = bindGroups[i];
      passEncoder.setVertexBuffer(0, verticesBuffer, 0);
      passEncoder.setBindGroup(0, bindGroup);
      // XY plane
      passEncoder.draw(4, sortedVoxelObjectsFrontToBack[i].size[2] + 1, 0, 0);
      // XZ plane
      passEncoder.draw(4, sortedVoxelObjectsFrontToBack[i].size[1] + 1, 4, 0);
      // YZ plane
      passEncoder.draw(4, sortedVoxelObjectsFrontToBack[i].size[0] + 1, 8, 0);
    }

    passEncoder.end();

    commandEncoder.copyTextureToTexture(
      {
        texture: outputTextures.albedoTexture.texture,
      },
      {
        texture: outputTextures.finalTexture.texture,
      },
      {
        width: outputTextures.finalTexture.width,
        height: outputTextures.finalTexture.height,
        depthOrArrayLayers: 1, // Copy one layer (z-axis slice)
      },
    );
    // const solidColourTexture = device.createTexture({
    //   size: { width: 1, height: 1 },
    //   format: "rgba8unorm",
    //   usage:
    //     GPUTextureUsage.COPY_DST |
    //     GPUTextureUsage.RENDER_ATTACHMENT |
    //     GPUTextureUsage.TEXTURE_BINDING,
    // });
    //
    // device.queue.writeTexture(
    //   { texture: solidColourTexture },
    //   new Uint8Array([1, 0, 0]),
    //   {},
    //   { width: 1, height: 1 },
    // );
    //
    // blitRender(commandEncoder, solidColourTexture, outputTextures.finalTexture);

    return [commandEncoder.finish()];
  };

  return { render, label: "lattice" };
};
