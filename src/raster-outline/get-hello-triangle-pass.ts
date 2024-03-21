import {
  camera,
  debugValues,
  device,
  RenderArgs,
  RenderPass,
  resolution,
} from "../app";
import redFrag from "./red.frag.wgsl";
import triangleVert from "./triangle.vert.wgsl";
import { mat4, Vec3, vec3 } from "wgpu-matrix";
import { voxelObjects } from "../create-tavern";
import raymarchVoxels from "../shader/raymarch-voxels.wgsl";
import boxIntersection from "../shader/box-intersection.wgsl";
import getRayDirection from "../shader/get-ray-direction.wgsl";

export const getRasterOutlinePass = async (): Promise<RenderPass> => {
  const render = () => {};

  return { render, label: "hello triangle" };
};
