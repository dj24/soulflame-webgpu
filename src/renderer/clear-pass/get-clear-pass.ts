import { device, gpuContext, RenderArgs, RenderPass } from "../app";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";
import { GBufferTexture } from "@renderer/abstractions/g-buffer-texture";

export const getClearPass = async (
  gBufferTexture: GBufferTexture,
): Promise<RenderPass> => {
  const fullscreenQuadShaderModule = device.createShaderModule({
    code: `
    struct VertexOutput {
      @builtin(position) position : vec4f,
    }
    @vertex
    fn vertex_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
      var output : VertexOutput;
      return output;
    }
    @fragment
    fn fragment_main(@builtin(position) position : vec4f) -> @location(0) vec4<f32> {
        return vec4(0.0);
    }`,
  });
  const renderPipeline = device.createRenderPipeline({
    label: `clear ${gBufferTexture.label}`,
    layout: "auto",
    vertex: {
      module: fullscreenQuadShaderModule,
      entryPoint: "vertex_main",
    },
    fragment: {
      module: fullscreenQuadShaderModule,
      entryPoint: "fragment_main",
      targets: [{ format: gBufferTexture.format }],
    },
  });
  const render = (args: RenderArgs) => {
    const renderPass = args.commandEncoder.beginRenderPass({
      label: `clear ${gBufferTexture.label}`,
      timestampWrites: args.timestampWrites,
      colorAttachments: [
        {
          view: gBufferTexture.view,
          loadOp: "clear",
          clearValue: [0, 0, 0, 0],
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(renderPipeline);
    renderPass.draw(6);
    renderPass.end();
  };

  return { render, label: `clear ${gBufferTexture.label}` };
};
