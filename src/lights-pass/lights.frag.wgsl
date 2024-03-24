struct Light {
  position: vec3<f32>,
  padding_1: f32,
  color: vec3<f32>,
  padding_2: f32,
  radius: f32,
};

struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};


@group(0) @binding(1) var nearestSampler : sampler;
@group(0) @binding(2) var worldPosTex : texture_2d<f32>;
@group(0) @binding(3) var voxels : texture_3d<f32>;
@group(0) @binding(4) var albedoTex : texture_2d<f32>;
@group(0) @binding(5) var<storage> voxelObjects : array<VoxelObject>;
@group(0) @binding(6) var<storage> bvhNodes: array<BVHNode>;
@group(0) @binding(7) var normalTex : texture_2d<f32>;
@group(0) @binding(8) var<uniform> light: Light;
@group(0) @binding(9) var<uniform> viewProjections : ViewProjectionMatrices;

fn blinnPhong(normal: vec3<f32>, lightDirection: vec3<f32>, viewDirection: vec3<f32>, specularStrength: f32, shininess: f32, lightColour: vec3<f32>) -> vec3<f32> {
  let halfDirection = normalize(lightDirection + viewDirection);
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let specular = pow(max(dot(normal, halfDirection), 0.0), shininess);
  return (diffuse + specular * specularStrength) * lightColour;
}

const JITTERED_LIGHT_CENTER_RADIUS = 0.0;
const SHADOW_ACNE_OFFSET: f32 = 0.005;
const SCATTER_AMOUNT: f32 = 0.2;
const POSITION_SCATTER_AMOUNT: f32 = 0.2;

@fragment
fn main(
    @location(0) @interpolate(linear) ndc : vec3f
) -> @location(0) vec4f {
  let lightPosition = light.position.xyz;
  let lightRadius = light.radius;
  let lightColor = light.color.rgb;
  var screenUV = ndc.xy * 0.5 + 0.5;
  // TODO: use bluenoise instead uv
  let r = screenUV;
  let rayDirection = calculateRayDirection(screenUV,viewProjections.inverseViewProjection);
  let albedo = textureSample(albedoTex, nearestSampler, screenUV).rgb;
  let normal = textureSample(normalTex, nearestSampler, screenUV).xyz;
  var worldPos = textureSample(worldPosTex, nearestSampler, screenUV).xyz + normal * SHADOW_ACNE_OFFSET;
  worldPos += randomInPlanarUnitDisk(r, normal) * POSITION_SCATTER_AMOUNT;
  let jitteredLightCenter = lightPosition + randomInUnitSphere(screenUV) * JITTERED_LIGHT_CENTER_RADIUS;

  var distanceToLight = distance(worldPos, jitteredLightCenter);
  var attenuation = (lightRadius * 2.0) / (distanceToLight * distanceToLight);

  // TODO: fix bvh before enabling this again
  var shadowRayDirection = normalize(jitteredLightCenter - worldPos);
  shadowRayDirection += randomInHemisphere(r, shadowRayDirection) * SCATTER_AMOUNT;
  // TODO: enable max distance param
//  let isHit = rayMarchBVHFirstHit(worldPos, shadowRayDirection, distanceToLight);
//  if(isHit) {
//    return vec4(0.0);
//  }
  let lightDirection = normalize(jitteredLightCenter - worldPos);
  let shaded = blinnPhong(normal, lightDirection, -rayDirection, 0.0, 0.0, lightColor);
  let albedoWithSpecular = albedo * shaded;

//  return vec4(abs(worldPos) %1.0, attenuation);

  // TODO: output hdr and tonemap
  return vec4(lightColor * albedoWithSpecular, attenuation);
}