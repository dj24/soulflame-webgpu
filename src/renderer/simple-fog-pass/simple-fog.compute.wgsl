const DENSITY = 0.002;
const BLUE_FOG: vec3<f32> = vec3<f32>(0.0);
const YELLOW_FOG: vec3<f32> = vec3<f32>(0.1,0.4,0.8);


@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  var worldPos = textureLoad(worldPosTex, pixel, 0);
  var depth = worldPos.w;

  let fogDensity = clamp(depth * DENSITY, 0.0, 1.0);
  let rayDir = normalize(worldPos.xyz - cameraPosition);
  let sunAmount = max(dot(rayDir, sunDirection), 0.0 );
  let fogColor  = mix( BLUE_FOG, // blue
                       YELLOW_FOG, // yellow
                       pow(sunAmount,2.0));

  let fogAmount = 1.0 - exp(-fogDensity);
  let inputSample = textureLoad(inputTex, pixel, 0).xyz;
  let result = mix(inputSample, fogColor, fogAmount);
  textureStore(outputTex, pixel, vec4(result, 1));
}