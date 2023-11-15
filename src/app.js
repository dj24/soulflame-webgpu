import shaderCode from "./fullscreentexturedquad.wgsl";
import blurWGSL from "./blur.wgsl";

class Vector2 {
    x;
    y;
    constructor(x,y) {
        this.x = x;
        this.y = y;
    }
}
 
let device;
let resolution = new Vector2(0,0);
const startTime = performance.now();

const createComputePass = () => {
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
    const render = ({commandEncoder, timeBuffer, resolutionBuffer, outputTextureView}) => {
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
                },
                {
                    binding: 2,
                    resource: {
                        buffer: resolutionBuffer
                    }
                }
            ],
        });
        computePass.setBindGroup(0, computeBindGroup);
        computePass.dispatchWorkgroups(
            resolution.x,
            resolution.y
        );
        computePass.end();
    }
    
    return { start, render }
}

const renderLoop = (device, computePasses) => {
    let bindGroup;
    let outputTexture;
    let animationFrameId;

    const canvas = document.getElementById("webgpu-canvas");
    const context = canvas.getContext("webgpu");
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({device: device, format: presentationFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT});
    const shaderModule = device.createShaderModule({code: shaderCode});
    
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
        const { clientWidth, clientHeight} = canvas.parentElement;
        resolution = new Vector2(clientWidth, clientHeight);
        canvas.width = resolution.x;
        canvas.height = resolution.y;
        
        
        computePasses.forEach(computePass => {
            computePass.start();
        })
        
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

         const resolutionBuffer = device.createBuffer({
             size: 8,
             mappedAtCreation: true,
             usage: GPUBufferUsage.UNIFORM,
         });
         const foo = new Uint32Array(resolutionBuffer.getMappedRange());
         foo[0] = resolution.x;
         foo[1] = resolution.y;
         resolutionBuffer.unmap();
         
         outputTexture = device.createTexture({
             size: [resolution.x, resolution.y, 1],
             format: 'rgba8unorm',
             usage:
                 GPUTextureUsage.TEXTURE_BINDING |
                 GPUTextureUsage.RENDER_ATTACHMENT |
                 GPUTextureUsage.STORAGE_BINDING
         });
        const outputTextureView = outputTexture.createView();
        
        computePasses.forEach(computePass => {
            computePass.render({commandEncoder, timeBuffer, resolutionBuffer, outputTextureView});
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
    
    const resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(animationFrameId);
        start();
    });
    resizeObserver.observe(canvas.parentElement)
}

if (navigator.gpu !== undefined) {
    navigator.gpu.requestAdapter().then(adapter => {
        adapter.requestDevice().then(newDevice => {
            device = newDevice;
            const computePass = createComputePass();
            renderLoop(device, [computePass]);
        })
    })
} else{
   console.error('WebGPU not supported');
}

