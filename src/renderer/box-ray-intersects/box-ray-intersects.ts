import { device, RenderArgs } from "../app";
import { BoxRayIntersect } from "../../components/box-ray-intersect";
import raymarchVoxels from "@renderer/shader/raymarch-voxels.wgsl";
import boxIntersection from "@renderer/shader/box-intersection.wgsl";
import bvh from "@renderer/shader/bvh.wgsl";
import boxRayShader from "./box-ray.wgsl";
import { Transform } from "../components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { PitchYaw } from "../../xmas-game-jam-2024/components/pitch-yaw";

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
          type: "read-only-storage",
        },
      },
      // BVH buffer
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
        },
      },
      // Voxel object buffer
      {
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "read-only-storage",
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
    let validBoxRayEntities: number[] = [];

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
      const pitchYaw = components.get(PitchYaw);
      const rotation = quat.fromEuler(0, pitchYaw.yaw, 0, "xyz");
      const up = [0, 1, 0];
      const right = vec3.transformQuat([1, 0, 0], rotation);
      const forward = vec3.transformQuat([0, 0, 1], rotation);
      const arr = new Float32Array([
        transform.position[0],
        transform.position[1],
        transform.position[2],
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
        validBoxRayEntities.forEach((entity, index) => {
          const components = args.ecs.getComponents(entity);
          const boxRayIntersect = components.get(BoxRayIntersect);
          if (!boxRayIntersect) {
            return;
          }
          const offset = index * OUTPUT_STRIDE;
          boxRayIntersect.top = outputArray[offset];
          boxRayIntersect.bottom = outputArray[offset + 1];
          boxRayIntersect.left = outputArray[offset + 2];
          boxRayIntersect.right = outputArray[offset + 3];
          boxRayIntersect.front = outputArray[offset + 4];
          boxRayIntersect.back = outputArray[offset + 5];
        });
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
