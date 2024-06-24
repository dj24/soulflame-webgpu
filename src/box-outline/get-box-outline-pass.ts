import { camera, device, gpuContext, RenderArgs, RenderPass } from "../app";
import { Light } from "../lights-pass/get-lights-pass";
import { voxelObjects } from "../create-tavern";
import { getCuboidVertices } from "../primitive-meshes/cuboid";
import { getSphereVertices } from "../primitive-meshes/sphere";
import { mat4 } from "wgpu-matrix";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

const vertexStride = 16;

const getConeVertices = (
  radius: number,
  height: number,
  radialSegments: number,
): Float32Array => {
  const vertices = new Float32Array(radialSegments * 3 * 2);
  for (let i = 0; i < radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    vertices.set([x, 0, z], i * 3 * 2);
    vertices.set([0, height, 0], i * 3 * 2 + 3);
  }
  return vertices;
};

// Creates an arrow mesh for a gizmo, with the arrow pointing in the positive z direction
// The arrow is 1 unit long
// arrow tip is a cone with a 0.1 unit radius and 0.2 unit height
const getArrowMesh = (): Float32Array => {
  let vertices: number[] = [];

  // arrow shaft
  const cubeVertices = getCuboidVertices([0.5, 0.5, 10]);
  vertices.push(...cubeVertices);

  // arrow tip
  // const coneVertices = getConeVertices(0.1, 0.2, 16);

  return new Float32Array(vertices);
};

export const getBoxOutlinePass = async (): Promise<RenderPass> => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: {
          type: "uniform",
        },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const verticesPerMesh = getCuboidVertices([1, 1, 1]).length;
  // const verticesPerMesh = getArrowMesh().length;

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: device.createShaderModule({
        code: `
        @binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;
        
        struct VertexOutput {
          @builtin(position) position : vec4f,
        }
        
        @vertex
        fn main(
          @location(0) objectPos : vec4f,
        ) -> VertexOutput {
          var output : VertexOutput;
          output.position =modelViewProjectionMatrix * objectPos;
          return output;
        }

       `,
      }),
      entryPoint: "main",
      buffers: [
        {
          arrayStride: vertexStride,
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
        @fragment
        fn main() -> @location(0) vec4f {
          return vec4(1);
        }
        `,
      }),
      entryPoint: "main",
      targets: [
        {
          format: "bgra8unorm",
        },
      ],
    },
    primitive: {
      topology: "line-list",
      // topology: "triangle-list",
      cullMode: "back",
    },
  });

  const verticesBuffer = device.createBuffer({
    size: vertexStride * verticesPerMesh * voxelObjects.length,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    label: "vertices buffer",
  });

  const modelViewProjectionMatrixBuffer = device.createBuffer({
    size: 256 * voxelObjects.length,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: "mvp buffer",
  });

  const render = ({
    commandEncoder,
    outputTextures,
    transformationMatrixBuffer,
    volumeAtlas,
    viewProjectionMatricesBuffer,
    timestampWrites,
    bvhBuffer,
    lights,
  }: RenderArgs) => {
    let bindGroups = [];

    for (let i = 0; i < voxelObjects.length; i++) {
      // const vertices = getArrowMesh();
      const vertices = getCuboidVertices(voxelObjects[i].size);
      const bufferOffset = i * 256;
      device.queue.writeBuffer(
        verticesBuffer,
        i * vertexStride * verticesPerMesh,
        vertices.buffer,
        vertices.byteOffset,
      );
      // TODO: stop creating groups each frame
      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: modelViewProjectionMatrixBuffer,
              offset: bufferOffset,
            },
          },
        ],
      });
      bindGroups.push(bindGroup);

      const m = voxelObjects[i].transform;
      const vp = mat4.mul(
        mat4.scale(camera.projectionMatrix, [-1, 1, 1]),
        camera.viewMatrix,
      );
      const mvp = new Float32Array(mat4.mul(vp, m));
      device.queue.writeBuffer(
        modelViewProjectionMatrixBuffer,
        bufferOffset,
        mvp.buffer,
        mvp.byteOffset,
        mvp.byteLength,
      );
    }

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpuContext.getCurrentTexture().createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: "load",
          storeOp: "store",
        },
      ],
      timestampWrites,
    });

    passEncoder.setPipeline(pipeline);
    for (let i = 0; i < voxelObjects.length; i++) {
      const bindGroup = bindGroups[i];
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.setVertexBuffer(
        0,
        verticesBuffer,
        vertexStride * verticesPerMesh * i,
        vertexStride * verticesPerMesh,
      );
      passEncoder.draw(verticesPerMesh);
    }

    passEncoder.end();
  };

  return { render, label: "outlines" };
};
