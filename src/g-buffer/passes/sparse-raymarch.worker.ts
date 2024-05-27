const ctx: Worker = self as any;

ctx.onmessage = (event: MessageEvent<any>) => {
  console.log({ WORKER: event.data });
  ctx.postMessage("HELLO WORLD");
};
