export const getGpuDevice = async (): Promise<GPUDevice> => {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({
      requiredFeatures: ["timestamp-query"],
      requiredLimits: { maxColorAttachmentBytesPerSample: 64 },
    });
  } catch (e) {
    console.warn(
      "Timestamp query or 64 byte colour attachment not supported, falling back",
    );
    device = await adapter.requestDevice();
  }
  return device;
};
