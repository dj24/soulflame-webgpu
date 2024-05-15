import { device, RenderArgs, RenderPass } from "../app";
import { importCubeLut } from "./import-cube-lut";

export const getLutPass = async (): Promise<RenderPass> => {
  await importCubeLut(device, "luts/Fusion 88.CUBE");

  const render = (args: RenderArgs) => {
    const commandEncoder = device.createCommandEncoder();
    return [commandEncoder.finish()];
  };

  return {
    render,
    label: "LUT",
  };
};
