import { TVoxels } from "../convert-vxm";
import { setBit } from "./bitmask";
import { expose } from "comlink";
import { createSineTerrain } from "../../procgen/sine-chunk";

/** Returns the depth of the octree required to contain the given voxel bounds */
export const getOctreeDepthFromVoxelBounds = (size: TVoxels["SIZE"]) => {
  return Math.ceil(Math.log2(Math.max(...size)));
};

const OCTREE_STRIDE = 8;

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

const ceilToNextPowerOfTwo = (n: number) => {
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

export type InternalNode = {
  /** voxels contained within this node */
  voxels: TVoxels;
  /** index of the first child node */
  firstChildIndex: number;
  /** bitmask of which children are present */
  childMask: number;
  /** bitmask of which children are leaf nodes */
  leafMask: number;
  /** x position of the node */
  x: number;
  /** y position of the node */
  y: number;
  /** z position of the node */
  z: number;
  /** size of the node */
  size: number;
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

type OctreeNode = InternalNode | LeafNode;

let averageFirstChildIndex = 0;

/**
 * Handles construction of an Octree for a single voxel object.
 */
export class Octree {
  readonly nodes: OctreeNode[];
  #pointer: number;
  #maxDepth: number;

  constructor(voxels: TVoxels) {
    this.nodes = [];
    this.#pointer = 0;
    this.#maxDepth = getOctreeDepthFromVoxelBounds(voxels.SIZE);
    this.#build(voxels, 0, [0, 0, 0], 0);
    averageFirstChildIndex /= this.nodes.length;
  }

  // Allocate memory for 8 nodes, and return the index of the first node
  #mallocOctant(nodeCount = 8) {
    this.#pointer += nodeCount;
    return this.#pointer - (nodeCount - 1);
  }

  #build(
    voxels: TVoxels,
    startIndex: number,
    offset: [x: number, y: number, z: number],
    depth: number,
  ) {
    const isLeaf = voxels.SIZE[0] === 1;
    if (isLeaf) {
      const paletteIndex = voxels.XYZI[0].c;
      this.nodes[startIndex] = {
        red: voxels.RGBA[paletteIndex].r,
        green: voxels.RGBA[paletteIndex].g,
        blue: voxels.RGBA[paletteIndex].b,
        x: offset[0],
        y: offset[1],
        z: offset[2],
        size: voxels.SIZE[0],
      };
      return;
    }

    // The voxels contained within each child octant
    const childOctants: (TVoxels | null)[] = Array.from(
      { length: 8 },
      () => null,
    );
    const childDepth = depth + 1;
    const objectSize = ceilToNextPowerOfTwo(Math.max(...voxels.SIZE));
    const childOctantSize = objectSize / 2;

    // For each child octant, check if it contains any voxels
    for (let i = 0; i < 8; i++) {
      const origin = octantIndexToOffset(i);
      const x = offset[0] + origin[0] * childOctantSize;
      const y = offset[1] + origin[1] * childOctantSize;
      const z = offset[2] + origin[2] * childOctantSize;

      const octantVoxels: TVoxels["XYZI"] = voxels.XYZI.filter(
        (voxel) =>
          voxel.x >= x &&
          voxel.x < x + childOctantSize &&
          voxel.y >= y &&
          voxel.y < y + childOctantSize &&
          voxel.z >= z &&
          voxel.z < z + childOctantSize,
      );

      if (octantVoxels.length > 0) {
        childOctants[i] = {
          SIZE: [childOctantSize, childOctantSize, childOctantSize],
          XYZI: octantVoxels,
          RGBA: voxels.RGBA,
          VOX: octantVoxels.length,
        };
      }
    }

    // We can save space by only allocating up to the last child node
    let requiredChildNodes = 0;

    // Once we have the valid child octants, create a node for the current octant
    const childMask = childOctants.reduce((mask, octantVoxels, i) => {
      if (octantVoxels) {
        requiredChildNodes = i + 1;
        return setBit(mask, i);
      }
      return mask;
    }, 0);

    const totalVoxels = childOctants.reduce(
      (total, octantVoxels) => total + (octantVoxels ? octantVoxels.VOX : 0),
      0,
    );

    const isAllVoxelsFilled = totalVoxels === objectSize ** 3;

    if (isAllVoxelsFilled) {
      const paletteIndex = voxels.XYZI[0].c;
      this.nodes[startIndex] = {
        red: voxels.RGBA[paletteIndex].r,
        green: voxels.RGBA[paletteIndex].g,
        blue: voxels.RGBA[paletteIndex].b,
        x: offset[0],
        y: offset[1],
        z: offset[2],
        size: voxels.SIZE[0],
      };
      return;
    }

    // Allocate memory for child nodes
    const firstChildIndex = this.#mallocOctant(requiredChildNodes);
    const relativeIndex = firstChildIndex - startIndex;

    childOctants.forEach((octantVoxels, i) => {
      if (octantVoxels) {
        const childIndex = firstChildIndex + i;
        const origin = octantIndexToOffset(i);
        const x = offset[0] + origin[0] * childOctantSize;
        const y = offset[1] + origin[1] * childOctantSize;
        const z = offset[2] + origin[2] * childOctantSize;
        this.#build(octantVoxels, childIndex, [x, y, z], childDepth);
      }
    });

    averageFirstChildIndex += firstChildIndex;

    // Create the parent node
    this.nodes[startIndex] = {
      firstChildIndex: relativeIndex,
      childMask,
      voxels: { ...voxels, SIZE: [objectSize, objectSize, objectSize] },
      x: offset[0],
      y: offset[1],
      z: offset[2],
      size: objectSize,
      leafMask: 0,
    };
  }

  get totalSize() {
    return this.nodes.length * OCTREE_STRIDE;
  }
}

