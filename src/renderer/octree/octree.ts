import { setBit } from "./bitmask";
export const OCTREE_STRIDE = 16;

export const bitmaskToString = (bitmask: number, bits = 8) => {
  return bitmask.toString(2).padStart(bits, "0");
};

/** Converts an octant index to an offset in the parent octant
 * Bits represent the following octants:
 *
 * 0 = [0,0,0]
 *
 * 1 = [1,0,0]
 *
 * 2 = [0,1,0]
 *
 * 3 = [1,1,0]
 *
 * 4 = [0,0,1]
 *
 * 5 = [1,0,1]
 *
 * 6 = [0,1,1]
 *
 * 7 = [1,1,1]
 */
export const octantIndexToOffset = (index: number) => {
  return [index & 1 ? 1 : 0, index & 2 ? 1 : 0, index & 4 ? 1 : 0];
};

export const octantOffsetToIndex = (offset: [number, number, number]) => {
  return offset[0] + offset[1] * 2 + offset[2] * 4;
};

const ceilToNextPowerOfTwo = (n: number) => {
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

export type InternalNode = {
  /** index of the first child node */
  firstChildIndex: number;
  /** bitmask of which children are present */
  childMask: number;
  /** x position of the node */
  x: number;
  /** y position of the node */
  y: number;
  /** z position of the node */
  z: number;
  /** size of the node */
  size: number;
  /** bitmask of which children are leaves */
  leafMask: number;
};

export type LeafNode = {
  /** 0-255 red value */
  red: number;
  /** 0-255 green value */
  green: number;
  /** 0-255 blue value */
  blue: number;
  /** x position of the node */
  x: number;
  /** y position of the node */
  y: number;
  /** z position of the node */
  z: number;
  /** size of the node */
  size: number;
};

export type OctreeNode = InternalNode | LeafNode;

export type GetOctreeVoxel = (
  x: number,
  y: number,
  z: number,
  depth: number,
) => { red: number; green: number; blue: number; solid: boolean } | null;

export type GetMinimumVoxelSize = (x: number, y: number, z: number) => number;

/**
 * Handles construction of an Octree for a single voxel object.
 */
export class Octree {
  readonly nodes: OctreeNode[];
  #pointer: number;
  #getVoxel: GetOctreeVoxel;
  #getMinVoxelSize: GetMinimumVoxelSize;
  #dataView: DataView;
  #size: number;
  depth: number;

  constructor(
    getVoxel: GetOctreeVoxel,
    getMinVoxelSize: GetMinimumVoxelSize,
    size: number,
    buffer: SharedArrayBuffer,
  ) {
    this.nodes = [];
    this.#pointer = 0;
    this.#dataView = new DataView(buffer);
    this.#getVoxel = getVoxel;
    this.#getMinVoxelSize = getMinVoxelSize;
    this.depth = Math.log2(size);
    this.#size = size;
    this.#build(0, [0, 0, 0], 0);
  }

  // Allocate memory for 8 nodes, and return the index of the first node
  #mallocOctant(nodeCount = 8) {
    this.#pointer += nodeCount;
    return this.#pointer - (nodeCount - 1);
  }

  #build(
    startIndex: number,
    scaledOffset: [x: number, y: number, z: number],
    depth: number,
  ) {
    // Volume size at this depth
    const size = ceilToNextPowerOfTwo(2 ** (this.depth - depth));
    const offset = [
      scaledOffset[0] * size,
      scaledOffset[1] * size,
      scaledOffset[2] * size,
    ];

    // const scaledOffset = offset.map((o) => o / size);
    const voxel = this.#getVoxel(
      scaledOffset[0],
      scaledOffset[1],
      scaledOffset[2],
      depth,
    );

    const isLeaf =
      size <= this.#getMinVoxelSize(offset[0], offset[1], offset[2]);

    if (isLeaf) {
      if (voxel && "red" in voxel) {
        const { red, green, blue } = voxel;
        const node = {
          red,
          green,
          blue,
          x: scaledOffset[0] * size,
          y: scaledOffset[1] * size,
          z: scaledOffset[2] * size,
          size,
        };
        setLeafNode(this.#dataView, startIndex, node);
      } else {
        const node = {
          red: 255,
          green: 255,
          blue: 255,
          x: scaledOffset[0] * size,
          y: scaledOffset[1] * size,
          z: scaledOffset[2] * size,
          size,
        };
        setLeafNode(this.#dataView, startIndex, node);
      }
      return;
    }

    // The voxels contained within each child octant
    const childOctantsVoxelCount: number[] = Array.from({ length: 8 }, () => 0);
    const childOctantSize = size / 2;

    // For each child octant, check if it contains any voxels
    for (let i = 0; i < 8; i++) {
      const origin = octantIndexToOffset(i);
      const x = scaledOffset[0] * size + origin[0] * childOctantSize;
      const y = scaledOffset[1] * size + origin[1] * childOctantSize;
      const z = scaledOffset[2] * size + origin[2] * childOctantSize;
      for (let octantX = x; octantX < x + childOctantSize; octantX++) {
        for (let octantY = y; octantY < y + childOctantSize; octantY++) {
          for (let octantZ = z; octantZ < z + childOctantSize; octantZ++) {
            if (this.#getVoxel(octantX, octantY, octantZ, this.depth)) {
              childOctantsVoxelCount[i]++;
            }
          }
        }
      }
    }
    // We can save space by only allocating up to the last child node
    let requiredChildNodes = 0;

    let octantFlags = Array.from({ length: 8 }, () => false);
    const sizeAtDepth = 2 ** depth;

    for (let i = 0; i < 8; i++) {
      const origin = octantIndexToOffset(i);
      const offsetInNextDepth = scaledOffset.map((o) => o * 2);
      const x = offsetInNextDepth[0] + origin[0];
      const y = offsetInNextDepth[1] + origin[1];
      const z = offsetInNextDepth[2] + origin[2];
      octantFlags[i] = this.#getVoxel(x, y, z, depth + 1) !== null;
    }

    // Once we have the valid child octants, create a node for the current octant
    const childMask = childOctantsVoxelCount.reduce((mask, octantVoxels, i) => {
      if (octantVoxels > 0) {
        requiredChildNodes = i + 1;
        return setBit(mask, i);
      }
      return mask;
    }, 0);

    //TODO: correctly set leaf mask
    let leafMask = size === 2 ? childMask : 0;

    const totalVoxels = childOctantsVoxelCount.reduce(
      (total, octantVoxels) => total + octantVoxels,
      0,
    );

    // TODO: do this properly after the octree is built
    const isAllVoxelsFilled = totalVoxels === size ** 3 && size > 4;

    if (isAllVoxelsFilled) {
      const centerOfOctant = offset.map((o) => o + size / 2);
      const { red, green, blue } = this.#getVoxel(
        centerOfOctant[0],
        centerOfOctant[1],
        centerOfOctant[2],
        this.depth,
      );
      const node = {
        red,
        green,
        blue,
        x: scaledOffset[0] * size,
        y: scaledOffset[1] * size,
        z: scaledOffset[2] * size,
        size,
      };
      setLeafNode(this.#dataView, startIndex, node);
      return;
    }

    // Allocate memory for child nodes
    const firstChildIndex = this.#mallocOctant(requiredChildNodes);
    const relativeIndex = firstChildIndex - startIndex;

    childOctantsVoxelCount.forEach((octantVoxels, i) => {
      if (octantVoxels) {
        const childIndex = firstChildIndex + i;
        const origin = octantIndexToOffset(i);
        const x = scaledOffset[0] * 2 + origin[0];
        const y = scaledOffset[1] * 2 + origin[1];
        const z = scaledOffset[2] * 2 + origin[2];
        this.#build(childIndex, [x, y, z], depth + 1);
      }
    });

    // Create the parent node
    const node = {
      firstChildIndex: relativeIndex,
      childMask,
      x: scaledOffset[0] * size,
      y: scaledOffset[1] * size,
      z: scaledOffset[2] * size,
      size: size,
      leafMask,
    };
    setInternalNode(this.#dataView, startIndex, node);
  }

  get totalSizeBytes() {
    return this.#pointer * OCTREE_STRIDE;
  }
}

const pack12Bit4Bit = (twelveBits: number, fourBits: number) => {
  const fourBitsMasked = fourBits & 0xf;
  const twelveBitsMasked = twelveBits & 0xfff;
  return (fourBitsMasked << 12) | twelveBitsMasked;
};

const unpack12Bit4Bit = (packed: number) => {
  return [packed & 0xfff, packed >> 12];
};

const pack12Bit12Bit8Bit = (
  twelveBits1: number,
  twelveBits2: number,
  eightBits: number,
) => {
  const twelveBits1Masked = twelveBits1 & 0xfff;
  const twelveBits2Masked = twelveBits2 & 0xfff;
  const eightBitsMasked = eightBits & 0xff;
  return (
    (eightBitsMasked << 24) | (twelveBits2Masked << 12) | twelveBits1Masked
  );
};

const unpack12Bit12Bit8Bit = (packed: number) => {
  return [packed & 0xfff, (packed >> 12) & 0xfff, packed >> 24];
};

const quantise565 = (red: number, green: number, blue: number) => {
  const redQuantised = Math.floor((red / 255) * 31);
  const greenQuantised = Math.floor((green / 255) * 63);
  const blueQuantised = Math.floor((blue / 255) * 31);
  const redMasked = redQuantised & 0x1f;
  const greenMasked = greenQuantised & 0x3f;
  const blueMasked = blueQuantised & 0x1f;
  return (blueMasked << 11) | (greenMasked << 5) | redMasked;
};

export const setLeafNode = (
  dataView: DataView,
  index: number,
  node: LeafNode,
) => {
  dataView.setUint32(
    index * OCTREE_STRIDE + 0,
    pack12Bit12Bit8Bit(node.x, node.y, 0),
    true,
  );
  dataView.setUint16(
    index * OCTREE_STRIDE + 4,
    pack12Bit4Bit(node.z, Math.log2(node.size)),
    true,
  );
  dataView.setUint8(index * OCTREE_STRIDE + 6, 0);
  // EMPTY 8 BITS
  dataView.setUint16(
    index * OCTREE_STRIDE + 8,
    quantise565(node.red, node.green, node.blue),
    true,
  );
};

export const setInternalNode = (
  dataView: DataView,
  index: number,
  node: InternalNode,
) => {
  dataView.setUint32(
    index * OCTREE_STRIDE + 0,
    pack12Bit12Bit8Bit(node.x, node.y, 0),
    true,
  );
  dataView.setUint16(
    index * OCTREE_STRIDE + 4,
    pack12Bit4Bit(node.z, Math.log2(node.size)),
    true,
  );
  dataView.setUint8(index * OCTREE_STRIDE + 6, node.childMask);
  dataView.setUint8(index * OCTREE_STRIDE + 7, node.leafMask);
  dataView.setUint32(index * OCTREE_STRIDE + 8, node.firstChildIndex, true);
};

export const deserialiseInternalNode = (
  arrayBuffer: ArrayBuffer,
  index: number,
): InternalNode => {
  const dataView = new DataView(arrayBuffer);
  const [x, y, _] = unpack12Bit12Bit8Bit(
    dataView.getUint32(index * OCTREE_STRIDE, true),
  );
  const [z, size] = unpack12Bit4Bit(
    dataView.getUint16(index * OCTREE_STRIDE + 4, true),
  );
  const childMask = dataView.getUint8(index * OCTREE_STRIDE + 6);
  let firstChildIndex =
    dataView.getUint32(index * OCTREE_STRIDE + 8, true) & 0x00ffffff; // Mask out the last 8 bits (24 bits total)
  return { childMask, x, y, z, firstChildIndex, size: 2 ** size, leafMask: 0 };
};

const deserializeLeafNode = (arrayBuffer: ArrayBuffer, index: number) => {
  const dataView = new DataView(arrayBuffer);
  const [x, y, _] = unpack12Bit12Bit8Bit(
    dataView.getUint32(index * OCTREE_STRIDE, true),
  );
  const [z, size] = unpack12Bit4Bit(
    dataView.getUint16(index * OCTREE_STRIDE + 4, true),
  );
  const red = dataView.getUint8(index * OCTREE_STRIDE + 7);
  const green = dataView.getUint8(index * OCTREE_STRIDE + 8);
  const blue = dataView.getUint8(index * OCTREE_STRIDE + 9);
  return { x, y, z, red, green, blue, size };
};

// Updates the root offset of the octree across all nodes, useful for combining octrees
export const updateRootOffset = (
  arrayBuffer: ArrayBuffer,
  offset: [number, number, number],
) => {
  const dataView = new DataView(arrayBuffer);
  console.assert(offset[0] < 2 ** 12, `X offset of ${offset[0]} is too large`);
  console.assert(offset[1] < 2 ** 12, `Y offset of ${offset[1]} is too large`);
  console.assert(offset[2] < 2 ** 12, `Z offset of ${offset[2]} is too large`);
  for (let i = 0; i < dataView.byteLength; i += OCTREE_STRIDE) {
    const [x, y, _] = unpack12Bit12Bit8Bit(dataView.getUint32(i + 0, true));
    const [z, size] = unpack12Bit4Bit(dataView.getUint16(i + 4, true));
    const offsetX = x + offset[0];
    const offsetY = y + offset[1];
    const offsetZ = z + offset[2];
    dataView.setUint32(i, pack12Bit12Bit8Bit(offsetX, offsetY, 0), true);
    dataView.setUint16(i + 4, pack12Bit4Bit(offsetZ, size), true);
  }
};

// Lowers the LOD of an octree by merging leaf nodes
export const lowerOctreeLOD = (
  arrayBuffer: ArrayBuffer,
  outputArrayBuffer: ArrayBuffer,
  leafVoxelSize: number,
  byteOffset: number,
) => {
  const dataView = new DataView(arrayBuffer);

  // Recursive traversal of the octree
  try {
    const node = deserialiseInternalNode(
      arrayBuffer,
      byteOffset / OCTREE_STRIDE,
    );
    if (node.size > leafVoxelSize) {
      for (let i = 0; i < 8; i++) {
        if (node.childMask & (1 << i)) {
          let relativeByteOffset = (node.firstChildIndex + i) * OCTREE_STRIDE;
          // Add to the new buffer and move on to the next node
          lowerOctreeLOD(
            arrayBuffer,
            outputArrayBuffer,
            leafVoxelSize,
            relativeByteOffset + byteOffset,
          );
        }
      }
      return;
    }
    // If the node is at the leaf voxel size, we can merge it
    if (node.size === leafVoxelSize) {
      let totalLeafColour = [0, 0, 0];
      let leafCount = 0;
      for (let i = 0; i < 8; i++) {
        if (node.childMask & (1 << i)) {
          let relativeByteOffset =
            byteOffset + (node.firstChildIndex + i) * OCTREE_STRIDE;
          const leaf = deserializeLeafNode(
            arrayBuffer,
            relativeByteOffset / OCTREE_STRIDE,
          );
          totalLeafColour[0] += leaf.red;
          totalLeafColour[1] += leaf.green;
          totalLeafColour[2] += leaf.blue;
          leafCount++;
        }
      }
      if (leafCount === 0) {
        return;
      }
      const colour = totalLeafColour.map((c) => c / leafCount);
      const leafNode: LeafNode = {
        x: node.x,
        y: node.y,
        z: node.z,
        size: node.size,
        red: colour[0],
        green: colour[1],
        blue: colour[2],
      };
      setLeafNode(dataView, byteOffset / OCTREE_STRIDE, leafNode);
      return;
    }
    return;
  } catch (e) {
    console.log(e, {
      byteOffset,
      bufferSizeItems: arrayBuffer.byteLength / OCTREE_STRIDE,
      bufferSizeBytes: arrayBuffer.byteLength,
    });
  }
};
