import getWasmModule from "./foo.c";

const ctx: Worker = self as any;

export type SparseRaymarchWorkerMessage = {
  ptr: number;
  totalBytes: number;
  frameCount: number;
};

const id = String(Symbol());

const wasmModule = await getWasmModule();

const device = await navigator.gpu.requestAdapter();
console.log("SparseRaymarchWorker loaded", { wasmModule, device });

ctx.onmessage = (event: MessageEvent<SparseRaymarchWorkerMessage>) => {
  if ("heapBuffer" in event.data) {
    console.log("SparseRaymarchWorker initialized", {
      id,
      buffer: event.data.heapBuffer,
    });
    return;
  }
  const { ptr, totalBytes, frameCount } = event.data;
  wasmModule.ccall(
    "populate",
    null,
    ["uint8_t*", "uint32_t", "uint32_t"],
    [ptr, totalBytes, frameCount],
  );
  console.time("postMessage");
  const copy = wasmModule.HEAPU8.slice();
  ctx.postMessage(copy.buffer, [copy.buffer]);
  console.timeEnd("postMessage");
};
