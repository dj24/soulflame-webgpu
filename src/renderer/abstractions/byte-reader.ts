/**
 * Reads different number types from an array buffer in sequence, advancing the cursor by the size in bytes of the value being read.
 * @class ByteReader
 */
export class ByteReader {
  index: number;
  private dataView: DataView;
  constructor(arrayBuffer: ArrayBuffer) {
    this.dataView = new DataView(arrayBuffer);
    this.index = 0;
  }

  readUint8() {
    const value = this.dataView.getUint8(this.index);
    this.index++;
    return value;
  }

  readUint32() {
    const value = this.dataView.getUint32(this.index, true);
    this.index += 4;
    return value;
  }

  readFloat32() {
    const value = this.dataView.getFloat32(this.index, true);
    this.index += 4;
    return value;
  }

  skip(length: number) {
    this.index += length;
  }
}
