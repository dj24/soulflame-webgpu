import blurWGSL from "./shader/raymarch-voxels.wgsl";
import simpleSkyShader from "./shader/simple-sky.wgsl";
import { Vector3 } from "./vector3";
import { createFloatUniformBuffer } from "./buffer-utils";
import { camera, device, resolution } from "./app";
import { Camera } from "./camera";
import { VoxelObject } from "./voxel-object";

const getFrustumCornerDirections = (camera: Camera) => {
  const aspectRatio = resolution[0] / resolution[1];
  const halfFov = camera.fieldOfView / 2;
  const tanHalfFov = Math.tan(halfFov);
  const right = Vector3.up.cross(camera.direction).normalize();
  const up = camera.direction.cross(right).normalize();
  const upwardDisplacement = up.mul(tanHalfFov);

  const topLeft = camera.direction
    .add(upwardDisplacement)
    .add(right.mul(-aspectRatio * tanHalfFov));
  const topRight = camera.direction
    .add(upwardDisplacement)
    .add(right.mul(aspectRatio * tanHalfFov));
  const bottomLeft = camera.direction
    .subtract(upwardDisplacement)
    .add(right.mul(-aspectRatio * tanHalfFov));
  const bottomRight = camera.direction
    .subtract(upwardDisplacement)
    .add(right.mul(aspectRatio * tanHalfFov));

  return [topLeft, topRight, bottomLeft, bottomRight];
};

type RenderArgs = {
  commandEncoder: GPUCommandEncoder;
  resolutionBuffer: GPUBuffer;
  outputTextureView: GPUTextureView;
  voxelObjects: VoxelObject[];
};

export type ComputePass = {
  start: () => void;
  render: (args: RenderArgs) => void;
};

export const createComputePass = (): ComputePass => {
  let computePipeline: GPUComputePipeline;
  const start = () => {
    computePipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          code: `
          ${simpleSkyShader}${blurWGSL}`,
        }),
        entryPoint: "main",
      },
    });
  };
  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextureView,
    voxelObjects,
  }: RenderArgs) => {
    const flatMappedDirections = getFrustumCornerDirections(camera).flatMap(
      (direction) => [...direction.toArray(), 0],
    );
    // TODO: make sure to destroy these buffers or write to them instead
    const frustumCornerDirectionsBuffer = createFloatUniformBuffer(
      flatMappedDirections,
      "frustum corner directions",
    );
    const cameraPostionBuffer = createFloatUniformBuffer(
      camera.position.toArray(),
      "camera position",
    );

    const transformationMatrixBuffer = createFloatUniformBuffer(
      voxelObjects.flatMap((voxelObject) => voxelObject.toArray()),
      "voxel object",
    );

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    const computeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: outputTextureView,
        },
        {
          binding: 2,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: frustumCornerDirectionsBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: cameraPostionBuffer,
          },
        },
        {
          binding: 5,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
      ],
    });
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );
    computePass.end();
  };

  return { start, render };
};
