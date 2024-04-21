@group(0) @binding(0) var voxels : texture_3d<f32>;
/*
  at parent nodes, node value is a bitmask for child nodes
  at leaf nodes, node value is a pallette position (0-255)
  256^3 volume will be 16mb non-sparse
  TODO: find a way to quantize generated terrain colours into a palette of 256 colors
*/
@group(0) @binding(1) var<storage, read_write> octreeBuffer : array<u32>;

override maxOctreeDepth: u32;

const NODES_PER_LEVEL = 8u;

fn setBitAtPosition(value: u32, position: u32, bit: bool) -> u32 {
  if (bit) {
    return value | (1u << position);
  } else {
    return value & ~(1u << position);
  }
}

fn geometricSum(base: u32, exponent: u32) -> u32 {
  return (pow(base, exponent + 1u) - 1u) / (base - 1u);
}

/*
  Fills octree buffer based on 3d texture of voxels
  Starts from leaf nodes (level 0) and works up to parent nodes (level maxOctreeDepth)

  Breadth-first  octree, starting at leaf nodes
  [Level0Node0, Level0Node1, Level0Node2, ...Level0NodeN, Level1Node0, Level1Node1, ..Level1NodeN, Level2Node0, ...]
*/
@compute @workgroup_size(4, 4, 4)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
){
  let baseVoxelId = GlobalInvocationID;
  let dimensions = textureDimensions(voxels, 0);
  let width = dimensions.x;
  let height = dimensions.y;
  let depth = dimensions.z;

  let isVoxelFilled = textureLoad(voxels, voxelId, 0).a > 0.0;
  if(!isVoxelFilled) {
    continue;
  }

  /*
  0 = set leaf node to 255u (white for now, will be pallete index later)
  1-n = get 0-7 index within level, set bit at that index to 1
  */
  for(var currentLevel= 0u; currentLevel <= maxOctreeDepth; currentLevel++)
  {
    // Position of voxel within current level, (256,256,256) at level 0 = (128,128,128) at level 1
    let octreePos: vec3<u32> = voxelId.x >> currentLevel;
    // Index of node within current level
    let nodeIndexWithinLevel = octreePos.x + octreePos.y * NODES_PER_LEVEL + octreePos.z * NODES_PER_LEVEL * NODES_PER_LEVEL;
    // Nodes up until current level
    let nodesBeforeLevel = geometricSum(NODES_PER_LEVEL, maxOctreeDepth - currentLevel);
    let nodeIndex = nodeIndexWithinLevel + nodesBeforeLevel;

    let nodeIsLeaf = currentLevel == 0u;
    if(nodeIsLeaf) {
      octreeBuffer[nodeIndex] = 255u;
    } else{
      let childLevel = currentLevel - 1u;
      let childOctreePos = voxelId.x >> childLevel;
      // Position of voxel within this node's ocants (2x2x2)
      let octantPos = octreePos * 2u - childOctreePos;
      // Convert octant position to child index within parent node (0-2,0-2,0-2) -> 0-8
      let childIndexWithinParent = octantPos.x + octantPos.y * 2u + octantPos.z * 2u * 2u;
      // TODO: use atomic operation here instead of overwriting
      octreeBuffer[nodeIndex] = setBitAtPosition(octreeBuffer[nodeIndex], childIndexWithinParent, true);
    }
  }
}