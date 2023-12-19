export class DebugValuesStore {
  maxObjectCount;
  objectCount;
  scale;
  translateX;

  constructor() {
    this.maxObjectCount = 1;
    this.objectCount = 1;
    this.scale = 1;
    this.translateX = 0;
  }
}
