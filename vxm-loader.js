const fs = require("fs");

// Version of vxm file must be >= 11
module.exports = function (source, ...args) {
  console.time("import vxm");
  const decoder = new TextDecoder("utf-8");
  const fileBuffer = fs.readFileSync(this.resourcePath);
  const bufferReader = Buffer.from(fileBuffer);
  let magic = [];
  let voxels = [];
  let index = 0;

  // Read magic
  magic[index] = String.fromCodePoint(bufferReader.readUInt8(index));
  index++;
  magic[index] = String.fromCodePoint(bufferReader.readUInt8(index));
  index++;
  magic[index] = String.fromCodePoint(bufferReader.readUInt8(index));
  index++;
  magic[index] = String.fromCodePoint(bufferReader.readUInt8(index));
  index++;

  if (magic.join("") !== "VXMC") {
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
  scale[0] = bufferReader.readUInt32LE(index);
  index += 4;
  scale[1] = bufferReader.readUInt32LE(index);
  index += 4;
  scale[2] = bufferReader.readUInt32LE(index);
  index += 4;

  let normalisedPivot = [0.5, 0, 0.5];

  normalisedPivot[0] = bufferReader.readFloatLE(index);
  index += 4;
  normalisedPivot[1] = bufferReader.readFloatLE(index);
  index += 4;
  normalisedPivot[2] = bufferReader.readFloatLE(index);
  index += 4;

  let surface = bufferReader.readUInt8(index);
  index++;
  if (surface > 0) {
    let skipWidth = 0;
    let skipHeight = 0;

    // since version 10 the start and end values are floats
    // but for us this fact doesn't matter
    let startx = bufferReader.readUInt32LE(index);
    index += 4;
    let starty = bufferReader.readUInt32LE(index);
    index += 4;
    let startz = bufferReader.readUInt32LE(index);
    index += 4;

    let endx = bufferReader.readUInt32LE(index);
    index += 4;
    let endy = bufferReader.readUInt32LE(index);
    index += 4;
    let endz = bufferReader.readUInt32LE(index);
    index += 4;
    let normal = bufferReader.readUInt32LE(index);
    index += 4;

    skipWidth = bufferReader.readUInt32LE(index);
    index += 4;
    skipHeight = bufferReader.readUInt32LE(index);
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

  let lodLevels = bufferReader.readUInt32LE(index);
  index += 4;

  for (let lodLevel = 0; lodLevel < lodLevels; ++lodLevel) {
    let textureDimX = bufferReader.readUInt32LE(index);
    index += 4;
    let textureDimY = bufferReader.readUInt32LE(index);
    index += 4;
    console.log({ textureDimX, textureDimY });
    if (textureDimX > 2048 || textureDimY > 2048) {
      throw new Error("Size of texture exceeds the max allowed value");
    }

    let size = bufferReader.readUInt32LE(index);
    index += 4;
    index += size * 4; // skip zipped pixel data

    console.log({ magic, scale, version, normalisedPivot, lodLevels, voxels });

    for (let i = 0; i < 6; ++i) {
      let quadAmount = bufferReader.readUInt32LE(index);
      index += 4;

      if (quadAmount > 0x40000) {
        // throw new Error($"Size of quads exceeds the max allowed value: {quadAmount}");
      }

      // skip quad vertex
      let sizeOfQuadVertex = 20;
      index += quadAmount * 4 * sizeOfQuadVertex;
    }
  }

  index += 256 * 4; // palette data rgba
  index += 256 * 4; // palette data rgba for emissive materials
  let chunkAmount = bufferReader.readUInt8(); // palette chunks
  for (let i = 0; i < chunkAmount; ++i) {
    index += 1024; // chunk id
    bufferReader.readUInt8();
    index++; // chunk offset
    bufferReader.readUInt8();
    index++; // chunk length
  }

  let materialAmount = bufferReader.readUInt8();
  index++;

  paletteTexture = []; // array of vector4, [x,y,z,w]
  colourArray = [];

  for (let i = 0; i < materialAmount; ++i) {
    let blue = bufferReader.readUInt8();
    index++;
    let green = bufferReader.readUInt8();
    index++;
    let red = bufferReader.readUInt8();
    index++;
    let alpha = bufferReader.readUInt8();
    index++;
    let emissive = bufferReader.readUInt8();
    index++;
    let color = [red, green, blue, alpha];

    colourArray[i] = color;
    paletteTexture[i] = color;
    // TODO: check voxedit emissive capabilities
    // if (emissive) {
    // 	palette.glowColor(i) = palette.color(i);
    // }
  }

  let maxLayers = 1;
  if (version >= 12) {
    maxLayers = bufferReader.readUInt8();
    index++;
  }

  let bounds = {
    min: [9999, 9999, 9999],
    max: [0, 0, 0],
  };

  for (let layer = 0; layer < maxLayers; ++layer) {
    let idx = 0;
    let visible = true;
    let layerName;
    if (version >= 12) {
      layerName = decoder.decode(bufferReader.subarray(index, index + 1024));
      console.log({ layerName });
      index += 1024;
      visible = bufferReader.readUInt8(index) > 0;
      index++;
    } else {
      layerName = `Layer ${layer}`;
    }

    for (;;) {
      let length = bufferReader.readUInt8(index);
      index++;
      if (length === 0) {
        break;
      }

      let matIdx = bufferReader.readUInt8(index);
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
        let x = i / (scale[1] * scale[2]);
        let y = (i / scale[2]) % scale[1];
        let z = i % scale[2];
        if (x < bounds.min[0]) bounds.min = [x, bounds.min[1], bounds.min[2]];
        if (y < bounds.min[1]) bounds.min = [bounds.min[0], y, bounds.min[2]];
        if (z < bounds.min[2]) bounds.min = [bounds.min[0], bounds.min[1], z];
        if (x > bounds.max[0]) bounds.max = [x, bounds.max[1], bounds.max[2]];
        if (y > bounds.max[1]) bounds.max = [bounds.max[0], y, bounds.max[2]];
        if (z > bounds.max[2]) bounds.max = [bounds.max[0], bounds.max[1], z];
        voxels.push({
          position: [x, y, z],
          materialId: matIdx + 1,
        });
      }
      idx += length;
    }
  }

  surface = bufferReader.readUInt8(index);
  index++;
  if (surface > 0) {
    let startx = bufferReader.readUInt32LE();
    index += 4;
    let starty = bufferReader.readUInt32LE();
    index += 4;
    let startz = bufferReader.readUInt32LE();
    index += 4;

    let endx = bufferReader.readUInt32LE();
    index += 4;
    let endy = bufferReader.readUInt32LE();
    index += 4;
    let endz = bufferReader.readUInt32LE();
    index += 4;
    let normal = bufferReader.readUInt32LE();
    index += 4;
  }
  // here might be another byte - but it isn't written everytime

  // TODO: create texture here
  console.log({ magic, scale, version, normalisedPivot, lodLevels, voxels });
  console.timeEnd("import vxm");
  return "";
};
