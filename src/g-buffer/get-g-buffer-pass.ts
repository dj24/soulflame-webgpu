import blurWGSL from "./raymarch-voxels.wgsl";
import simpleSkyShader from "../composite/simple-sky.wgsl";
import { createFloatUniformBuffer } from "../buffer-utils";
import {
  camera,
  device,
  objectCount,
  resolution,
} from "../app";
import { VoxelObject } from "../voxel-object";
import { create3dTexture } from "../create-3d-texture";
import miniViking from "../voxel-models/mini-viking.vxm";
import firTree from "../voxel-models/fir-tree.vxm";
import vikingBoat from "../voxel-models/viking-boat.vxm";
import building from "../voxel-models/building.vxm";
import tower from "../voxel-models/tower.vxm";
import { getFrustumCornerDirections } from "../get-frustum-corner-directions";
import { mat4, vec3, Vec3 } from "wgpu-matrix";
import { isInsideFrustum } from "../is-inside-frustum";
import {getObjects} from "../get-objects";

// TODO: make this into more robust type, probably object
type OutputTextureView = [
  finalTexture: GPUTextureView,
  albedoTextureView?: GPUTextureView,
  normalTextureView?: GPUTextureView,
  depthTextureView?: GPUTextureView,
  debugTextureView?: GPUTextureView,
];

export type RenderArgs = {
  commandEncoder: GPUCommandEncoder;
  resolutionBuffer: GPUBuffer;
  outputTextureViews: OutputTextureView;
};

export type RenderPass = {
  fixedUpdate?: () => void;
  render: (args: RenderArgs) => void;
};

export const getGBufferPass = async (): Promise<RenderPass> => {
  let voxelObjects: VoxelObject[] = [];
  let transformationMatrixBuffer: GPUBuffer;
  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: `
          ${simpleSkyShader}
          const VOXEL_OBJECT_COUNT = ${objectCount};
          ${blurWGSL}`,
      }),
      entryPoint: "main",
    },
  });
  const voxelTexture = await create3dTexture(
    device,
    miniViking.sliceFilePaths,
    miniViking.size,
  );




  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextureViews,
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

    voxelObjects  = getObjects();

    transformationMatrixBuffer = createFloatUniformBuffer(
      voxelObjects.flatMap((voxelObject) => voxelObject.toArray()),
      "voxel object",
    );

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);

    const pointSampler = device.createSampler({
      magFilter: "nearest", // Nearest-neighbor interpolation for magnification
      minFilter: "nearest", // Nearest-neighbor interpolation for minification
    });

    const computeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: outputTextureViews[0],
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
        {
          binding: 6,
          resource: outputTextureViews[1],
        },
        {
          binding: 7,
          resource: outputTextureViews[2],
        },
        {
          binding: 8,
          resource: outputTextureViews[3],
        },
        {
          binding: 9,
          resource: outputTextureViews[4],
        },
      ],

    });

    // TODO: find way to wait for loading more gracefully
    if (!voxelTexture) {
      computePass.end();
      return;
    }

    const volumeBindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(1),
      entries: [
        {
          binding: 0,
          resource: pointSampler,
        },
        {
          binding: 1,
          resource: voxelTexture.createView(),
        },
      ],
    });

    computePass.setBindGroup(0, computeBindGroup);
    computePass.setBindGroup(1, volumeBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );
    computePass.end();
  };

  return { render };
};
