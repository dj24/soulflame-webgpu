// Spherical Harmonics basis functions (L=1)
fn SHBasis(lightDir: vec3<f32>) -> vec4<f32> {
    let sh0 = 0.282095; // Y_0^0 (constant term)
    let sh1 = 0.488603 * lightDir.x; // Y_1^-1
    let sh2 = 0.488603 * lightDir.y; // Y_1^0
    let sh3 = 0.488603 * lightDir.z; // Y_1^1

    return vec4<f32>(sh0, sh1, sh2, sh3);
}

const SUN_COLOUR = vec3<f32>(1.);
const POINT_LIGHT_COLOUR = vec3<f32>(400., 100., 100.);
const VOXEL_CORNERS = array<vec3<f32>, 8>(
  vec3<f32>(0.0, 0.0, 0.0),
  vec3<f32>(1.0, 0.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0),
  vec3<f32>(1.0, 1.0, 0.0),
  vec3<f32>(0.0, 0.0, 1.0),
  vec3<f32>(1.0, 0.0, 1.0),
  vec3<f32>(0.0, 1.0, 1.0),
  vec3<f32>(1.0, 1.0, 1.0)
);

const PREVIOUS_BLEND = 0.02;

@compute @workgroup_size(4, 4, 4)
fn main(
    @builtin(global_invocation_id) voxel : vec3<u32>
) {
  let lpvTexDim = textureDimensions(lpvTexWrite);
  let pointLightPos = vec3<f32>(15.,22.0, 95.);
  let voxelOrigin = vec3<f32>(voxel) * f32(LPV_SCALE);
  let voxelCenter = voxelOrigin + vec3(f32(LPV_SCALE) * 0.5) + randomInUnitSphere(vec2(time.elapsed, -time.elapsed)) * f32(LPV_SCALE) * 0.5;
  let pointLightDir = normalize(pointLightPos - voxelCenter);
  var pointLightAttenuation = 1.0 / length(pointLightPos - voxelCenter);


  var sunLightAttenuation = vec3(50.0);
  let sunRayMarch = rayMarchBVH(voxelCenter, sunDirection);
  if(sunRayMarch.hit){
    sunLightAttenuation = sunRayMarch.colour * 10.0;
  }

  let sunSHBasisR = SHBasis(sunDirection) * SUN_COLOUR.r * sunLightAttenuation.r;
  let sunSHBasisG = SHBasis(sunDirection) * SUN_COLOUR.g * sunLightAttenuation.g;
  let sunSHBasisB = SHBasis(sunDirection) * SUN_COLOUR.b * sunLightAttenuation.b;

  let lightSHBasisR = SHBasis(pointLightDir) * POINT_LIGHT_COLOUR.r * pointLightAttenuation;
  let lightSHBasisG = SHBasis(pointLightDir) * POINT_LIGHT_COLOUR.g * pointLightAttenuation;
  let lightSHBasisB = SHBasis(pointLightDir) * POINT_LIGHT_COLOUR.b * pointLightAttenuation;

  let previousRedBasis = textureLoad(previousLpvTex, voxel, 0);
  let previousGreenBasis = textureLoad(previousLpvTex, voxel + vec3<u32>(lpvTexDim.z + 1, 0, 0), 0);
  let previousBlueBasis = textureLoad(previousLpvTex, voxel + vec3<u32>(lpvTexDim.z * 2 + 2, 0, 0), 0);

  let currentRedBasis =  sunSHBasisR + lightSHBasisR;
  let currentGreenBasis = sunSHBasisG + lightSHBasisG;
  let currentBlueBasis = sunSHBasisB + lightSHBasisB;

  let redBasis = mix(previousRedBasis, currentRedBasis, PREVIOUS_BLEND);
  let greenBasis = mix(previousGreenBasis, currentGreenBasis, PREVIOUS_BLEND);
  let blueBasis = mix(previousBlueBasis, currentBlueBasis, PREVIOUS_BLEND);

  textureStore(lpvTexWrite, voxel, redBasis);
  textureStore(lpvTexWrite, voxel + vec3<u32>(lpvTexDim.z + 1, 0, 0), greenBasis);
  textureStore(lpvTexWrite, voxel + vec3<u32>(lpvTexDim.z * 2 + 2, 0, 0), blueBasis);





}