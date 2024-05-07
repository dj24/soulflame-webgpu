import { device, gpuContext, RenderArgs, RenderPass } from "../app";
import { OUTPUT_TEXTURE_FORMAT } from "../constants";

const label = "clear";

export const getClearPass = async (): Promise<RenderPass> => {
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
    label: label,
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
  const render = (args: RenderArgs): [GPUCommandBuffer] => {
    const renderPass = args.commandEncoder.beginRenderPass({
      label: label,
      timestampWrites: args.timestampWrites,
      colorAttachments: [
        {
          view: args.outputTextures.finalTexture.view,
          loadOp: "clear",
          clearValue: [0, 0, 0, 0],
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(renderPipeline);
    renderPass.draw(6);
    renderPass.end();
    return [args.commandEncoder.finish()];
  };

  return { render, label: label };
};
