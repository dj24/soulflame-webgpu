import blurWGSL from "./shader/raymarch-voxels.wgsl";
import simpleSkyShader from "./shader/simple-sky.wgsl";
import { createFloatUniformBuffer } from "./buffer-utils";
import { camera, device, resolution } from "./app";
import { Camera } from "./camera";
import { VoxelObject } from "./voxel-object";
import { vec3 } from "wgpu-matrix";
import { create3dTexture } from "./create-3d-texture";

const getFrustumCornerDirections = (camera: Camera) => {
  const aspectRatio = resolution[0] / resolution[1];
  const halfFov = camera.fieldOfView / 2;
  const tanHalfFov = Math.tan(halfFov);
  const right = vec3.normalize(
    vec3.cross(vec3.create(0, 1, 0), camera.direction),
  );
  const up = vec3.normalize(vec3.cross(camera.direction, right));
  const upwardDisplacement = vec3.mulScalar(up, tanHalfFov);

  const topLeft = vec3.add(
    vec3.add(camera.direction, upwardDisplacement),
    vec3.mulScalar(right, -aspectRatio * tanHalfFov),
  );
  const topRight = vec3.add(
    vec3.add(camera.direction, upwardDisplacement),
    vec3.mulScalar(right, aspectRatio * tanHalfFov),
  );
  const bottomLeft = vec3.add(
    vec3.subtract(camera.direction, upwardDisplacement),
    vec3.mulScalar(right, -aspectRatio * tanHalfFov),
  );
  const bottomRight = vec3.add(
    vec3.subtract(camera.direction, upwardDisplacement),
    vec3.mulScalar(right, aspectRatio * tanHalfFov),
  );
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

const getTextureSlices = async (folderPath: string) => {
  const slices = [];
  let sliceIndex = 0;
  while (true) {
    try {
      const response = await fetch(`${folderPath}/${sliceIndex}.png`);
      if (response.ok) {
        slices.push(`${folderPath}/${sliceIndex}.png`);
      } else {
        break;
      }
    } catch (e) {
      break;
    }
    sliceIndex++;
  }
  return slices;
};

export const createComputePass = (): ComputePass => {
  let voxelTexture: GPUTexture;

  let computePipeline: GPUComputePipeline;
  const start = async () => {
    // voxelTexture = await create3dTexture(
    //   device,
    //   await getTextureSlices("./voxel-models/mini-viking"),
    // );
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
    // 4 byte stride
    const flatMappedDirections = getFrustumCornerDirections(camera).flatMap(
      (direction) => [...direction, 0],
    );
    // TODO: make sure to destroy these buffers or write to them instead
    const frustumCornerDirectionsBuffer = createFloatUniformBuffer(
      flatMappedDirections,
      "frustum corner directions",
    );
    const cameraPostionBuffer = createFloatUniformBuffer(
      camera.position as number[],
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
