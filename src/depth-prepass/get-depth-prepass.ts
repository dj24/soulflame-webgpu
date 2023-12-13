import raymarchDepth from "./raymarch-voxels-depth.wgsl";
import conservativeDepthMin from "./conservative-depth-min.wgsl";
import { createFloatUniformBuffer } from "../buffer-utils";
import {
  camera,
  device,
  debugValues,
  resolution,
} from "../app";
import { VoxelObject } from "../voxel-object";
import { create3dTexture } from "../create-3d-texture";
import tower from "../voxel-models/tower.vxm";
import building from "../voxel-models/building.vxm";
import miniViking from "../voxel-models/mini-viking.vxm";
import { getClipSpaceFrustumCornerDirections } from "../get-frustum-corner-directions";
import { mat4, vec3, Vec3 } from "wgpu-matrix";
import { RenderArgs, RenderPass } from "../g-buffer/get-g-buffer-pass";

const downscaleFactor = 8;

export const getDepthPrepass = async (): Promise<RenderPass> => {
  let voxelObjects: VoxelObject[] = [];
  let downscaledDepthTexture: GPUTexture;

  const createDownscaledDepthTextureView = () => {
    if (downscaledDepthTexture) {
      downscaledDepthTexture.destroy();
    }
    downscaledDepthTexture = device.createTexture({
      size: [
        Math.ceil(resolution[0] / downscaleFactor),
        Math.ceil(resolution[1] / downscaleFactor),
        1,
      ],
      format: "r32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    return downscaledDepthTexture.createView();
  };

  const rayMarchPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: `
          const VOXEL_OBJECT_COUNT = ${debugValues.objectCount};
          ${raymarchDepth}`,
      }),
      entryPoint: "main",
    },
  });

  const depthMinPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({
        code: conservativeDepthMin,
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

    // voxelObjects = getObjectsWorker();

    // 4 byte stride
    const flatMappedDirections = getClipSpaceFrustumCornerDirections(camera).flatMap(
      (direction) => [...direction, 0],
    );
    // TODO: make sure to destroy these buffers or write to them instead
    const frustumCornerDirectionsBuffer = createFloatUniformBuffer(
      device,
      flatMappedDirections,
      "frustum corner directions",
    );
    const cameraPostionBuffer = createFloatUniformBuffer(
      device,
      camera.position as number[],
      "camera position",
    );

    const transformationMatrixBuffer = createFloatUniformBuffer(
      device,
      voxelObjects.flatMap((voxelObject) => voxelObject.toArray()),
      "voxel object",
    );

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(rayMarchPipeline);

    const downscaledDepthTextureView = createDownscaledDepthTextureView();

    // TODO: find way to wait for loading more gracefully
    if (!voxelTexture) {
      computePass.end();
      return;
    }

    const pointSampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
    });

    const computeBindGroup = device.createBindGroup({
      layout: rayMarchPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: downscaledDepthTextureView,
        },
        {
          binding: 1,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: frustumCornerDirectionsBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: cameraPostionBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: transformationMatrixBuffer,
          },
        },
      ],
    });

    // const volumeBindGroup = device.createBindGroup({
    //   layout: rayMarchPipeline.getBindGroupLayout(1),
    //   entries: [
    //     {
    //       binding: 0,
    //       resource: pointSampler,
    //     },
    //     {
    //       binding: 1,
    //       resource: voxelTexture.createView(),
    //     },
    //   ],
    // });
    // computePass.setBindGroup(1, volumeBindGroup);

    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );

    computePass.setPipeline(depthMinPipeline);
    const depthMinBindGroup = device.createBindGroup({
      layout: depthMinPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: downscaledDepthTextureView,
        },
        {
          binding: 1,
          resource: outputTextureViews[3],
        },
        {
          binding: 2,
          resource: {
            buffer: resolutionBuffer,
          },
        },
      ],
    });

    computePass.setBindGroup(0, depthMinBindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(resolution[0] / 8),
      Math.ceil(resolution[1] / 8),
    );

    computePass.end();
  };

  return { render };
};
