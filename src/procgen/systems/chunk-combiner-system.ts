import { ECS, Entity, System } from "@ecs/ecs";
import { VoxelObject } from "@renderer/voxel-object";
import { decodeTerrainName, encodeTerrainName } from "../sine-chunk";
import {
  deserialiseInternalNode,
  InternalNode,
  octantOffsetToIndex,
  OCTREE_STRIDE,
  OctreeNode,
  setInternalNode,
  updateRootOffset,
} from "@renderer/octree/octree";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";
import { setBit } from "@renderer/octree/bitmask";
import { Transform } from "@renderer/components/transform";
import { quat } from "wgpu-matrix";
import { animate, spring } from "motion";

const findEntityByVoxelObjectName = (
  ecs: ECS,
  entities: Set<Entity>,
  name: string,
) => {
  for (const entity of entities) {
    const components = ecs.getComponents(entity);
    const voxelObject = components.get(VoxelObject);
    if (voxelObject.name === name) {
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
  const chunk00Position = decodeTerrainName(voxelObject00.name).position;
  const chunk10Position = decodeTerrainName(voxelObject10.name).position;
  const chunk01Position = decodeTerrainName(voxelObject01.name).position;
  const chunk11Position = decodeTerrainName(voxelObject11.name).position;

  // Translate the octrees to the correct position in the combined buffer
  updateRootOffset(voxelObject10.octreeBuffer, chunk10Position);
  updateRootOffset(voxelObject01.octreeBuffer, chunk01Position);
  updateRootOffset(voxelObject11.octreeBuffer, chunk11Position);

  // Trim the root node from the octree buffers
  voxelObject00.octreeBuffer = voxelObject00.octreeBuffer.slice(OCTREE_STRIDE);
  voxelObject10.octreeBuffer = voxelObject10.octreeBuffer.slice(OCTREE_STRIDE);
  voxelObject01.octreeBuffer = voxelObject01.octreeBuffer.slice(OCTREE_STRIDE);
  voxelObject11.octreeBuffer = voxelObject11.octreeBuffer.slice(OCTREE_STRIDE);

  // Add the root node to the combined buffer
  const rootNode: InternalNode = {
    firstChildIndex: 1,
    childMask: bitMask,
    x: 0,
    y: 0,
    z: 0,
    size: 256,
  };
  setInternalNode(dataView, 0, rootNode);

  // Copy the octree buffers into the combined buffer
  let firstChildIndex = 9;
  const root00NewIndex = 1 + index00;
  const relativeFirstChildIndexFor00 = firstChildIndex - root00NewIndex;
  const root00: InternalNode = {
    ...deserialiseInternalNode(voxelObject00.octreeBuffer, 0),
    firstChildIndex: relativeFirstChildIndexFor00,
  };
  setInternalNode(dataView, root00NewIndex, root00);
  uint8Array.set(
    new Uint8Array(voxelObject00.octreeBuffer),
    firstChildIndex * OCTREE_STRIDE,
  );

  firstChildIndex += voxelObject00.octreeBuffer.byteLength / OCTREE_STRIDE;
  const rootNode00NewIndex = 1 + index10;
  const relativeFirstChildIndexFor10 = firstChildIndex - rootNode00NewIndex;
  let root10 = {
    ...deserialiseInternalNode(voxelObject10.octreeBuffer, 0),
    firstChildIndex: relativeFirstChildIndexFor10,
  };
  setInternalNode(dataView, rootNode00NewIndex, root10);
  uint8Array.set(
    new Uint8Array(voxelObject10.octreeBuffer),
    firstChildIndex * OCTREE_STRIDE,
  );

  firstChildIndex += voxelObject10.octreeBuffer.byteLength / OCTREE_STRIDE;
  const rootNode01NewIndex = 1 + index01;
  const relativeFirstChildIndexFor01 = firstChildIndex - root00NewIndex;
  let root01 = {
    ...deserialiseInternalNode(voxelObject01.octreeBuffer, 0),
    firstChildIndex: relativeFirstChildIndexFor01,
  };
  setInternalNode(dataView, rootNode01NewIndex, root01);
  uint8Array.set(
    new Uint8Array(voxelObject01.octreeBuffer),
    firstChildIndex * OCTREE_STRIDE,
  );

  firstChildIndex += voxelObject01.octreeBuffer.byteLength / OCTREE_STRIDE;
  const rootNode11NewIndex = 1 + index11;
  const relativeFirstChildIndexFor11 = firstChildIndex - rootNode11NewIndex;
  let root11 = {
    ...deserialiseInternalNode(voxelObject11.octreeBuffer, 0),
    firstChildIndex: relativeFirstChildIndexFor11,
  };
  setInternalNode(dataView, rootNode11NewIndex, root11);
  uint8Array.set(
    new Uint8Array(voxelObject11.octreeBuffer),
    firstChildIndex * OCTREE_STRIDE,
  );

  let debugArr: OctreeNode[] = [];
  for (let i = 0; i < 9; i++) {
    debugArr.push(deserialiseInternalNode(dataView.buffer, i * OCTREE_STRIDE));
  }
  console.log(debugArr);

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
    name: encodeTerrainName(chunk00Position, [256, 256, 256]),
    size: [256, 256, 256],
    octreeBufferIndex: 0,
    gpuBuffer,
    octreeBuffer: dataView.buffer,
  });
  ecs.addComponent(newEntity, combinedVoxelObject);
  const transform = new Transform(
    chunk00Position,
    quat.fromEuler(0, 0, 0, "xyz"),
    [0, 0, 0],
  );
  animate(
    (progress) => {
      transform.scale = [progress, progress, progress];
    },
    {
      duration: 1.0,
      easing: spring({
        damping: 100,
      }),
    },
  );
  ecs.addComponent(newEntity, transform);

  // Remove the old entities
  ecs.removeEntity(chunk00);
  ecs.removeEntity(chunk10);
  ecs.removeEntity(chunk01);
  ecs.removeEntity(chunk11);
};

export class ChunkCombinerSystem extends System {
  componentsRequired = new Set([VoxelObject]);

  update(entities: Set<Entity>) {
    for (const entity of entities) {
      const components = this.ecs.getComponents(entity);
      const voxelObject = components.get(VoxelObject);
      const { position, size } = decodeTerrainName(voxelObject.name);
      if (position[0] % 256 === 0 && position[2] % 256 === 0) {
        const chunk01 = findEntityByVoxelObjectName(
          this.ecs,
          entities,
          encodeTerrainName(
            [position[0] + 128, position[1], position[2]],
            [size[0], size[1], size[2]],
          ),
        );
        const chunk10 = findEntityByVoxelObjectName(
          this.ecs,
          entities,
          encodeTerrainName(
            [position[0], position[1], position[2] + 128],
            [size[0], size[1], size[2]],
          ),
        );
        const chunk11 = findEntityByVoxelObjectName(
          this.ecs,
          entities,
          encodeTerrainName(
            [position[0] + 128, position[1], position[2] + 128],
            [size[0], size[1], size[2]],
          ),
        );
        if (chunk01 && chunk10 && chunk11) {
          combineChunks(this.ecs, entity, chunk01, chunk10, chunk11);
        }
      }
    }
  }
}
