import blurWGSL from "./shader/raymarch-voxels.wgsl";
import simpleSkyShader from "./shader/simple-sky.wgsl";
import { Vector3 } from "./vector3";
import { createFloatUniformBuffer } from "./buffer-utils";
import { camera, device, resolution, scale, translateX } from "./app";
import { Camera } from "./camera";
import { Matrix4x4 } from "./matrix4x4";

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
          code: `
          ${simpleSkyShader}${blurWGSL}`,
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

    const transformationMatrix = Matrix4x4.identity;

    transformationMatrix.translate(new Vector3(translateX, 0, 0));
    transformationMatrix.scale(Vector3.one.mul(scale));

    const transformationMatrixBuffer = createFloatUniformBuffer(
      transformationMatrix.elements,
      "transformation matrix",
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
        // {
        //   binding: 1,
        //   resource: {
        //     buffer: timeBuffer,
        //   },
        // },
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
      Math.ceil(resolution.x / 8),
      Math.ceil(resolution.y / 8),
    );
    computePass.end();
  };

  return { start, render };
};
