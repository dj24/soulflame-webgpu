export const create3dTexture = async (
  device: GPUDevice,
  paths: string[],
): Promise<GPUTexture> => {
  const imageBitmaps = await Promise.all(
    paths.map(async (path) => {
      const response = await fetch(path);
      const blob = await response.blob();
      const { width, height } = await createImageBitmap(blob);
      return {
        width,
        height,
        data: await blob.arrayBuffer(),
      };
    }),
  );

  const width = imageBitmaps[0].width;
  const height = imageBitmaps[0].height;
  const depth = imageBitmaps.length;

  const texture = device.createTexture({
    size: { width, height, depthOrArrayLayers: depth },
    format: "rgba8unorm",
    usage: GPUTextureUsage.COPY_DST,
  });

  const commandEncoder = device.createCommandEncoder();

  for (let i = 0; i < depth; i++) {
    const { data } = imageBitmaps[i];

    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_WRITE,
    });

    const arrayBuffer = await buffer.mapAsync(GPUMapMode.WRITE);
    new Uint8Array(arrayBuffer).set(new Uint8Array(data));
    buffer.unmap();

    commandEncoder.copyBufferToTexture(
      { buffer, offset: 0, bytesPerRow: width * 4 },
      { texture, origin: { x: 0, y: 0, z: i } },
      { width, height },
    );
  }

  device.queue.submit([commandEncoder.finish()]);

  return texture;
};
