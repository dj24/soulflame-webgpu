@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) id : vec3<u32>
) {
  let pixel = id.xy;
  let worldPos = textureLoad(worldPosTex, pixel, 0).xyz;

  if(distance(worldPos, cameraPosition) > 9999.0){
    return;
  }

  let relativeToCameraPos = worldPos;
  let lpvPos = relativeToCameraPos / LPV_SCALE;

  if(any(lpvPos < vec3(0.0)) || any(lpvPos > vec3(32.0))){
    return;
  }

  let lpvVoxel = vec3<u32>(lpvPos);
  let lpvSample = textureLoad(lpvTexRead, lpvVoxel, 0).rgb * 20.0;

  textureStore(outputTex, pixel, vec4<f32>(lpvSample, 1.0));
}