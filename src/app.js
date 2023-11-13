import shaderCode from "./fullscreentexturedquad.wgsl";

class RenderLoop {
    shaderModule;
    device;
    renderPipeline;
    context;
    bindGroup;
    constructor() {
        this.start().then(() => {
            requestAnimationFrame(this.frame.bind(this));
        });
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

        const response = await fetch('./paris.jpg');
        const imageBitmap = await createImageBitmap(await response.blob());

        const {width, height} = imageBitmap;
        const cubeTexture = this.device.createTexture({
            size: [width, width, 1],
            format: 'rgba8unorm',
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: cubeTexture },
            [width, height]
        );

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [{
                binding: 0, // texture sampler
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {},
            }, {
                binding: 1, // model uniform
                visibility: GPUShaderStage.FRAGMENT,
                texture: {},
            }]
        });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                bindGroupLayout, // @group(0)
            ]
        });


        // Create render pipeline
        this.renderPipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
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

        const sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });

        this.bindGroup = this.device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: sampler,
                },
                {
                    binding: 1,
                    resource: cubeTexture.createView(),
                },
            ],
        });
    }
    async frame() {
        const commandEncoder = this.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: [0.3, 0.3, 0.3, 1],
                storeOp: "store"
            }]
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
