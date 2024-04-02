/* 8x8x8 bits
  vec4 for packing, 64 bytes in total
*/
struct Brick {
  voxels: array<u32, 16>
}

@group(0) @binding(0) var<storage, read_write> voxelBuffer: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> brickMapBuffer: array<Brick>;
@group(0) @binding(2) var voxels : texture_3d<f32>;


// Size in each dimension, 8x8x8
const BRICK_SIZE = 8;

fn convert1DTo3D(size: vec3<u32>, index: u32) -> vec3<u32> {
  return vec3(
    index % size.x,
    index / size.y,
    index / (size.x * size.y)
  );
}

fn convert3DTo1D(size: vec3<u32>, position: vec3<u32>) -> u32 {
  return position.x + position.y * size.x + position.z * (size.x * size.y);
}

// sets bit in a 32-bit integer
fn setBit(value: ptr<function, u32>, bit: bool){
  if(bit) {
    *value = *value | 1;
  } else {
    *value = *value & 0xFFFFFFFE;
  }
}



// sets bit in 512bit bitmask in a brick
// bitIndex is the index of the bit in the bitmask, 0-511
fn setBitInBrick(brick: ptr<function, Brick>, bitIndex: u32, bit: bool) {
  let maskIndex = bitIndex / 32;
  let bitIndexInMask = bitIndex % 32;
  setBit(&brick.voxels[maskIndex], bit);
}

fn getBit(value: u32, bitIndex: u32) -> bool {
  return (value & (1u << bitIndex)) != 0;
}

// gets bit in 512bit bitmask in a brick
// bitIndex is the index of the bit in the bitmask, 0-511
fn getBitInBrick(brick: Brick, bitIndex: u32) -> bool {
  let maskIndex = bitIndex / 32;
  let bitIndexInMask = bitIndex % 32;
  return getBit(brick.voxels[maskIndex], bitIndexInMask);
}

@compute @workgroup_size(64, 1, 1)
 fn main(
   @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
 ) {
    let index = GlobalInvocationID.x;
    let voxel = voxelBuffer[index];
    let position = voxel.xyz;
    let brickIndex = convert3DTo1D(textureDimensions(voxels).xyz / BRICK_SIZE, position / BRICK_SIZE);    let brick = brickMapBuffer[brickIndex];

    // TODO: set bits in brick
    var newBrick = Brick();
    var filled4Bytes = pack4xU8(vec4<u32>(255));
    var fullBrickBitMask = array<u32, 16>(
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
      filled4Bytes,
    );
    newBrick.voxels = fullBrickBitMask;
    brickMapBuffer[brickIndex] = newBrick;
 }

@compute @workgroup_size(1,1,1)
fn texture(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let brickPosition = GlobalInvocationID;
  let brickIndex = convert3DTo1D(textureDimensions(voxels).xyz / BRICK_SIZE, brickPosition);
  var newBrick = Brick();

  for(var x = 0u; x < BRICK_SIZE; x = x + 1u) {
    for(var y = 0u; y < BRICK_SIZE; y = y + 1u) {
      for(var z = 0u; z < BRICK_SIZE; z = z + 1u) {
        let positionInBrick = vec3<u32>(x, y, z);
        let position = brickPosition * BRICK_SIZE + positionInBrick;
        let isVoxelFilled = textureLoad(voxels, position, 0).a > 0.0;
        if(isVoxelFilled) {
          let bitIndex = convert3DTo1D(vec3<u32>(BRICK_SIZE), positionInBrick);
//          setBitInBrick(&newBrick, bitIndex, true);
        }
      }
    }
  }
   var filled4Bytes = pack4xU8(vec4<u32>(255));
  var fullBrickBitMask = array<u32, 16>(
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  );
//   newBrick.voxels = fullBrickBitMask;
  setBitInBrick(&newBrick, 0, true);
  setBitInBrick(&newBrick, 1, true);
  setBitInBrick(&newBrick, 2, true);

  brickMapBuffer[brickIndex] = newBrick;

}
