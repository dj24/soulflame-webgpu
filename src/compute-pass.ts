import blurWGSL from "./shader/raymarch-voxels.wgsl";
import simpleSkyShader from "./shader/simple-sky.wgsl";
import { Vector3 } from "./vector3";
import { createFloatUniformBuffer } from "./buffer-utils";
import { camera, device, resolution, scale, translateX } from "./app";
import { Camera } from "./camera";
import { ObjectOrbitControls } from "./object-orbit-controls";
import {Mat4, mat4, Vec3} from "wgpu-matrix";

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

class VoxelObject {
  transform: Mat4;
  size: Vec3;
  constructor(m: Mat4, s: Vec3) {
      this.transform = m;
      this.size = s;
  }

  toArray() {
    return [...this.transform, ...this.size, 0.0]; //padding for 4 byte stride
  }
}

export const createComputePass = (): ComputePass => {
  let computePipeline: GPUComputePipeline;
  let angleY = 0;
  let angleX = 0;

  const orbit = new ObjectOrbitControls();
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

    const chunkSize = 64;

    let m = mat4.identity();
    mat4.translate(m,[translateX, 0, 0], m);
    mat4.translate(m, [chunkSize / 2, chunkSize / 2, chunkSize / 2], m);
    mat4.rotateY(m, performance.now() * 0.0001, m);
    mat4.scale(m, [scale, scale, scale], m);
    mat4.translate(m, [-chunkSize / 2, -chunkSize / 2, -chunkSize / 2], m);
    mat4.invert(m, m);

    let voxelObject = new VoxelObject(m, [chunkSize, chunkSize, chunkSize]);

    document.getElementById("matrix").innerHTML =
        (m as Float32Array).reduce((acc: string, value: number) => {
        return `${acc}<span>${value.toFixed(1)}</span>`;
      }, "");

    const transformationMatrixBuffer = createFloatUniformBuffer(
      [...voxelObject.toArray(), ...voxelObject.toArray()],
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
