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

    const totalVoxels = childOctantsVoxelCount.reduce(
      (total, octantVoxels) => total + octantVoxels,
      0,
    );

    const isAllVoxelsFilled = totalVoxels === size ** 3;

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
      leafMask: 0,
    };
    setInternalNode(this.#dataView, startIndex, node);
  }

  get totalSizeBytes() {
    return this.#pointer * OCTREE_STRIDE;
  }
}

/**
 * 16 bits for the x, y, z position
 * 16 bits for the size
 */
const packPositionAndSizeInto64Bits = (
  x: number,
  y: number,
  z: number,
  size: number,
) => {
  console.assert(
    x < 2 ** 16,
    `X position of ${x} is too large to fit in 16 bits`,
  );
  console.assert(
    y < 2 ** 16,
    `Y position of ${y} is too large to fit in 16 bits`,
  );
  console.assert(
    z < 2 ** 16,
    `Z position of ${z} is too large to fit in 16 bits`,
  );
  const sizeLog2 = Math.log2(size);
  console.assert(
    sizeLog2 < 2 ** 16,
    `Size of ${size} is too large to fit in 16 bits`,
  );

  const mask16 = 0xffff;
  const xMasked = BigInt(x & mask16);
  const yMasked = BigInt(y & mask16);
  const zMasked = BigInt(z & mask16);
  const sizeLog2Masked = BigInt(sizeLog2 & mask16);

  return (
    xMasked | (yMasked << 16n) | (zMasked << 32n) | (sizeLog2Masked << 48n)
  );
};

export const setLeafNode = (
  dataView: DataView,
  index: number,
  node: LeafNode,
) => {
  dataView.setUint16(index * OCTREE_STRIDE + 0, node.x, true);
  dataView.setUint16(index * OCTREE_STRIDE + 2, node.y, true);
  dataView.setUint16(index * OCTREE_STRIDE + 4, node.z, true);
  dataView.setUint16(index * OCTREE_STRIDE + 6, Math.log2(node.size), true);
  dataView.setUint8(index * OCTREE_STRIDE + 8, 0);
  // dataView.setBigUint64(
  //   index * OCTREE_STRIDE + 1,
  //   packPositionAndSizeInto64Bits(node.x, node.y, node.z, node.size),
  //   true,
  // );
  dataView.setUint8(index * OCTREE_STRIDE + 9, node.red);
  dataView.setUint8(index * OCTREE_STRIDE + 10, node.green);
  dataView.setUint8(index * OCTREE_STRIDE + 11, node.blue);
};

export const setInternalNode = (
  dataView: DataView,
  index: number,
  node: InternalNode,
) => {
  console.assert(
    node.firstChildIndex < 2 ** 24 - 1,
    `First child index of ${node.firstChildIndex} is too large to fit in 3 bytes`,
  );
  console.assert(
    node.x < 2 ** 16,
    `X position of ${node.x} is too large to fit in 2 bytes`,
  );
  console.assert(
    node.y < 2 ** 16,
    `Y position of ${node.y} is too large to fit in 2 bytes`,
  );
  console.assert(
    node.z < 2 ** 16,
    `Z position of ${node.z} is too large to fit in 2 bytes`,
  );
  dataView.setUint16(index * OCTREE_STRIDE + 0, node.x, true);
  dataView.setUint16(index * OCTREE_STRIDE + 2, node.y, true);
  dataView.setUint16(index * OCTREE_STRIDE + 4, node.z, true);
  dataView.setUint16(index * OCTREE_STRIDE + 6, Math.log2(node.size), true);
  dataView.setUint8(index * OCTREE_STRIDE + 8, node.childMask);
  // dataView.setBigUint64(
  //   index * OCTREE_STRIDE + 1,
  //   BigInt(packPositionAndSizeInto64Bits(node.x, node.y, node.z, node.size)),
  //   true,
  // );
  dataView.setUint32(index * OCTREE_STRIDE + 9, node.firstChildIndex, true);
};

export const deserialiseInternalNode = (
  arrayBuffer: ArrayBuffer,
  index: number,
): InternalNode => {
  const dataView = new DataView(arrayBuffer);
  const childMask = dataView.getUint8(index * OCTREE_STRIDE);
  const x = dataView.getUint16(index * OCTREE_STRIDE + 0);
  const y = dataView.getUint16(index * OCTREE_STRIDE + 2);
  const z = dataView.getUint16(index * OCTREE_STRIDE + 4);
  const size = 2 ** dataView.getUint16(index * OCTREE_STRIDE + 6);
  // Mask out the last 8 bits (24 bits total)
  let firstChildIndex =
    dataView.getUint32(index * OCTREE_STRIDE + 9, true) & 0x00ffffff;

  return { childMask, x, y, z, firstChildIndex, size, leafMask: 0 };
};

const deserializeLeafNode = (arrayBuffer: ArrayBuffer, index: number) => {
  const dataView = new DataView(arrayBuffer);
  const x = dataView.getUint16(index * OCTREE_STRIDE + 0);
  const y = dataView.getUint16(index * OCTREE_STRIDE + 2);
  const z = dataView.getUint16(index * OCTREE_STRIDE + 4);
  const size = 2 ** dataView.getUint16(index * OCTREE_STRIDE + 6);
  const red = dataView.getUint8(index * OCTREE_STRIDE + 9);
  const green = dataView.getUint8(index * OCTREE_STRIDE + 10);
  const blue = dataView.getUint8(index * OCTREE_STRIDE + 11);

  return { x, y, z, red, green, blue, size };
};

// Updates the root offset of the octree across all nodes, useful for combining octrees
export const updateRootOffset = (
  arrayBuffer: ArrayBuffer,
  offset: [number, number, number],
) => {
  const dataView = new DataView(arrayBuffer);
  console.assert(offset[0] < 2 ** 16, `X offset of ${offset[0]} is too large`);
  console.assert(offset[1] < 2 ** 16, `Y offset of ${offset[1]} is too large`);
  console.assert(offset[2] < 2 ** 16, `Z offset of ${offset[2]} is too large`);
  for (let i = 0; i < dataView.byteLength; i += OCTREE_STRIDE) {
    const x = dataView.getUint16(i + 0);
    const y = dataView.getUint16(i + 2);
    const z = dataView.getUint16(i + 4);
    dataView.setUint16(i + 0, x + offset[0]);
    dataView.setUint16(i + 2, y + offset[1]);
    dataView.setUint16(i + 4, z + offset[2]);
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

// Serialises the octree to a buffer for rasterisation
export const getLeafNodeBufferWithoutPointers = (
  arrayBuffer: ArrayBuffer,
) => {};
