@compute @workgroup_size(64, 1, 1)
 fn main(
   @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
 ) {
    let index = GlobalInvocationID.x;
    let voxel = voxelBuffer[index];
    let paletteIndex = voxel.w;
    let position = voxel.xyz;
    let color = paletteBuffer[paletteIndex];
    textureStore(output, position, color);
 }