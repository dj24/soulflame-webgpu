import getWasmModule from "./foo.c";
import { frameCount } from "../../app";

const ctx: Worker = self as any;

export type SparseRaymarchWorkerMessage = {
  ptr: number;
  totalBytes: number;
  frameCount: number;
};

const id = String(Symbol());

const wasmModule = await getWasmModule();
console.log("SparseRaymarchWorker loaded", { wasmModule });

ctx.onmessage = (event: MessageEvent<SparseRaymarchWorkerMessage>) => {
  const { ptr, totalBytes, frameCount } = event.data;
  wasmModule.ccall(
    "populate",
    null,
    ["uint8_t*", "uint32_t", "uint32_t"],
    [ptr, totalBytes, frameCount],
  );
  ctx.postMessage("done");
};