// We use webpack to package our shaders as string resources that we can import
import shaderCode from "./triangle.wgsl";

const renderLoop = async () => {
    if (navigator.gpu === undefined) {
        return;
    }

    // Get a GPU device to render with
    var adapter = await navigator.gpu.requestAdapter();
    var device = await adapter.requestDevice();

    // Get a context to display our rendered image on the canvas
    var canvas = document.getElementById("webgpu-canvas");
    var context = canvas.getContext("webgpu");

    // Setup shader modules
    var shaderModule = device.createShaderModule({code: shaderCode});
    
    // Handle compilation errors
    var compilationInfo = await shaderModule.getCompilationInfo();
    if (compilationInfo.messages.length > 0) {
        var hadError = false;
        console.log("Shader compilation log:");
        for (var i = 0; i < compilationInfo.messages.length; ++i) {
            var msg = compilationInfo.messages[i];
            console.log(`${msg.lineNum}:${msg.linePos} - ${msg.message}`);
            hadError = hadError || msg.type == "error";
        }
        if (hadError) {
            console.log("Shader failed to compile");
            return;
        }
    }

    // Specify vertex data
    // Allocate room for the vertex data: 3 vertices, each with 2 float4's
    var dataBuf = device.createBuffer(
        {size: 6 * 2 * 4 * 4, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true});

    // Interleaved positions and colors
    new Float32Array(dataBuf.getMappedRange()).set([
        -1, -1, 0, 1,  // position
        1, 0, 0, 1,  // color
        -1, 1, 0, 1,  // position
        1, 0, 0, 1,  // color
        1, 1, 0, 1,  // position
        1, 0, 0, 1,  // color

        -1, -1, 0, 1,  // position
        0, 1, 0, 1,  // color
        1, 1, 0, 1,  // position
        0, 1, 0, 1,  // color
        1, -1, 0, 1,  // position
        0, 1, 0, 1,  // color
    ]);
    dataBuf.unmap();
    
    // Setup render outputs
    var swapChainFormat = "bgra8unorm";
    context.configure(
        {device: device, format: swapChainFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT});

    // Create render pipeline
    var renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: "vertex_main",
            // Vertex buffer info
            buffers: [{
                arrayStride: 2 * 4 * 4,
                attributes: [
                    {format: "float32x4", offset: 0, shaderLocation: 0},
                    {format: "float32x4", offset: 4 * 4, shaderLocation: 1}
                ]
            }]
        },
        fragment: {
            module: shaderModule,
            entryPoint: "fragment_main",
            targets: [{format: swapChainFormat}]
        },
    });

    var renderPassDesc = {
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: [0.3, 0.3, 0.3, 1],
            storeOp: "store"
        }]
    };

    var animationFrame = function () {
        var resolve = null;
        var promise = new Promise(r => resolve = r);
        window.requestAnimationFrame(resolve);
        return promise
    };
    requestAnimationFrame(animationFrame);

    // Render!
    while (true) {
        await animationFrame();
        const commandEncoder = device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass(renderPassDesc);
        renderPass.setPipeline(renderPipeline);
        renderPass.setVertexBuffer(0, dataBuf);
        renderPass.draw(6);
        renderPass.end();
        device.queue.submit([commandEncoder.finish()]);
    }
};

renderLoop();
