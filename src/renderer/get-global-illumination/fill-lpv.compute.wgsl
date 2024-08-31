// Spherical Harmonics basis functions (L=1)
fn SHBasis(lightDir: vec3<f32>) -> vec4<f32> {
    let sh0 = 0.282095; // Y_0^0 (constant term)
    let sh1 = 0.488603 * lightDir.x; // Y_1^-1
    let sh2 = 0.488603 * lightDir.y; // Y_1^0
    let sh3 = 0.488603 * lightDir.z; // Y_1^1

    return vec4<f32>(sh0, sh1, sh2, sh3);
}

const SUN_COLOUR = vec3<f32>(1.);
const POINT_LIGHT_COLOUR = vec3<f32>(800., 0,1000.);
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

const PREVIOUS_BLEND = 0.05;

@compute @workgroup_size(4, 4, 4)
fn main(
    @builtin(global_invocation_id) voxel : vec3<u32>
) {
  let lpvTexDim = textureDimensions(lpvTexWrite);
  let pointLightPos = vec3<f32>(sin(time.elapsed) * 160. + 80.,40.0,160.);
  let voxelOrigin = vec3<f32>(voxel) * f32(LPV_SCALE);
  let voxelCenter = voxelOrigin + randomInUnitSphere(vec2(time.elapsed, -time.elapsed)) * f32(LPV_SCALE);
  let pointLightDir = normalize(pointLightPos - voxelCenter);
//  var pointLightAttenuation = 1.0 / length(pointLightPos - voxelCenter);
//
  var pointLightAttenuation = 0.0;

  var sunLightAttenuation = 0.0;

  // If any of the corners are not in shadow, apply the light
//  for(var i = 0u; i < 8u; i = i + 1u){
//    let corner = VOXEL_CORNERS[i];
//    let cornerWorldPos = voxelOrigin + corner * f32(LPV_SCALE);
//    let cornerLightDir = normalize(pointLightPos - cornerWorldPos);
//    if(!rayMarchBVH(cornerWorldPos, cornerLightDir).hit){
//      pointLightAttenuation = 1.0 / length(pointLightPos - voxelCenter);
//      break;
//    }
//  }

  if(!rayMarchBVH(voxelCenter, pointLightDir).hit){
    pointLightAttenuation = 1.0 / length(pointLightPos - voxelCenter);
  }

  if(!rayMarchBVH(voxelCenter, sunDirection).hit){
    sunLightAttenuation = 1.0;
  }

  let sunSHBasisR = SHBasis(sunDirection) * SUN_COLOUR.r * sunLightAttenuation;
  let sunSHBasisG = SHBasis(sunDirection) * SUN_COLOUR.g * sunLightAttenuation;
  let sunSHBasisB = SHBasis(sunDirection) * SUN_COLOUR.b * sunLightAttenuation;

  let lightSHBasisR = SHBasis(pointLightDir) * POINT_LIGHT_COLOUR.r * pointLightAttenuation;
  let lightSHBasisG = SHBasis(pointLightDir) * POINT_LIGHT_COLOUR.g * pointLightAttenuation;
  let lightSHBasisB = SHBasis(pointLightDir) * POINT_LIGHT_COLOUR.b * pointLightAttenuation;

  let previousRedBasis = textureLoad(previousLpvTex, voxel, 0);
  let previousGreenBasis = textureLoad(previousLpvTex, voxel + vec3<u32>(lpvTexDim.z + 1, 0, 0), 0);
  let previousBlueBasis = textureLoad(previousLpvTex, voxel + vec3<u32>(lpvTexDim.z * 2 + 2, 0, 0), 0);

  let currentRedBasis = lightSHBasisR + sunSHBasisR;
  let currentGreenBasis =  lightSHBasisG + sunSHBasisG;
  let currentBlueBasis = lightSHBasisB + sunSHBasisB;

  let redBasis = mix(previousRedBasis, currentRedBasis, PREVIOUS_BLEND);
  let greenBasis = mix(previousGreenBasis, currentGreenBasis, PREVIOUS_BLEND);
  let blueBasis = mix(previousBlueBasis, currentBlueBasis, PREVIOUS_BLEND);

  textureStore(lpvTexWrite, voxel, redBasis);
  textureStore(lpvTexWrite, voxel + vec3<u32>(lpvTexDim.z + 1, 0, 0), greenBasis);
  textureStore(lpvTexWrite, voxel + vec3<u32>(lpvTexDim.z * 2 + 2, 0, 0), blueBasis);





}