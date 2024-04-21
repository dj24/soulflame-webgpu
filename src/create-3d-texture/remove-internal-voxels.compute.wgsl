@group(0) @binding(0) var input : texture_3d<f32>;
@group(0) @binding(1) var output : texture_storage_3d<rgba8unorm, write>;

const FACES_PER_CUBE = 6;

// if all face of the voxel are covered, we remove the inner voxel
const NEIGHBOUR_POSITIONS = array<vec3<i32>, FACES_PER_CUBE>(
    vec3<i32>(-1, 0, 0),
    vec3<i32>(1, 0, 0),
    vec3<i32>(0, -1, 0),
    vec3<i32>(0, 1, 0),
    vec3<i32>(0, 0, -1),
    vec3<i32>(0, 0, 1),
);

@compute @workgroup_size(4, 4, 4)
 fn main(
   @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
 ) {
    var texel = textureLoad(input, GlobalInvocationID, 0);
    if(texel.a == 0) {
        return;
    }
    for(var i = 0; i < FACES_PER_CUBE; i++) {
        let neighbourPosition = vec3<i32>(GlobalInvocationID.xyz) + NEIGHBOUR_POSITIONS[i];
        let neighbourTexel = textureLoad(input, vec3(u32(neighbourPosition.x), u32(neighbourPosition.y), u32(neighbourPosition.z)), 0);
        if(neighbourTexel.a == 0) {
            textureStore(output, GlobalInvocationID.xyz, texel);
            return;
        }
    }
    textureStore(output, GlobalInvocationID.xyz, vec4(0, 0, 0, 0));
 }