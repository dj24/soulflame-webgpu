import { device, RenderArgs } from "../app";
import { BoxRayIntersect } from "../../components/box-ray-intersect";
import raymarchVoxels from "@renderer/shader/raymarch-voxels.wgsl";
import boxIntersection from "@renderer/shader/box-intersection.wgsl";
import bvh from "@renderer/shader/bvh.wgsl";
import boxRayShader from "./box-ray.wgsl";
import { Transform } from "../components/transform";
import { vec3 } from "wgpu-matrix";

const INPUT_STRIDE = 4 * 4 * 4;
const OUTPUT_STRIDE = 6 * 4;

export const getBoxRayIntersectPass = (device: GPUDevice) => {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      // Box ray inputs
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Box ray outputs
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      // Octree buffer
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      // BVH buffer
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
      // Voxel object buffer
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
    ],
  });

  const computePipeline = device.createComputePipeline({
    label: "Box Ray Intersect",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: `
        ${bvh}
        ${boxIntersection}
        ${raymarchVoxels}
        ${boxRayShader}
        `,
      }),
      entryPoint: "main",
    },
  });

  let bindGroup: GPUBindGroup;
  let boxRayInputBuffer: GPUBuffer;
  let boxRayOutputBuffer: GPUBuffer;
  let outputCopyBuffer: GPUBuffer;
  let isMapPending = false;

  const render = (args: RenderArgs) => {
    // Wait for previous mapAsync to finish
    if (isMapPending) {
      return;
    }

    const boxRayEntities = args.ecs.getEntitiesithComponent(BoxRayIntersect);
    let validBoxRayEntities = [];

    for (const entity of boxRayEntities) {
      const components = args.ecs.getComponents(entity);
      const transform = components.get(Transform);
      const boxRayIntersect = components.get(BoxRayIntersect);
      if (!transform || !boxRayIntersect) {
        continue;
      }
      validBoxRayEntities.push(entity);
    }

    if (validBoxRayEntities.length === 0) {
      return;
    }

    const inputArraySize = Math.min(
      validBoxRayEntities.length * INPUT_STRIDE,
      64,
    );
    const outputArraySize = Math.min(
      validBoxRayEntities.length * OUTPUT_STRIDE,
      64,
    );

    if (!boxRayInputBuffer || boxRayInputBuffer.size < inputArraySize) {
      boxRayInputBuffer = device.createBuffer({
        label: "Box Ray Input Buffer",
        size: inputArraySize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }
    if (!boxRayOutputBuffer || boxRayOutputBuffer.size < outputArraySize) {
      boxRayOutputBuffer = device.createBuffer({
        label: "Box Ray Output Buffer",
        size: outputArraySize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
    }
    if (!outputCopyBuffer || outputCopyBuffer.size < outputArraySize) {
      outputCopyBuffer = device.createBuffer({
        label: "Box Ray Output Copy Buffer",
        size: outputArraySize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    }

    // Update input buffer with directions
    validBoxRayEntities.forEach((entity, index) => {
      const components = args.ecs.getComponents(entity);
      const transform = components.get(Transform);
      const rotation = transform.rotation;
      const position = transform.position;
      const up = vec3.transformQuat([0, 1, 0], rotation);
      const right = vec3.transformQuat([1, 0, 0], rotation);
      const forward = vec3.transformQuat([0, 0, 1], rotation);
      const arr = new Float32Array([
        position[0],
        position[1],
        position[2],
        0,
        right[0],
        right[1],
        right[2],
        0,
        up[0],
        up[1],
        up[2],
        0,
        forward[0],
        forward[1],
        forward[2],
      ]);

      console.log(arr.byteLength, index * INPUT_STRIDE);

      device.queue.writeBuffer(boxRayInputBuffer, index * INPUT_STRIDE, arr);
    });

    const bindGroup = device.createBindGroup({
      label: "Box Ray Intersect Bind Group",
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: boxRayInputBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: boxRayOutputBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: args.volumeAtlas.octreeBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: args.bvhBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: args.transformationMatrixBuffer,
          },
        },
      ],
    });

    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass({
      timestampWrites: args.timestampWrites,
    });
    pass.setPipeline(computePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(validBoxRayEntities.length);
    pass.end();
    device.queue.submit([commandEncoder.finish()]);
    const commandEncoder2 = device.createCommandEncoder();
    // Set flag to prevent multiple mapAsync calls
    isMapPending = true;
    commandEncoder2.copyBufferToBuffer(
      boxRayOutputBuffer,
      0,
      outputCopyBuffer,
      0,
      outputArraySize,
    );
    device.queue.submit([commandEncoder2.finish()]);
    device.queue.onSubmittedWorkDone().then(() => {
      outputCopyBuffer.mapAsync(GPUMapMode.READ).finally(() => {
        const arrayBuffer = outputCopyBuffer.getMappedRange();
        const outputArray = new Float32Array(arrayBuffer);
        console.log(outputArray);
        isMapPending = false;
        outputCopyBuffer.unmap();
      });
    });
  };

  return {
    label: "Box Ray Intersect",
    render,
  };
};
