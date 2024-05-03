import { OutputTextures } from "../g-buffer/get-g-buffer-pass";
import { Light } from "../lights-pass/get-lights-pass";
import { VolumeAtlas } from "../volume-atlas";

export type RenderArgs = {
  enabled?: boolean;
  commandEncoder: GPUCommandEncoder;
  resolutionBuffer: GPUBuffer;
  outputTextures: OutputTextures;
  cameraPositionBuffer: GPUBuffer;
  transformationMatrixBuffer: GPUBuffer;
  timeBuffer: GPUBuffer;
  viewProjectionMatricesBuffer?: GPUBuffer;
  timestampWrites?: GPUComputePassTimestampWrites;
  sunDirectionBuffer?: GPUBuffer;
  blueNoiseTexture?: GPUTexture;
  bvhBuffer: GPUBuffer;
  lights: Light[];
  volumeAtlas: VolumeAtlas;
};

export type RenderPass = {
  render: (args: RenderArgs) => GPUCommandBuffer[];
  label?: string;
};

/**
 * Maintain a list of all render passes and render them all.
 * Functions not classes
 */
export namespace RenderPass {
  const instances: RenderPass[] = [];

  export const renderAll = (args: RenderArgs) => {
    for (const instance of instances) {
      instance.render(args);
    }
  };

  export const register = (target: any) => {
    instances.push(target);
  };
}
