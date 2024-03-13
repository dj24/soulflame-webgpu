import { ByteReader } from "./abstractions/byte-reader";
import { vec3 } from "wgpu-matrix";

const isNullCharacter = (byte: any) => {
  return byte === 0x00;
};

export type TVoxels = {
  VOX: number;
  SIZE: number[];
  XYZI: { x: number; y: number; z: number; c: number }[];
  RGBA: { r: number; g: number; b: number; a: number }[];
  PACK?: number;
};

export const convertVxm = (arrayBuffer: ArrayBuffer): TVoxels => {
  console.time("convert vxm");
  const reader = new ByteReader(arrayBuffer);
  let palette = [];
  let magic = "";
  let voxels = [];

  // Read magic
  magic = String.fromCodePoint(
    reader.readUint8(),
    reader.readUint8(),
    reader.readUint8(),
    reader.readUint8(),
  );

  if (magic !== "VXMC" && magic !== "VXMA") {
    throw new Error(`Incorrect magic: ${magic}`);
  }
  let version;
  if (
    magic[3].charCodeAt(0) >= "0".charCodeAt(0) &&
    magic[3].charCodeAt(0) <= "9".charCodeAt(0)
  ) {
    version = magic[3].charCodeAt(0) - "0".charCodeAt(0);
  } else if (
    magic[3].charCodeAt(0) >= "A".charCodeAt(0) &&
    magic[3].charCodeAt(0) <= "C".charCodeAt(0)
  ) {
    version = 10 + magic[3].charCodeAt(0) - "A".charCodeAt(0);
  } else {
    throw new Error("Unsupported version found");
  }
  if (version < 11 || version > 12) {
    throw new Error(
      `Could not load vxm file: Unsupported version found (${version})`,
    );
  }

  let scale = [0, 0, 0];
  scale[0] = reader.readUint32();
  scale[1] = reader.readUint32();
  scale[2] = reader.readUint32();

  let normalisedPivot = [0.5, 0, 0.5];

  normalisedPivot[0] = reader.readFloat32();
  normalisedPivot[1] = reader.readFloat32();
  normalisedPivot[2] = reader.readFloat32();

  let surface = reader.readUint8();
  if (surface > 0) {
    let skipWidth = 0;
    let skipHeight = 0;

    // since version 10 the start and end values are floats
    // but for us this fact doesn't matter
    let startx = reader.readUint32();
    let starty = reader.readUint32();
    let startz = reader.readUint32();

    let endx = reader.readUint32();
    let endy = reader.readUint32();
    let endz = reader.readUint32();
    let normal = reader.readUint32();

    skipWidth = reader.readUint32();
    skipHeight = reader.readUint32();

    // TODO: check skip implementation
    let toSkip = skipWidth * skipHeight;
    reader.skip(toSkip * 4);
  }

  if (version >= 8) {
    /**
     * since version 'A' there are extra attributes we ignore
     * float: lod scale
     * float: lod pivot x
     * float: lod pivot y
     * float: lod pivot z
     */
    reader.skip(4 * 4);
  }

  let lodLevels = reader.readUint32();

  for (let lodLevel = 0; lodLevel < lodLevels; ++lodLevel) {
    let textureDimX = reader.readUint32();
    let textureDimY = reader.readUint32();
    if (textureDimX > 2048 || textureDimY > 2048) {
      throw new Error("Size of texture exceeds the max allowed value");
    }

    let size = reader.readUint32();
    reader.skip(size); // skip zipped pixel data

    for (let i = 0; i < 6; ++i) {
      let quadAmount = reader.readUint32();

      if (quadAmount > 0x40000) {
        console.warn(
          `Size of quads exceeds the max allowed value: ${quadAmount}`,
        );
      }

      // skip quad vertex
      let sizeOfQuadVertex = 20;
      let bytesToSkip = quadAmount * 4 * sizeOfQuadVertex;
      reader.skip(bytesToSkip);
    }
  }

  reader.skip(256 * 4); // palette data rgba
  reader.skip(256 * 4); // palette data rgba for emissive materials
  let chunkAmount = reader.readUint8();
  for (let i = 0; i < chunkAmount; ++i) {
    reader.skip(1024); // chunk id
    reader.readUint8(); // chunk offset
    reader.readUint8(); // chunk length
  }

  let materialAmount = reader.readUint8();
  for (let i = 0; i < materialAmount; ++i) {
    let blue = reader.readUint8();
    let green = reader.readUint8();
    let red = reader.readUint8();
    let alpha = reader.readUint8();
    let emissive = reader.readUint8();

    if (emissive === 1) {
      alpha = 2;
    } else {
      alpha = 255;
    }

    palette[i] = { r: red, g: green, b: blue, a: alpha };
  }

  let maxLayers = 1;
  if (version >= 12) {
    maxLayers = reader.readUint8();
  }

  let bounds = {
    min: vec3.create(9999, 9999, 9999),
    max: vec3.create(0, 0, 0),
  };

  for (let layer = 0; layer < maxLayers; ++layer) {
    let idx = 0;
    let visible = true;
    let layerName = "";
    if (version >= 12) {
      for (;;) {
        const byte = reader.readUint8();
        if (isNullCharacter(byte)) {
          break;
        }
        const character = String.fromCharCode(byte);
        layerName = `${layerName}${character}`;
      }
      visible = reader.readUint8() > 0;
    } else {
      layerName = `Layer ${layer}`;
    }

    // list of numbers that represent the size of the block of voxels
    // block will share the same material
    for (;;) {
      let length = reader.readUint8();

      if (length === 0) {
        break;
      }

      let matIdx = reader.readUint8();
      let EMPTY_PALETTE = 0xff;
      if (matIdx === EMPTY_PALETTE) {
        idx += length;
        continue;
      }

      if (matIdx >= materialAmount) {
        // at least try to load the rest
        idx += length;
        continue;
      }

      // left to right, bottom to top, front to back
      for (let i = idx; i < idx + length; i++) {
        let x = Math.floor(i / (scale[1] * scale[2]));
        let y = Math.floor((i / scale[2]) % scale[1]);
        let z = Math.floor(i % scale[2]);
        bounds.min = vec3.min(bounds.min, [x, y, z]);
        bounds.max = vec3.max(bounds.max, [x, y, z]);
        voxels.push({ x, y, z, c: matIdx });
      }
      idx += length;
    }
  }
  console.timeEnd("convert vxm");

  return {
    VOX: voxels.length,
    SIZE: scale,
    XYZI: voxels,
    RGBA: palette,
  };
};
