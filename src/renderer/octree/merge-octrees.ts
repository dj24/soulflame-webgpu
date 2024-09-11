import { VolumeAtlas } from "../volume-atlas";
import { InternalNode, OCTREE_STRIDE } from "@renderer/octree/octree";
import { setBit } from "@renderer/octree/bitmask";

// Merge 8 octree into a single larger octree
export const mergeOctrees = (
  volumeAtlas: VolumeAtlas,
  [
    octant1,
    octant2,
    octant3,
    octant4,
    octant5,
    octant6,
    octant7,
    octant8,
  ]: string[],
) => {
  const octantVolumeEntries = [
    volumeAtlas.dictionary[octant1],
    volumeAtlas.dictionary[octant2],
    volumeAtlas.dictionary[octant3],
    volumeAtlas.dictionary[octant4],
    volumeAtlas.dictionary[octant5],
    volumeAtlas.dictionary[octant6],
    volumeAtlas.dictionary[octant7],
    volumeAtlas.dictionary[octant8],
  ];

  const totalSizBytes = octantVolumeEntries.reduce(
    (acc, entry) => {
      if (!entry) {
        return acc;
      }
      return acc + entry.octreeSizeBytes;
    },
    OCTREE_STRIDE, // root node
  );

  console.log((totalSizBytes / 1024 ** 2).toFixed(2) + " MB");

  // const combinedBuffer = new SharedArrayBuffer(totalSizBytes);
  // const view = new DataView(combinedBuffer);

  let rootNode: InternalNode = {
    size: octantVolumeEntries[0].size[0] * 2,
    x: 0,
    y: 0,
    z: 0,
    childMask: 0,
    firstChildIndex: 1,
  };

  octantVolumeEntries.forEach((entry, i) => {
    if (!entry) {
      return;
    }
    rootNode.childMask = setBit(rootNode.childMask, i);
  });

  console.log({ rootNode });

  // TODO: figure out how to update octant x, y, z
};
