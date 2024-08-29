const LPV_SCALE = 10.0;

@compute @workgroup_size(4, 4, 4)
fn fill(
    @builtin(global_invocation_id) voxel : vec3<u32>
) {
  // Checkerboard pattern to debug
  let color = vec3<f32>(voxel) / 32.0;
  textureStore(lpvTexWrite, voxel, vec4(color, 1));
}

@compute @workgroup_size(8, 8, 1)
fn composite(
    @builtin(global_invocation_id) id : vec3<u32>
) {
  let pixel = id.xy;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;
  let relativeToCameraPos = worldPos - cameraPosition;
  let lpvPos = relativeToCameraPos / LPV_SCALE;
  let lpvVoxel = vec3<u32>(lpvPos);
  let lpvSample = textureLoad(lpvTexRead, lpvVoxel, 0).rgb * 20.0;

  textureStore(outputTex, pixel, vec4<f32>(lpvSample, 1.0));
}