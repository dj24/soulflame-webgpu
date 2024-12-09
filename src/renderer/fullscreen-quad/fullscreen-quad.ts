import { gpuContext, RenderArgs, RenderPass } from "../app";
import fullscreenQuadShader from "./fullscreentexturedquad.wgsl";
import { OUTPUT_TEXTURE_FORMAT } from "@renderer/constants";

let obj = { outputTexture: "Final" };
export const fullscreenQuad = async (
  device: GPUDevice,
): Promise<RenderPass> => {
  (window as any).debugUI.gui.add(obj, "outputTexture", [
    "Final",
    "Normals",
    "Albedo",
    "Position",
    "Depth",
  ]);

  const fullscreenQuadShaderModule = device.createShaderModule({
    code: fullscreenQuadShader,
  });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: fullscreenQuadShaderModule,
      entryPoint: "vertex_main",
    },
    fragment: {
      module: fullscreenQuadShaderModule,
      entryPoint: "fragment_main",
      targets: [{ format: OUTPUT_TEXTURE_FORMAT }],
    },
  });
  const render = (args: RenderArgs) => {
    const renderPass = args.commandEncoder.beginRenderPass({
      timestampWrites: args.timestampWrites,
      colorAttachments: [
        {
          view: gpuContext.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: [0.3, 0.3, 0.3, 1],
          storeOp: "store",
        },
      ],
    });

    const getTexture = (name: string) => {
      switch (name) {
        case "Final":
          return args.outputTextures.finalTexture.view;
        case "Normals":
          return args.outputTextures.normalTexture.view;
        case "Albedo":
          return args.outputTextures.albedoTexture.view;
        case "Position":
          return args.outputTextures.worldPositionTexture.view;
        case "Depth":
          return args.outputTextures.depthTexture.view;
      }
    };

    const bindGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 1,
          resource: getTexture(obj.outputTexture),
        },
      ],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6);
    renderPass.end();
  };

  return { render, label: "fullscreen quad" };
};
