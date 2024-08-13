export interface UpdatedByRenderLoop {
  update(frameIndex: number): void;
}

/**
 * A decorator that registers a class to be updated by the render loop.
 * The class must implement the `update` method.
 */
export namespace UpdatedByRenderLoop {
  type Constructor = new (...args: any[]) => UpdatedByRenderLoop;
  const instances: UpdatedByRenderLoop[] = [];

  export const updateAll = (frameIndex: number) => {
    for (const instance of instances) {
      instance.update(frameIndex);
    }
  };

  export const register = <T extends Constructor>(constructor: T) => {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        instances.push(this);
      }
    };
  };
}
