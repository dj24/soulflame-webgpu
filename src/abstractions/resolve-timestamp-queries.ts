import { device, frameTimeTracker, RenderPass } from "../app";

let gpuReadBuffer: GPUBuffer;
let isMapPending = false;

export const resolveTimestampQueries = async (
  labels: string[],
  timestampQuerySet: GPUQuerySet,
  timestampQueryBuffer: GPUBuffer,
) => {
  const size = timestampQueryBuffer.size;
  // TODO: account for change in query set size
  if (!gpuReadBuffer) {
    gpuReadBuffer = device.createBuffer({
      size,
      label: "gpu read buffer",
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }
  const commandEncoder = device.createCommandEncoder();
  if (isMapPending) {
    return;
  }
  isMapPending = true;
  commandEncoder.resolveQuerySet(
    timestampQuerySet,
    0,
    timestampQuerySet.count,
    timestampQueryBuffer,
    0,
  );
  commandEncoder.copyBufferToBuffer(
    timestampQueryBuffer,
    0,
    gpuReadBuffer,
    0,
    size,
  );
  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  await gpuReadBuffer.mapAsync(GPUMapMode.READ).finally(() => {
    isMapPending = false;
  });
  const arrayBuffer = gpuReadBuffer.getMappedRange();
  const timingsNanoseconds = new BigInt64Array(arrayBuffer);
  const timingsMilliseconds: number[] = [];
  timingsNanoseconds.forEach((nanoseconds) => {
    timingsMilliseconds.push(Number(nanoseconds) / 1e6);
  });
  const computePassExecutionTimes = timingsMilliseconds.reduce(
    (acc, val, index) => {
      if (index % 2 === 0) {
        acc.push(timingsMilliseconds[index + 1] - val);
      }
      return acc;
    },
    [],
  );

  computePassExecutionTimes.forEach((time, index) => {
    frameTimeTracker.addSample(labels[index], time);
  });
  gpuReadBuffer.unmap();
};
