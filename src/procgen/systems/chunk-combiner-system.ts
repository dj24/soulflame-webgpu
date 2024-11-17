import { ECS, Entity, System } from "@ecs/ecs";
import { VoxelObject } from "@renderer/voxel-object";
import { encodeTerrainName } from "../sine-chunk";
import {
  deserialiseInternalNode,
  InternalNode,
  octantOffsetToIndex,
  OCTREE_STRIDE,
  OctreeNode,
  setInternalNode,
  setLeafNode,
  updateRootOffset,
} from "@renderer/octree/octree";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";
import { setBit } from "@renderer/octree/bitmask";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";
import { TerrainChunk } from "../components/terrain-chunk";

const findEntityByTerrainDetails = (
  ecs: ECS,
  entities: Set<Entity>,
  size: number,
  position: [number, number, number],
) => {
  for (const entity of entities) {
    const components = ecs.getComponents(entity);
    const terrainChunk = components.get(TerrainChunk);
    if (
      terrainChunk.size === size &&
      terrainChunk.position[0] === position[0] &&
      terrainChunk.position[2] === position[2]
    ) {
      return entity;
    }
  }
  return null;
};

const combineChunks = (
  ecs: ECS,
  chunk00: Entity,
  chunk10: Entity,
  chunk01: Entity,
  chunk11: Entity,
) => {
  const voxelObject00 = ecs.getComponents(chunk00).get(VoxelObject);
  const voxelObject10 = ecs.getComponents(chunk10).get(VoxelObject);
  const voxelObject01 = ecs.getComponents(chunk01).get(VoxelObject);
  const voxelObject11 = ecs.getComponents(chunk11).get(VoxelObject);

  const terrainChunk00 = ecs.getComponents(chunk00).get(TerrainChunk);
  const combinedWidth = terrainChunk00.size * 2;

  const index00 = octantOffsetToIndex([0, 0, 0]);
  const index10 = octantOffsetToIndex([1, 0, 0]);
  const index01 = octantOffsetToIndex([0, 0, 1]);
  const index11 = octantOffsetToIndex([1, 0, 1]);

  // Root node is being removed and replaced with a new root node
  const chunk00OctreeSizeBytes =
    voxelObject00.octreeBuffer.byteLength - OCTREE_STRIDE;
  const chunk10OctreeSizeBytes =
    voxelObject10.octreeBuffer.byteLength - OCTREE_STRIDE;
  const chunk01OctreeSizeBytes =
    voxelObject01.octreeBuffer.byteLength - OCTREE_STRIDE;
  const chunk11OctreeSizeBytes =
    voxelObject11.octreeBuffer.byteLength - OCTREE_STRIDE;

  const totalBufferSize =
    OCTREE_STRIDE * 9 +
    chunk00OctreeSizeBytes +
    chunk10OctreeSizeBytes +
    chunk01OctreeSizeBytes +
    chunk11OctreeSizeBytes;
  const arrayBuffer = new ArrayBuffer(totalBufferSize);
  const dataView = new DataView(arrayBuffer);
  const uint8Array = new Uint8Array(arrayBuffer);

  // Set the bitmask for the root node
  let bitMask = 0;
  bitMask = setBit(bitMask, index00);
  bitMask = setBit(bitMask, index10);
  bitMask = setBit(bitMask, index01);
  bitMask = setBit(bitMask, index11);

  // Get the position of each chunk
  const chunk00Position = terrainChunk00.position;

  // Translate the octrees to the correct position in the combined buffer
  updateRootOffset(voxelObject10.octreeBuffer, [terrainChunk00.size, 0, 0]);
  updateRootOffset(voxelObject01.octreeBuffer, [0, 0, terrainChunk00.size]);
  updateRootOffset(voxelObject11.octreeBuffer, [
    terrainChunk00.size,
    0,
    terrainChunk00.size,
  ]);

  // Get root node of each chunk before slicing the buffers
  let root00: InternalNode = deserialiseInternalNode(
    voxelObject00.octreeBuffer,
    0,
  );
  let root10: InternalNode = deserialiseInternalNode(
    voxelObject10.octreeBuffer,
    0,
  );
  let root01: InternalNode = deserialiseInternalNode(
    voxelObject01.octreeBuffer,
    0,
  );
  let root11: InternalNode = deserialiseInternalNode(
    voxelObject11.octreeBuffer,
    0,
  );

  // Trim the root node from the octree buffers
  voxelObject00.octreeBuffer = voxelObject00.octreeBuffer.slice(OCTREE_STRIDE);
  voxelObject10.octreeBuffer = voxelObject10.octreeBuffer.slice(OCTREE_STRIDE);
  voxelObject01.octreeBuffer = voxelObject01.octreeBuffer.slice(OCTREE_STRIDE);
  voxelObject11.octreeBuffer = voxelObject11.octreeBuffer.slice(OCTREE_STRIDE);

  // Get the maximum size of the Y axis, so we can crop the combined voxel object
  let maxSizeY = voxelObject00.size[1];
  maxSizeY = Math.max(maxSizeY, voxelObject10.size[1]);
  maxSizeY = Math.max(maxSizeY, voxelObject01.size[1]);
  maxSizeY = Math.max(maxSizeY, voxelObject11.size[1]);

  // Add the root node to the combined buffer
  const rootNode: InternalNode = {
    firstChildIndex: 1,
    childMask: bitMask,
    x: 0,
    y: 0,
    z: 0,
    size: combinedWidth,
  };
  setInternalNode(dataView, 0, rootNode);

  // Copy the octree buffers into the combined buffer
  let firstChildIndex = 9;
  const root00NewIndex = 1 + index00;
  root00.firstChildIndex = firstChildIndex - root00NewIndex;
  setInternalNode(dataView, root00NewIndex, root00);
  uint8Array.set(
    new Uint8Array(voxelObject00.octreeBuffer),
    firstChildIndex * OCTREE_STRIDE,
  );

  firstChildIndex += voxelObject00.octreeBuffer.byteLength / OCTREE_STRIDE;
  const root10NewIndex = 1 + index10;
  root10.firstChildIndex = firstChildIndex - root10NewIndex;
  setInternalNode(dataView, root10NewIndex, root10);
  uint8Array.set(
    new Uint8Array(voxelObject10.octreeBuffer),
    firstChildIndex * OCTREE_STRIDE,
  );

  firstChildIndex += voxelObject10.octreeBuffer.byteLength / OCTREE_STRIDE;
  const rootNode01NewIndex = 1 + index01;
  root01.firstChildIndex = firstChildIndex - root00NewIndex;
  setLeafNode(dataView, rootNode01NewIndex, {
    x: root01.x,
    y: root01.y,
    z: root01.z,
    red: 255,
    green: 0,
    blue: 0,
    size: root01.size,
  });
  // setInternalNode(dataView, rootNode01NewIndex, root01);
  // uint8Array.set(
  //   new Uint8Array(voxelObject01.octreeBuffer),
  //   firstChildIndex * OCTREE_STRIDE,
  // );

  firstChildIndex += voxelObject01.octreeBuffer.byteLength / OCTREE_STRIDE;
  const rootNode11NewIndex = 1 + index11;
  root11.firstChildIndex = firstChildIndex - rootNode11NewIndex;
  setInternalNode(dataView, rootNode11NewIndex, root11);
  uint8Array.set(
    new Uint8Array(voxelObject11.octreeBuffer),
    firstChildIndex * OCTREE_STRIDE,
  );

  let debugArr: OctreeNode[] = [];
  for (let i = 0; i < 9; i++) {
    debugArr.push(deserialiseInternalNode(dataView.buffer, i * OCTREE_STRIDE));
  }
  console.log("debugArr", debugArr);

  // Copy the buffer to the GPU
  const gpuBuffer = getGPUDeviceSingleton(ecs).device.createBuffer({
    size: totalBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  getGPUDeviceSingleton(ecs).device.queue.writeBuffer(
    gpuBuffer,
    0,
    dataView.buffer,
  );

  // Create a new entity with the combined voxel object
  const newEntity = ecs.addEntity();
  const combinedVoxelObject = new VoxelObject({
    name: encodeTerrainName(chunk00Position, [
      combinedWidth,
      combinedWidth,
      combinedWidth,
    ]),
    size: [combinedWidth, maxSizeY, combinedWidth],
    octreeBufferIndex: 0,
    gpuBuffer,
    octreeBuffer: dataView.buffer,
  });
  console.log(
    "combined ",
    combinedVoxelObject.name,
    " 00 ",
    voxelObject00.name,
  );
  ecs.addComponent(newEntity, combinedVoxelObject);
  const [x, y, z] = chunk00Position;
  const transform = new Transform(
    [
      x + combinedWidth / 2,
      y - (combinedWidth / 2 - maxSizeY) / 2,
      z + combinedWidth / 2,
    ],
    quat.fromEuler(0, 0, 0, "xyz"),
    [1, 1, 1],
  );
  ecs.addComponent(newEntity, transform);
  ecs.addComponent(newEntity, new TerrainChunk(combinedWidth, chunk00Position));

  // Remove the old entities
  ecs.removeEntity(chunk00);
  ecs.removeEntity(chunk10);
  ecs.removeEntity(chunk01);
  ecs.removeEntity(chunk11);
};

export class ChunkCombinerSystem extends System {
  targetSize: number;
  componentsRequired = new Set([VoxelObject, TerrainChunk]);

  constructor(size: number) {
    super();
    this.targetSize = size;
  }

  update(entities: Set<Entity>) {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const { position, size } = components.get(TerrainChunk);
      if (
        position[0] % (this.targetSize * 2) === 0 &&
        position[2] % (this.targetSize * 2) === 0 &&
        size === this.targetSize &&
        size === this.targetSize
      ) {
        const chunk10 = findEntityByTerrainDetails(
          this.ecs,
          entities,
          this.targetSize,
          [position[0] + this.targetSize, position[1], position[2]],
        );
        const chunk01 = findEntityByTerrainDetails(
          this.ecs,
          entities,
          this.targetSize,
          [position[0], position[1], position[2] + this.targetSize],
        );
        const chunk11 = findEntityByTerrainDetails(
          this.ecs,
          entities,
          this.targetSize,
          [
            position[0] + this.targetSize,
            position[1],
            position[2] + this.targetSize,
          ],
        );
        if (chunk01 && chunk10 && chunk11) {
          combineChunks(this.ecs, entity, chunk10, chunk01, chunk11);
        }
      }
    }
  }
}
