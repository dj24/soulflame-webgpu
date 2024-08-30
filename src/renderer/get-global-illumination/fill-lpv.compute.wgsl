// Spherical Harmonics basis functions (L=1)
fn SHBasis(lightDir: vec3<f32>) -> vec4<f32> {
    let sh0 = 0.282095; // Y_0^0 (constant term)
    let sh1 = 0.488603 * lightDir.x; // Y_1^-1
    let sh2 = 0.488603 * lightDir.y; // Y_1^0
    let sh3 = 0.488603 * lightDir.z; // Y_1^1

    return vec4<f32>(sh0, sh1, sh2, sh3);
}

const SUN_COLOUR = vec3<f32>(5., 5., 5.);


@compute @workgroup_size(4, 4, 4)
fn main(
    @builtin(global_invocation_id) voxel : vec3<u32>
) {
  let shBasisR = SHBasis(sunDirection) * SUN_COLOUR.r;
  let shBasisG = SHBasis(sunDirection) * SUN_COLOUR.g;
  let shBasisB = SHBasis(sunDirection) * SUN_COLOUR.b;

  let redVoxelPos = voxel;
  let greenVoxelPos = voxel + vec3<u32>(32, 0, 0);
  let blueVoxelPos = voxel + vec3<u32>(64, 0, 0);

  textureStore(lpvTexWrite, redVoxelPos, shBasisR);
  textureStore(lpvTexWrite, greenVoxelPos, shBasisG);
  textureStore(lpvTexWrite, blueVoxelPos, shBasisB);

}