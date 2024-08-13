const ctx: Worker = self as any;

export type GetObjectsArgs = {
  maxObjectCount: number;
  objectCount: number;
  scale: number;
  translateX: number;
  rotateY: number;
};

ctx.onmessage = (event: MessageEvent<GetObjectsArgs>) => {
  // const result = getObjectTransforms(event.data).flatMap((voxelObject) =>
  //   voxelObject.toArray(),
  // );
  // ctx.postMessage(result);
};
