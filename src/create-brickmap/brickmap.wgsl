/* 8x8x8 bits
  vec4 for packing, 64 bytes in total
  each vec4 represents 8x8x2 bits
*/
struct Brick {
  voxelSlices: array<vec4<u32>, 4>
}

@group(0) @binding(0) var<storage, read_write> voxelBuffer: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> brickMapBuffer: array<Brick>;


// Size in each dimension, 8x8x8
const BRICK_SIZE = 8;


fn getBrickIndex(x: u32, y: u32, z: u32) -> u32 {
  return x + y * BRICK_SIZE + z * BRICK_SIZE * BRICK_SIZE;
}


@compute @workgroup_size(64, 1, 1)
 fn main(
   @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
 ) {
    let index = GlobalInvocationID.x;
    let voxel = voxelBuffer[index];
    let position = voxel.xyz;
    let brickIndex = getBrickIndex(position.x / BRICK_SIZE, position.y / BRICK_SIZE, position.z / BRICK_SIZE);
    let brick = brickMapBuffer[brickIndex];

    // TODO: set bits in brick
    var newBrick = Brick();
    newBrick.voxelSlices[0] = vec4<u32>(1);
    newBrick.voxelSlices[1] = vec4<u32>(2);
    newBrick.voxelSlices[2] = vec4<u32>(3);
    newBrick.voxelSlices[3] = vec4<u32>(4);
    brickMapBuffer[brickIndex] = newBrick;
 }