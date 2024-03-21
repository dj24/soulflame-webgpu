@group(0) @binding(1) var nearestSampler : sampler;
@group(0) @binding(2) var worldPosTex : texture_2d<f32>;
@group(0) @binding(3) var voxels : texture_3d<f32>;
@group(0) @binding(4) var albedoTex : texture_2d<f32>;
@group(0) @binding(5) var<storage> voxelObjects : array<VoxelObject>;
@group(0) @binding(6) var<storage> bvhNodes: array<BVHNode>;
@group(0) @binding(7) var normalTex : texture_2d<f32>;

const LIGHT_CENTER = vec3(-12, 3.5, -45);
const LIGHT_RADIUS = 3.0;
const LIGHT_COLOR = vec3(1.0, 0.8, 0.5);
const LIGHT_INTENSITY = 0.5;

@fragment
fn main(
    @location(0) @interpolate(linear) ndc : vec3f
) -> @location(0) vec4f {
  var screenUV = ndc.xy * 0.5 + 0.5;
  let albedo = textureSample(albedoTex, nearestSampler, screenUV).rgb;
  let normal = textureSample(normalTex, nearestSampler, screenUV).xyz;
  let worldPos = textureSample(worldPosTex, nearestSampler, screenUV).xyz + normal * 0.001;
  let jitteredLightCenter = LIGHT_CENTER + randomInUnitSphere(screenUV) * 0.00;
  let distanceToLight = distance(worldPos, jitteredLightCenter);
  let normalisedDistance = distanceToLight / LIGHT_RADIUS;
  if(normalisedDistance > LIGHT_RADIUS) {
    discard;
  }
  let attenuation = pow(LIGHT_RADIUS - normalisedDistance, 2) * LIGHT_INTENSITY;
  let shadowRayDirection = normalize(jitteredLightCenter - worldPos);
  let rayMarchResult = rayMarchBVH(worldPos, shadowRayDirection);
  let rayMarchedDistance = distance(worldPos, rayMarchResult.worldPos);
  if(rayMarchedDistance <= distanceToLight) {
    discard;
  }
  return vec4(LIGHT_COLOR * albedo, attenuation);
}