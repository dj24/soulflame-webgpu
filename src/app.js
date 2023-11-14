import shaderCode from "./fullscreentexturedquad.wgsl";
import blurWGSL from "./blur.wgsl";

class RenderLoop {
    shaderModule;
    device;
    renderPipeline;
    computePipeline;
    context;
    bindGroup;
    computeBindGroup;
    outputTextureView;
    constructor() {
        this.start().then(() => {
            requestAnimationFrame(this.frame.bind(this));
        });
    }

    get timeBuffer() {
        const timeBuffer = this.device.createBuffer({
            size: 4,
            mappedAtCreation: true,
            usage: GPUBufferUsage.UNIFORM,
        });
        new Uint32Array(timeBuffer.getMappedRange())[0] = new Date().getTime();
        timeBuffer.unmap();
        return timeBuffer;
    }

    async start(){
        if (navigator.gpu === undefined) {
            throw new Error('WebGPU not supported');
        }
        // Get a GPU device to render with
        var adapter = await navigator.gpu.requestAdapter();
        this.device = await adapter.requestDevice();

        this.shaderModule = this.device.createShaderModule({code: shaderCode});

        // Handle compilation errors
        var compilationInfo = await this.shaderModule.getCompilationInfo();
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

        // Get a context to display our rendered image on the canvas
        var canvas = document.getElementById("webgpu-canvas");
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        this.context = canvas.getContext("webgpu");

        // Setup render outputs
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure(
            {device: this.device, format: presentationFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT});


        // Create compute pipeline
        this.computePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({
                    code: blurWGSL,
                }),
                entryPoint: 'main',
            },
        });

        // Create render pipeline
        this.renderPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: this.shaderModule,
                entryPoint: "vertex_main",
            },
            fragment: {
                module: this.shaderModule,
                entryPoint: "fragment_main",
                targets: [{format: presentationFormat}]
            },
        });

        const outputTexture = this.device.createTexture({
            size: [512, 512, 1],
            format: 'rgba8unorm',
            usage:
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.RENDER_ATTACHMENT |
              GPUTextureUsage.STORAGE_BINDING
        });

        this.outputTextureView = outputTexture.createView();

    }
     async frame() {
        const commandEncoder = this.device.createCommandEncoder();

        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);


        this.computeBindGroup = this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: this.outputTextureView,
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.timeBuffer
                    }
                }
            ],
        });
        computePass.setBindGroup(0, this.computeBindGroup);
        computePass.dispatchWorkgroups(
            64,
            64
        );
        computePass.end();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3, 0.3, 0.3, 1],
                storeOp: "store"
            }]
        });

         this.bindGroup = this.device.createBindGroup({
             layout: this.renderPipeline.getBindGroupLayout(0),
             entries: [
                 {
                     binding: 0,
                     resource: this.device.createSampler({
                         magFilter: 'linear',
                         minFilter: 'linear',
                     }),
                 },
                 {
                     binding: 1,
                     resource: this.outputTextureView,
                 },
                 {
                     binding: 2,
                     resource: {
                         buffer: this.timeBuffer
                     }
                 }
             ],
         });

        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.draw(6);
        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(this.frame.bind(this));
    };
}

new RenderLoop();
