import shaderCode from "./fullscreentexturedquad.wgsl";
import blurWGSL from "./blur.wgsl";

const startTime = performance.now();

const handleErrors = async (shaderModule) => {
    const compilationInfo = await shaderModule.getCompilationInfo();
    if (compilationInfo.messages.length > 0) {
        var hadError = false;
        console.log("Shader compilation log:");
        for (var i = 0; i < compilationInfo.messages.length; ++i) {
            var msg = compilationInfo.messages[i];
            console.log(`${msg.lineNum}:${msg.linePos} - ${msg.message}`);
            hadError = hadError || msg.type == "error";
        }
        if (hadError) {
            throw new Error("Shader failed to compile");
        }
    }
}

const createComputePass = (device) => {
    let computePipeline;
    const start = () => {
        computePipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: device.createShaderModule({
                    code: blurWGSL,
                }),
                entryPoint: 'main',
            },
        });
    }
    const render = ({commandEncoder, timeBuffer, outputTextureView}) => {
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        const computeBindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: outputTextureView,
                },
                {
                    binding: 1,
                    resource: {
                        buffer: timeBuffer
                    }
                }
            ],
        });
        computePass.setBindGroup(0, computeBindGroup);
        computePass.dispatchWorkgroups(
            128,
            128
        );
        computePass.end();
    }
    
    return { start, render }
}

const renderLoop = (device, computePasses) => {
    let bindGroup;
    let outputTextureView;
    let animationFrameId;

    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({device: device, format: presentationFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT});
    const shaderModule = device.createShaderModule({code: shaderCode});
    
    handleErrors(shaderModule);
    
    const renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: "vertex_main",
        },
        fragment: {
            module: shaderModule,
            entryPoint: "fragment_main",
            targets: [{format: presentationFormat}]
        },
    });
    const start = () => {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        
        computePasses.forEach(computePass => {
            computePass.start();
        })
        
        const outputTexture = device.createTexture({
            size: [canvas.width, canvas.height, 1],
            format: 'rgba8unorm',
            usage:
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.RENDER_ATTACHMENT |
              GPUTextureUsage.STORAGE_BINDING
        });

        outputTextureView = outputTexture.createView();
        animationFrameId = requestAnimationFrame(frame);
    }
     const frame = async () => {
        const commandEncoder = device.createCommandEncoder();
        const timeBuffer = device.createBuffer({
             size: 4,
             mappedAtCreation: true,
             usage: GPUBufferUsage.UNIFORM,
        });
        new Uint32Array(timeBuffer.getMappedRange())[0] = performance.now() - startTime;
        timeBuffer.unmap();
        
        computePasses.forEach(computePass => {
            computePass.render({commandEncoder, timeBuffer, outputTextureView});
        })
        
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3, 0.3, 0.3, 1],
                storeOp: "store"
            }]
        });

         bindGroup = device.createBindGroup({
             layout: renderPipeline.getBindGroupLayout(0),
             entries: [
                 {
                     binding: 0,
                     resource: device.createSampler({
                         magFilter: 'linear',
                         minFilter: 'linear',
                     }),
                 },
                 {
                     binding: 1,
                     resource: outputTextureView,
                 },
             ],
         });
        renderPass.setPipeline(renderPipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.draw(6);
        renderPass.end();
        device.queue.submit([commandEncoder.finish()]);
        animationFrameId = requestAnimationFrame(frame);
    };
    
    const resizeObserver = new ResizeObserver((entries) => {
        cancelAnimationFrame(animationFrameId);
        start();
    });
    resizeObserver.observe(canvas.parentElement)
}

if (navigator.gpu !== undefined) {
    navigator.gpu.requestAdapter().then(adapter => {
        adapter.requestDevice().then(device => {
            const computePass = createComputePass(device);
            renderLoop(device, [computePass]);
        })
    })
} else{
   console.error('WebGPU not supported');
}