export const setLeafNode = (
  dataView: DataView,
  index: number,
  node: LeafNode,
) => {
  dataView.setUint8(index * OCTREE_STRIDE, 0);
  dataView.setUint8(index * OCTREE_STRIDE + 1, node.x);
  dataView.setUint8(index * OCTREE_STRIDE + 2, node.y);
  dataView.setUint8(index * OCTREE_STRIDE + 3, node.z);
  dataView.setUint8(index * OCTREE_STRIDE + 4, node.red);
  dataView.setUint8(index * OCTREE_STRIDE + 5, node.green);
  dataView.setUint8(index * OCTREE_STRIDE + 6, node.blue);
  dataView.setUint8(index * OCTREE_STRIDE + 7, Math.log2(node.size));
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
    node.x < 2 ** 8,
    `X position of ${node.x} is too large to fit in 1 byte`,
  );
  console.assert(
    node.y < 2 ** 8,
    `Y position of ${node.y} is too large to fit in 1 byte`,
  );
  console.assert(
    node.z < 2 ** 8,
    `Z position of ${node.z} is too large to fit in 1 byte`,
  );
  dataView.setUint8(index * OCTREE_STRIDE, node.childMask);
  dataView.setUint8(index * OCTREE_STRIDE + 1, node.x);
  dataView.setUint8(index * OCTREE_STRIDE + 2, node.y);
  dataView.setUint8(index * OCTREE_STRIDE + 3, node.z);
  dataView.setUint32(index * OCTREE_STRIDE + 4, node.firstChildIndex, true);
  dataView.setUint8(index * OCTREE_STRIDE + 7, Math.log2(node.size));
};

export const octreeToSharedArrayBuffer = (
  octree: Octree,
  buffer: SharedArrayBuffer,
) => {
  const view = new DataView(buffer);
  octree.nodes.forEach((node, i) => {
    if ("red" in node) {
      setLeafNode(view, i, node);
    } else {
      setInternalNode(view, i, node);
    }
  });

  console.debug(
    `Created ${octree.nodes.length} node octree of size ${(octree.totalSize / 1024 ** 2).toFixed(3)} MB`,
  );
};

export const octreeToArrayBuffer = (octree: Octree) => {
  const buffer = new ArrayBuffer(octree.totalSize + OCTREE_STRIDE);
  const view = new DataView(buffer);

  octree.nodes.forEach((node, i) => {
    if ("red" in node) {
      setLeafNode(view, i, node);
    } else {
      setInternalNode(view, i, node);
    }
  });

  console.debug(
    `Created ${octree.nodes.length} node octree of size ${(octree.totalSize / 1024 ** 2).toFixed(3)} MB`,
  );

  return buffer;
};

let octree: Octree;

export const createOctreeAndReturnBytes = (
  voxelsBuffer: SharedArrayBuffer,
  coloursBuffer: SharedArrayBuffer,
  size: [number, number, number],
) => {
  const arr = Array.from(new Uint8Array(voxelsBuffer));
  let XYZI: TVoxels["XYZI"] = [];
  for (let i = 0; i < arr.length; i += 4) {
    const x = arr[i];
    const y = arr[i + 1];
    const z = arr[i + 2];
    const c = arr[i + 3];
    if (x === 0 && y === 0 && z === 0 && c === 0 && i > 0) {
      break;
    }
    XYZI.push({
      x,
      y,
      z,
      c,
    });
  }

  const colours = Array.from(new Uint8Array(coloursBuffer));
  let RGBA: TVoxels["RGBA"] = [];

  for (let i = 0; i < colours.length; i += 4) {
    const r = colours[i];
    const g = colours[i + 1];
    const b = colours[i + 2];
    const a = colours[i + 3];
    RGBA.push({
      r,
      g,
      b,
      a,
    });
  }

  const voxels: TVoxels = {
    VOX: arr.length / 4,
    SIZE: size,
    XYZI,
    RGBA,
  };
  octree = new Octree(voxels);
  return octree.totalSize + OCTREE_STRIDE;
};

export const populateOctreeBuffer = (buffer: SharedArrayBuffer) => {
  octreeToSharedArrayBuffer(octree, buffer);
};
