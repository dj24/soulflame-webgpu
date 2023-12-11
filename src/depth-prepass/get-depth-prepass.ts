import raymarchDepth from "./raymarch-voxels-depth.wgsl";
import conservativeDepthMin from "./conservative-depth-min.wgsl";
import { createFloatUniformBuffer } from "../buffer-utils";
import {
  camera,
  device,
  maxObjectCount,
  objectCount,
  resolution,
  scale,
  translateX,
} from "../app";
import { VoxelObject } from "../voxel-object";
import { create3dTexture } from "../create-3d-texture";
import tower from "../voxel-models/tower.vxm";
import { getFrustumCornerDirections } from "../get-frustum-corner-directions";
import { mat4, vec3, Vec3 } from "wgpu-matrix";
import { RenderArgs, RenderPass } from "../g-buffer/get-g-buffer-pass";

const downscaleFactor = 4;

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
          const VOXEL_OBJECT_COUNT = ${objectCount};
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
    tower.sliceFilePaths,
    tower.size,
  );

  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextureViews,
  }: RenderArgs) => {
    // TODO: abstract these objects somewhere else
    const objectSize = tower.size as Vec3;
    const spaceBetweenObjects = 2;
    const gapX = objectSize[0] + spaceBetweenObjects;
    const gapZ = objectSize[2] + spaceBetweenObjects;
    const rows = 24;
    voxelObjects = [...Array(maxObjectCount).keys()].map((index) => {
      let m = mat4.identity();
      let x = (index % rows) * gapX;
      let y = (Math.sin(performance.now() * 0.001 + x * 0.02) * 0.5 + 0.5) * 20;
      y = 0;
      let z = Math.floor(index / rows) * gapZ;
      let height =
        Math.sin(performance.now() * 0.0005 + x * 0.008 + z * 0.016) * 0.5 +
        0.5;
      height = Math.max(height, 0.01);
      mat4.translate(m, [translateX + x, y, z], m);
      mat4.translate(m, vec3.divScalar(objectSize, 2), m);
      //mat4.rotateY(m, performance.now() * 0.001, m);
      mat4.scale(m, [scale, height, scale], m);
      mat4.translate(m, vec3.divScalar(objectSize, -2), m);
      mat4.invert(m, m);
      return new VoxelObject(m, objectSize);
    });
    // sort by distance to the camera
    voxelObjects = voxelObjects.sort((a, b) => {
      const aDistance = vec3.distance(a.worldSpaceCenter, camera.position);
      const bDistance = vec3.distance(b.worldSpaceCenter, camera.position);
      return bDistance - aDistance;
    });

    let activeVoxelObjects = voxelObjects;

    // activeVoxelObjects = voxelObjects.filter(
    //   (voxelObject, index) =>
    //     !isInsideFrustum({
    //       viewProjectionMatrix: camera.viewProjectionMatrix,
    //       voxelObject,
    //     }),
    // );

    activeVoxelObjects = activeVoxelObjects.slice(0, objectCount);

    const bufferPadding = [
      ...Array(maxObjectCount - activeVoxelObjects.length).keys(),
    ].map(() => new VoxelObject(mat4.identity(), [0, 0, 0]));
    voxelObjects = [...activeVoxelObjects, ...bufferPadding];

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

    const volumeBindGroup = device.createBindGroup({
      layout: rayMarchPipeline.getBindGroupLayout(1),
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
