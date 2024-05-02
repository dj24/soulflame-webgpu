export interface UpdatedByRenderLoop {
  update(): void;
}

export namespace UpdatedByRenderLoop {
  type Constructor<T> = {
    new (...args: any[]): T;
    readonly prototype: T;
  };
  const implementations: Constructor<UpdatedByRenderLoop>[] = [];
  export function GetImplementations(): Constructor<UpdatedByRenderLoop>[] {
    return implementations;
  }
  export function register<T extends Constructor<UpdatedByRenderLoop>>(
    constructor: T,
  ) {
    implementations.push(constructor);
    return constructor;
  }
}
