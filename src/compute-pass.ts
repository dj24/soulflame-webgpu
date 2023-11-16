import blurWGSL from "./blur.wgsl";
import { Vector3 } from "./vector3";
import { createFloatUniformBuffer } from "./buffer-utils";
import { camera, device, resolution } from "./app";
import { Camera } from "./camera";

const getFrustumCornerDirections = (camera: Camera) => {
  const aspectRatio = resolution.x / resolution.y;
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
  timeBuffer: GPUBuffer;
  resolutionBuffer: GPUBuffer;
  outputTextureView: GPUTextureView;
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
          code: blurWGSL,
        }),
        entryPoint: "main",
      },
    });
  };
  const render = ({
    commandEncoder,
    timeBuffer,
    resolutionBuffer,
    outputTextureView,
  }: RenderArgs) => {
    const flatMappedDirections = getFrustumCornerDirections(camera).flatMap(
      (direction) => direction.toArray(),
    );
    const frustumCornerDirectionsBuffer = createFloatUniformBuffer(
      flatMappedDirections,
      "frustum corner directions",
    );
    const cameraPostionBuffer = createFloatUniformBuffer(
      camera.position.toArray(),
      "camera position",
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
          binding: 1,
          resource: {
            buffer: timeBuffer,
          },
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
      ],
    });
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(resolution.x, resolution.y);
    computePass.end();
  };

  return { start, render };
};
