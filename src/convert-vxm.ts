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
  const dataView = new DataView(arrayBuffer);
  let palette = [];
  let magic = [];
  let voxels = [];
  let index = 0;

  // Read magic
  magic[index] = String.fromCodePoint(dataView.getUint8(index));
  index++;
  magic[index] = String.fromCodePoint(dataView.getUint8(index));
  index++;
  magic[index] = String.fromCodePoint(dataView.getUint8(index));
  index++;
  magic[index] = String.fromCodePoint(dataView.getUint8(index));
  index++;

  if (magic.join("") !== "VXMC" && magic.join("") !== "VXMA") {
    throw new Error(`Incorrect magic: ${magic.join("")}`);
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
  scale[0] = dataView.getUint32(index, true);
  index += 4;
  scale[1] = dataView.getUint32(index, true);
  index += 4;
  scale[2] = dataView.getUint32(index, true);
  index += 4;

  let normalisedPivot = [0.5, 0, 0.5];

  normalisedPivot[0] = dataView.getFloat32(index, true);
  index += 4;
  normalisedPivot[1] = dataView.getFloat32(index, true);
  index += 4;
  normalisedPivot[2] = dataView.getFloat32(index, true);
  index += 4;

  let surface = dataView.getUint8(index);
  index++;
  if (surface > 0) {
    let skipWidth = 0;
    let skipHeight = 0;

    // since version 10 the start and end values are floats
    // but for us this fact doesn't matter
    let startx = dataView.getUint32(index, true);
    index += 4;
    let starty = dataView.getUint32(index, true);
    index += 4;
    let startz = dataView.getUint32(index, true);
    index += 4;

    let endx = dataView.getUint32(index, true);
    index += 4;
    let endy = dataView.getUint32(index, true);
    index += 4;
    let endz = dataView.getUint32(index, true);
    index += 4;
    let normal = dataView.getUint32(index, true);
    index += 4;

    skipWidth = dataView.getUint32(index, true);
    index += 4;
    skipHeight = dataView.getUint32(index, true);
    index += 4;

    // TODO: check skip implementation
    let toSkip = skipWidth * skipHeight;
    index += toSkip * 4;
  }

  if (version >= 8) {
    /**
     * since version 'A' there are extra attributes we ignore
     * float: lod scale
     * float: lod pivot x
     * float: lod pivot y
     * float: lod pivot z
     */
    index += 4 * 4;
  }

  let lodLevels = dataView.getUint32(index, true);
  index += 4;

  for (let lodLevel = 0; lodLevel < lodLevels; ++lodLevel) {
    let textureDimX = dataView.getUint32(index, true);
    index += 4;
    let textureDimY = dataView.getUint32(index, true);
    index += 4;
    if (textureDimX > 2048 || textureDimY > 2048) {
      throw new Error("Size of texture exceeds the max allowed value");
    }

    let size = dataView.getUint32(index, true);
    index += 4;
    index += size; // skip zipped pixel data

    for (let i = 0; i < 6; ++i) {
      let quadAmount = dataView.getUint32(index, true);
      index += 4;

      if (quadAmount > 0x40000) {
        console.warn(
          `Size of quads exceeds the max allowed value: ${quadAmount}`,
        );
      }

      // skip quad vertex
      let sizeOfQuadVertex = 20;
      let bytesToSkip = quadAmount * 4 * sizeOfQuadVertex;
      index += bytesToSkip;
    }
  }

  index += 256 * 4; // palette data rgba
  index += 256 * 4; // palette data rgba for emissive materials
  let chunkAmount = dataView.getUint8(index); // palette chunks
  index++;
  for (let i = 0; i < chunkAmount; ++i) {
    index += 1024; // chunk id
    dataView.getUint8(index);
    index++; // chunk offset
    dataView.getUint8(index);
    index++; // chunk length
  }

  let materialAmount = dataView.getUint8(index);
  index++;

  for (let i = 0; i < materialAmount; ++i) {
    let blue = dataView.getUint8(index);
    index++;
    let green = dataView.getUint8(index);
    index++;
    let red = dataView.getUint8(index);
    index++;
    let alpha = dataView.getUint8(index);
    index++;
    let emissive = dataView.getUint8(index);
    index++;

    if (emissive === 1) {
      alpha = 2;
    } else {
      alpha = 255;
    }

    palette[i] = { r: red, g: green, b: blue, a: alpha };
  }

  let maxLayers = 1;
  if (version >= 12) {
    maxLayers = dataView.getUint8(index);
    index++;
  }

  let bounds = {
    min: [9999, 9999, 9999],
    max: [0, 0, 0],
  };

  for (let layer = 0; layer < maxLayers; ++layer) {
    let idx = 0;
    let visible = true;
    let layerName = "";
    if (version >= 12) {
      for (;;) {
        const byte = dataView.getUint8(index);
        index++;
        if (isNullCharacter(byte)) {
          break;
        }
        const character = String.fromCharCode(byte);
        layerName = `${layerName}${character}`;
      }
      visible = dataView.getUint8(index) > 0;
      index++;
    } else {
      layerName = `Layer ${layer}`;
    }

    for (;;) {
      let length = dataView.getUint8(index);
      index++;
      if (length === 0) {
        break;
      }

      let matIdx = dataView.getUint8(index);
      index++;
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
        if (x < bounds.min[0]) bounds.min = [x, bounds.min[1], bounds.min[2]];
        if (y < bounds.min[1]) bounds.min = [bounds.min[0], y, bounds.min[2]];
        if (z < bounds.min[2]) bounds.min = [bounds.min[0], bounds.min[1], z];
        if (x > bounds.max[0]) bounds.max = [x, bounds.max[1], bounds.max[2]];
        if (y > bounds.max[1]) bounds.max = [bounds.max[0], y, bounds.max[2]];
        if (z > bounds.max[2]) bounds.max = [bounds.max[0], bounds.max[1], z];
        voxels.push({ x, y, z, c: matIdx });
      }
      idx += length;
    }
  }

  return {
    VOX: voxels.length,
    SIZE: scale,
    XYZI: voxels,
    RGBA: palette,
  };
};
