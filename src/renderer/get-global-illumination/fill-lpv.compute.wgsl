@compute @workgroup_size(4, 4, 4)
fn main(
    @builtin(global_invocation_id) voxel : vec3<u32>
) {
  // Checkerboard pattern to debug
  let cellOrigin = vec3<f32>(voxel) * LPV_SCALE;
  let cellCentre = cellOrigin + LPV_SCALE / 2.0;
  let rayDirection = sunDirection;
  let rayMarchResult = rayMarchBVH(cellCentre, rayDirection);
  let colour = rayMarchResult.colour;
  textureStore(lpvTexWrite, voxel, vec4(colour, 1));
}