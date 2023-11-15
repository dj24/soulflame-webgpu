import shaderCode from "./fullscreentexturedquad.wgsl";
import blurWGSL from "./blur.wgsl";

const createUniformBuffer = (items, label) => {
  const uintArray = new Uint32Array(items);
  const buffer = device.createBuffer({
    size: uintArray.byteLength, // TODO: figure out why this needs to be 64
    mappedAtCreation: true,
    usage: GPUBufferUsage.UNIFORM,
    label,
  });
  const mappedRange = new Uint32Array(buffer.getMappedRange());
  items.forEach((item, index) => {
    mappedRange[index] = item;
  });
  buffer.unmap();
  return buffer;
};

const createFloatUniformBuffer = (items, label) => {
  const floatArray = new Float32Array(items);
  const buffer = device.createBuffer({
    size: Math.max(64, floatArray.byteLength), // TODO: figure out why this needs to be 64
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    buffer,
    0, // offset
    floatArray.buffer,
    0, // data offset
    items.length * Float32Array.BYTES_PER_ELEMENT,
  );
  return buffer;
};

class Vector2 {
  x;
  y;
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  get uniformBuffer() {
    return createUniformBuffer([this.x, this.y]);
  }

  static zero = new Vector2(0, 0);
  static one = new Vector2(0, 0);

  toArray() {
    return [this.x, this.y];
  }
}

class Vector3 {
  x;
  y;
  z;
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  get uniformBuffer() {
    return createUniformBuffer([this.x, this.y, this.z]);
  }

  static zero = new Vector3(0, 0, 0);
  static one = new Vector3(0, 0, 0);

  toArray() {
    return [this.x, this.y, this.z];
  }
}

let device;
let resolution = new Vector2(0, 0);
const startTime = performance.now();

const getFrustumCornerDirections = (camPos, fov) => {
  const aspectRatio = resolution.x / resolution.y;

  // Calculate half-height and half-width of the near plane
  const halfHeight = Math.tan((fov / 2) * (Math.PI / 180));
  const halfWidth = aspectRatio * halfHeight;

  // Calculate directions to the corners of the near plane
  const topLeft = new Vector3(
    camPos.x - halfWidth,
    camPos.y + halfHeight,
    camPos.z - 1,
  );
  const topRight = new Vector3(
    camPos.x + halfWidth,
    camPos.y + halfHeight,
    camPos.z - 1,
  );
  const bottomLeft = new Vector3(
    camPos.x - halfWidth,
    camPos.y - halfHeight,
    camPos.z - 1,
  );
  const bottomRight = new Vector3(
    camPos.x + halfWidth,
    camPos.y - halfHeight,
    camPos.z - 1,
  );

  // Return an array containing the directions to the corners
  return [topLeft, topRight, bottomLeft, bottomRight];
};

const createComputePass = () => {
  let computePipeline;
  const start = () => {
    computePipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: device.createShaderModule({
          code: blurWGSL,
        }),
        entryPoint: "main",
      },
    });
  };
  const render = ({
    commandEncoder,
    timeBuffer,
    resolutionBuffer,
    outputTextureView,
  }) => {
    const flatMappedDirections = getFrustumCornerDirections(
      new Vector3(0, 0, 5),
      70,
    ).flatMap((direction) => direction.toArray());
    const frustumCornerDirectionsBuffer = createFloatUniformBuffer(
      flatMappedDirections,
      "frustum corner directions",
    );
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
            buffer: timeBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: resolutionBuffer,
          },
        },
        // {
        //   binding: 3,
        //   resource: {
        //     buffer: frustumCornerDirectionsBuffer,
        //   },
        // },
      ],
    });
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(resolution.x, resolution.y);
    computePass.end();
  };

  return { start, render };
};

const renderLoop = (device, computePasses) => {
  let bindGroup;
  let outputTexture;
  let animationFrameId;

  const canvas = document.getElementById("webgpu-canvas");
  const context = canvas.getContext("webgpu");
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const shaderModule = device.createShaderModule({ code: shaderCode });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shaderModule,
      entryPoint: "vertex_main",
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragment_main",
      targets: [{ format: presentationFormat }],
    },
  });
  const start = () => {
    const { clientWidth, clientHeight } = canvas.parentElement;
    resolution = new Vector2(clientWidth, clientHeight);
    canvas.width = resolution.x;
    canvas.height = resolution.y;

    computePasses.forEach((computePass) => {
      computePass.start();
    });

    animationFrameId = requestAnimationFrame(frame);
  };
  const frame = async () => {
    const commandEncoder = device.createCommandEncoder();
    const timeBuffer = createUniformBuffer([performance.now() - startTime]);
    const resolutionBuffer = createUniformBuffer([resolution.x, resolution.y]);

    outputTexture = device.createTexture({
      size: [resolution.x, resolution.y, 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.STORAGE_BINDING,
    });
    const outputTextureView = outputTexture.createView();

    computePasses.forEach((computePass) => {
      computePass.render({
        commandEncoder,
        timeBuffer,
        resolutionBuffer,
        outputTextureView,
      });
    });

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: [0.3, 0.3, 0.3, 1],
          storeOp: "store",
        },
      ],
    });

    bindGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
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
  resizeObserver.observe(canvas.parentElement);
};

if (navigator.gpu !== undefined) {
  navigator.gpu.requestAdapter().then((adapter) => {
    adapter.requestDevice().then((newDevice) => {
      device = newDevice;
      const computePass = createComputePass();
      renderLoop(device, [computePass]);
    });
  });
} else {
  console.error("WebGPU not supported");
}
