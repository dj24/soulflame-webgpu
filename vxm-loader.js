const fs = require("fs");
const { PNG } = require("pngjs");

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function coloredText(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

const isNullCharacter = (byte) => {
  return byte === 0x00;
};

// Version of vxm file must be >= 11
module.exports = function (source, ...args) {
  let fileNameParts = this.resourcePath.split("/");
  let paletteTexture = [];
  // Windows fix
  if (fileNameParts.length < 2) {
    fileNameParts = this.resourcePath.split("\\");
  }
  const fileName = fileNameParts[fileNameParts.length - 1];
  const timeLabel = coloredText(`imported ${fileName} in`, "magenta");
  console.time(timeLabel);
  const decoder = new TextDecoder("utf-8");
  const fileBuffer = fs.readFileSync(this.resourcePath);
  const bufferReader = Buffer.from(fileBuffer);
  const bytes = bufferReader.buffer.byteLength;
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
    if (textureDimX > 2048 || textureDimY > 2048) {
      throw new Error("Size of texture exceeds the max allowed value");
    }

    let size = bufferReader.readUInt32LE(index);
    index += 4;
    index += size; // skip zipped pixel data

    for (let i = 0; i < 6; ++i) {
      let quadAmount = bufferReader.readUInt32LE(index);
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
  let chunkAmount = bufferReader.readUInt8(index); // palette chunks
  index++;
  for (let i = 0; i < chunkAmount; ++i) {
    index += 1024; // chunk id
    bufferReader.readUInt8(index);
    index++; // chunk offset
    bufferReader.readUInt8(index);
    index++; // chunk length
  }

  let materialAmount = bufferReader.readUInt8(index);
  index++;

  paletteTexture = []; // array of vector4, [x,y,z,w]

  for (let i = 0; i < materialAmount; ++i) {
    let blue = bufferReader.readUInt8(index);
    index++;
    let green = bufferReader.readUInt8(index);
    index++;
    let red = bufferReader.readUInt8(index);
    index++;
    let alpha = bufferReader.readUInt8(index);
    index++;
    let emissive = bufferReader.readUInt8(index);
    index++;

    if (emissive === 1) {
      alpha = 2;
    } else {
      alpha = 255;
    }

    let color = [red, green, blue, alpha];

    paletteTexture[i] = color;
  }

  let maxLayers = 1;
  if (version >= 12) {
    maxLayers = bufferReader.readUInt8(index);
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
        const byte = bufferReader.readUInt8(index);
        index++;
        if (isNullCharacter(byte)) {
          break;
        }
        const character = String.fromCharCode(byte);
        layerName = `${layerName}${character}`;
      }
      visible = bufferReader.readUInt8(index);
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
        let x = Math.floor(i / (scale[1] * scale[2]));
        let y = Math.floor((i / scale[2]) % scale[1]);
        let z = Math.floor(i % scale[2]);
        if (x < bounds.min[0]) bounds.min = [x, bounds.min[1], bounds.min[2]];
        if (y < bounds.min[1]) bounds.min = [bounds.min[0], y, bounds.min[2]];
        if (z < bounds.min[2]) bounds.min = [bounds.min[0], bounds.min[1], z];
        if (x > bounds.max[0]) bounds.max = [x, bounds.max[1], bounds.max[2]];
        if (y > bounds.max[1]) bounds.max = [bounds.max[0], y, bounds.max[2]];
        if (z > bounds.max[2]) bounds.max = [bounds.max[0], bounds.max[1], z];
        voxels.push({
          position: [x, y, z],
          colour: paletteTexture[matIdx],
        });
      }
      idx += length;
    }
  }

  const width = bounds.max[0] - bounds.min[0] + 1;
  const height = bounds.max[1] - bounds.min[1] + 1;
  const depth = bounds.max[2] - bounds.min[2] + 1;

  const isProductionMode = process.argv.includes("--mode=production");

  const directoryPath = `public/voxel-models/${fileName.split(".vxm")[0]}`;

  // Check if the directory exists
  if (fs.existsSync(directoryPath)) {
    // If it exists, remove the directory
    fs.rmdirSync(directoryPath, { recursive: true });
    console.log(`Directory '${directoryPath}' exists and has been deleted.`);
  } else {
    console.log(`Directory '${directoryPath}' does not exist.`);
  }

  // Create a directory
  fs.mkdir(directoryPath, { recursive: true }, (err) => {
    if (err) {
      console.error(`Error creating directory: ${err.message}`);
    } else {
      console.log(`Directory created successfully at: ${directoryPath}`);
    }
  });

  let sliceFilePaths = [];

  const png = new PNG({
    width: paletteTexture.length,
    height: 1,
    colorType: 6,
    deflateLevel: 0,
  });

  let emissiveVoxels = [];
  for (const voxel of voxels) {
    if (voxel.colour[3] === 2) {
      emissiveVoxels.push(voxel);
    }
  }

  for (let i = 0; i < paletteTexture.length; i++) {
    const [r, g, b, a] = paletteTexture[i];
    const index = i << 2;
    png.data[index] = r;
    png.data[index + 1] = g;
    png.data[index + 2] = b;
    png.data[index + 3] = a; // Alpha channel
  }
  const palettePngFileName = `${directoryPath}/palette.png`;
  const paletteStream = fs.createWriteStream(palettePngFileName);
  png.pack().pipe(paletteStream);

  for (let slice = 0; slice < depth; slice++) {
    const png = new PNG({
      width,
      height,
      colorType: 6,
      deflateLevel: 0,
    });
    for (const voxel of voxels) {
      let [x, y, z] = voxel.position;
      let [minX, minY, minZ] = bounds.min;
      x -= minX;
      y -= minY;
      z -= minZ;

      // y is inverted for some reason
      // y = height - y - 1;

      if (z !== slice) {
        continue;
      }

      const [r, g, b, a] = voxel.colour;
      const index = (png.width * y + x) << 2;

      png.data[index] = r;
      png.data[index + 1] = g;
      png.data[index + 2] = b;
      png.data[index + 3] = a; // Alpha channel
    }

    // Save the PNG image as a file
    const pngFileName = `${directoryPath}/${slice}.png`;
    const stream = fs.createWriteStream(pngFileName);
    png.pack().pipe(stream);

    // Remove public from the path
    if (isProductionMode) {
      sliceFilePaths.push(
        pngFileName.replace(
          "public",
          "https://dj24.github.io/soulflame-webgpu",
        ),
      );
    } else {
      sliceFilePaths.push(pngFileName.split("public")[1]);
    }
  }

  const output = {
    size: [width, height, depth],
    normalisedPivot,
    bounds,
    sliceFilePaths,
    emissiveVoxels,
  };

  console.timeEnd(timeLabel);

  return `module.exports = ${JSON.stringify(output)}`;
};
