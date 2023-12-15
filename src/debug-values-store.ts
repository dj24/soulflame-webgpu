export class DebugValuesStore {
  maxObjectCount;
  objectCount;
  scale;
  translateX;

  constructor() {
    this.maxObjectCount = 128;
    this.objectCount = 128;
    this.scale = 1;
    this.translateX = 0;
  }
}
