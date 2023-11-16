import blurWGSL from "./blur.wgsl";
import { Vector3 } from "./vector3";
import { createFloatUniformBuffer } from "./buffer-utils";
import { device, resolution } from "./app";

const getFrustumCornerDirections = (fov, cameraDirection) => {
  const aspectRatio = resolution.x / resolution.y;
  const halfFov = fov / 2;
  const tanHalfFov = Math.tan(halfFov);

  const right = Vector3.up.cross(cameraDirection).normalize();
  const up = cameraDirection.cross(right).normalize();
  const upwardDisplacement = up.mul(tanHalfFov);

  const topLeft = cameraDirection
    .add(upwardDisplacement)
    .add(right.mul(-aspectRatio * tanHalfFov))
    .normalize();
  const topRight = cameraDirection
    .add(upwardDisplacement)
    .add(right.mul(aspectRatio * tanHalfFov))
    .normalize();
  const bottomLeft = cameraDirection
    .subtract(upwardDisplacement)
    .add(right.mul(-aspectRatio * tanHalfFov))
    .normalize();
  const bottomRight = cameraDirection
    .subtract(upwardDisplacement)
    .add(right.mul(aspectRatio * tanHalfFov))
    .normalize();

  return [topLeft, topRight, bottomLeft, bottomRight];
};

export const createComputePass = () => {
  let computePipeline;
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
  }) => {
    const cameraDirection = new Vector3(0, 0, 1);
    const flatMappedDirections = getFrustumCornerDirections(
      70,
      cameraDirection,
    ).flatMap((direction) => direction.toArray());
    const frustumCornerDirectionsBuffer = createFloatUniformBuffer(
      flatMappedDirections,
      "frustum corner directions",
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
      ],
    });
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(resolution.x, resolution.y);
    computePass.end();
  };

  return { start, render };
};
