@group(0) @binding(0) var<storage, read_write> noiseField : array<f32>;
@group(0) @binding(1) var<storage, read_write> bitmasksCurrent : array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> bitmasksPrevious : array<atomic<u32>>;

override volumeSize: u32 = 1;

fn convert3Dto1D(
  x : u32,
  y : u32,
  z : u32,
) -> u32 {
  return x + y * volumeSize + z * volumeSize * volumeSize;
}

fn getBit(value: u32, bitIndex: u32) -> bool {
  return (value & (1u << bitIndex)) != 0;
}

fn setBit(value: u32, bitIndex: u32, bitValue: bool) -> u32 {
  if (bitValue) {
    return value | (1u << bitIndex);
  } else {
    return value & ~(1u << bitIndex);
  }
}

fn octantOffsetToIndex(offset: vec3<u32>) -> u32 {
  return offset.x + offset.y * 2u + offset.z * 4u;F
}

@compute @workgroup_size(4, 4, 4)
fn fill(
 @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {

}

@compute @workgroup_size(4, 4, 4)
fn group(
 @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let index = convert3Dto1D(
    GlobalInvocationID.x,
    GlobalInvocationID.y,
    GlobalInvocationID.z
  );
  for(var x = 0; x < 2; x++){
    for(var y = 0; y < 2; y++){
      for(var z = 0; z < 2; z++){
        let offset = vec3<u32>(x, y, z);
        let octantIndex = octantOffsetToIndex(offset);
        let childIndex = convert3Dto1D(
          GlobalInvocationID.x * 2u + x,
          GlobalInvocationID.y * 2u + y,
          GlobalInvocationID.z * 2u + z
        );
        let childValue = bitMasksPrevious[childIndex];
        if(childValue > 0u){
          let current = atomicLoad(&bitmasksCurrent[index]);
          let newValue = setBit(current, octantIndex, true);
          atomicStore(&bitmasksCurrent[index], newValue);
        }
      }
    }
  }
}