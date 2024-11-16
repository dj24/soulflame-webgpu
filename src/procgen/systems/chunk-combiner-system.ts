import { ECS, Entity, System } from "@ecs/ecs";
import { VoxelObject } from "@renderer/voxel-object";
import { decodeTerrainName, encodeTerrainName } from "../sine-chunk";
import {
  deserialiseOctree,
  InternalNode,
  octantOffsetToIndex,
  OCTREE_STRIDE,
  setInternalNode,
} from "@renderer/octree/octree";
import { getGPUDeviceSingleton } from "../../abstractions/get-gpu-device-singleton";

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
  const totalBufferSize =
    OCTREE_STRIDE +
    voxelObject00.gpuBuffer.size +
    voxelObject10.gpuBuffer.size +
    voxelObject01.gpuBuffer.size +
    voxelObject11.gpuBuffer.size;
  const dataView = new DataView(new ArrayBuffer(totalBufferSize));
  const bitMask = 0b00001111;
  const internalNode00: InternalNode = {
    firstChildIndex: 0,
    childMask: bitMask,
    x: 0,
    y: 0,
    z: 0,
    size: 128,
  };
  const internalNode10: InternalNode = {
    firstChildIndex: 8,
    childMask: bitMask,
    x: 128,
    y: 0,
    z: 0,
    size: 128,
  };
  const internalNode01: InternalNode = {
    firstChildIndex: 16,
    childMask: bitMask,
    x: 0,
    y: 0,
    z: 128,
    size: 128,
  };
  const internalNode11: InternalNode = {
    firstChildIndex: 24,
    childMask: bitMask,
    x: 128,
    y: 0,
    z: 128,
    size: 128,
  };
  // setInternalNode(dataView, index00, internalNode00);
  // setInternalNode(dataView, index10, internalNode10);
  // setInternalNode(dataView, index01, internalNode01);
  // setInternalNode(dataView, index11, internalNode11);

  // const octree00 = deserialiseOctree(voxelObject00.

  const gpuBuffer = getGPUDeviceSingleton(ecs).device.createBuffer({
    size: totalBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const chunk00Position = decodeTerrainName(voxelObject00.name).position;

  // const combinedVoxelObject = new VoxelObject({
  //   name: encodeTerrainName(chunk00Position, [256, 256, 256]),
  //   size: [256, 256, 256],
  //   octreeBufferIndex: 0,
  //   gpuBuffer,
  // });

  console.log("Total buffer size", totalBufferSize);

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
