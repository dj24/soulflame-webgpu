
export class DebugValuesStore{
  maxObjectCount
  objectCount
  scale
  translateX

  constructor() {
    this.maxObjectCount = 256;
    this.objectCount = 256;
    this.scale = 1;
    this.translateX = 0;
  }
}