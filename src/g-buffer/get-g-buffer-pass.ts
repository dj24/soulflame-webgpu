import blurWGSL from "./raymarch-voxels.wgsl";
import simpleSkyShader from "../composite/simple-sky.wgsl";
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
import miniViking from "../voxel-models/mini-viking.vxm";
import firTree from "../voxel-models/fir-tree.vxm";
import vikingBoat from "../voxel-models/viking-boat.vxm";
import building from "../voxel-models/building.vxm";
import tower from "../voxel-models/tower.vxm";
import { getFrustumCornerDirections } from "../get-frustum-corner-directions";
import { mat4, vec3, Vec3 } from "wgpu-matrix";

// TODO: make this into more robust type, probably object
type OutputTextureView = [
  finalTexture: GPUTextureView,
  albedoTextureView?: GPUTextureView,
  normalTextureView?: GPUTextureView,
  depthTextureView?: GPUTextureView,
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
    tower.sliceFilePaths,
    tower.size,
  );

  const render = ({
    commandEncoder,
    resolutionBuffer,
    outputTextureViews,
  }: RenderArgs) => {
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
      mat4.translate(m, [translateX + x, y, z], m);
      mat4.translate(m, vec3.divScalar(objectSize, 2), m);
      //mat4.rotateY(m, performance.now() * 0.001, m);
      mat4.scale(m, [scale, scale, scale], m);
      mat4.translate(m, vec3.divScalar(objectSize, -2), m);
      mat4.invert(m, m);
      return new VoxelObject(m, objectSize);
    });
    const activeVoxelObjects = voxelObjects.filter(
      (voxelObject, index) => index < objectCount,
    );
    const bufferPadding = [...Array(maxObjectCount - objectCount).keys()].map(
      () => new VoxelObject(mat4.identity(), [0, 0, 0]),
    );
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
