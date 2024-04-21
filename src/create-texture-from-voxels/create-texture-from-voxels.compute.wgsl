@group(0) @binding(0) var output : texture_storage_3d<rgba8unorm, write>;
@group(0) @binding(1) var<storage, read_write> voxelBuffer: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> paletteBuffer: array<vec4<f32>>;

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