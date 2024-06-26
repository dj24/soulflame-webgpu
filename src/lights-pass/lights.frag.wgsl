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

const BLUE_NOISE_SIZE = 511;

struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
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
@group(0) @binding(10) var depthTex : texture_2d<f32>;
@group(0) @binding(11) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(12) var<uniform> time : Time;

fn blinnPhong(normal: vec3<f32>, lightDirection: vec3<f32>, viewDirection: vec3<f32>, specularStrength: f32, shininess: f32, lightColour: vec3<f32>) -> vec3<f32> {
  let halfDirection = normalize(lightDirection + viewDirection);
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let specular = pow(max(dot(normal, halfDirection), 0.0), shininess);
  return (diffuse + specular * specularStrength) * lightColour;
}

fn getNdc(worldPos: vec3<f32>) -> vec3<f32> {
  return (viewProjections.viewProjection * vec4(worldPos, 1.0)).xyz;
}

fn calculateScreenSpaceUV(worldPos: vec3<f32>, viewProjection: mat4x4<f32>) -> vec2<f32> {
  let clipPos = viewProjection * vec4(worldPos, 1.0);
  var ndc = clipPos.xy / clipPos.w;
  let uv = ndc * -0.5 + 0.5;
  return uv;
}
fn projectRayToScreenSpace(worldRayDirection: vec3<f32>, viewProjection: mat4x4<f32>) -> vec2<f32> {
  return (viewProjection * vec4(worldRayDirection, 0.0)).xy;
}

fn getCameraPosition(invViewProjection: mat4x4<f32>) -> vec3<f32> {
  return invViewProjection[3].xyz;
}

fn ndcToScreenUV(ndc: vec2<f32>) -> vec2<f32> {
  return (ndc + 1.0) * 0.5;
}



const JITTERED_LIGHT_CENTER_RADIUS = 0.5;
const POSITION_JITTER_RADIUS = 0.1;
const SHADOW_ACNE_OFFSET: f32 = 0.0001;

@fragment
fn main(
    @location(0) @interpolate(linear) lightVolumeNdc : vec3f
) -> @location(0) vec4f {
  let lightPosition = light.position.xyz;
  let lightRadius = light.radius * 2.0; // WHY?
  let lightColor = light.color.rgb;
  var screenUV = lightVolumeNdc.xy * 0.5 + 0.5;
  let screenPixel = vec2<i32>(vec2<f32>(textureDimensions(worldPosTex).xy) * screenUV);

  var samplePixel = screenPixel;
  samplePixel.x += i32(time.frame) * 32;
  samplePixel.y += i32(time.frame) * 16;
  var blueNoisePixel = samplePixel % BLUE_NOISE_SIZE;
  if(time.frame % 2 == 0){
    blueNoisePixel.y = BLUE_NOISE_SIZE - blueNoisePixel.y;
  }
  if(time.frame % 3 == 0){
    blueNoisePixel.x = BLUE_NOISE_SIZE - blueNoisePixel.x;
  }
  let r = textureLoad(blueNoiseTex, blueNoisePixel, 0).xy;
  let albedo = textureSampleLevel(albedoTex, nearestSampler, screenUV, 0.0).rgb;
  let normal = textureSampleLevel(normalTex, nearestSampler, screenUV, 0.0).xyz;
  var worldPos = textureSampleLevel(worldPosTex, nearestSampler, screenUV, 0.0).xyz;
  worldPos += randomInPlanarUnitDisk(r, normal) * POSITION_JITTER_RADIUS;
  let ndc = getNdc(worldPos);
  let depth = ndc.z;

  var jitteredLightCenter = lightPosition;
  jitteredLightCenter += randomInUnitSphere(r) * JITTERED_LIGHT_CENTER_RADIUS;

  var distanceToLight = distance(worldPos, jitteredLightCenter);
  var shadowRayDirection = -normalize(worldPos - jitteredLightCenter);
  if(dot(normal, shadowRayDirection) < 0.0){
    return vec4(0.0);
  }
  var attenuation = 1.0 - saturate(distanceToLight / lightRadius);
  if(attenuation <= 0.0){
    return vec4(0.0);
  }

  if(rayMarchBVHShadows(worldPos + normal * 0.5, shadowRayDirection, 1).hit){
    return vec4(0.0);
  }


  let rayDirection = calculateRayDirection(screenUV,viewProjections.inverseViewProjection);
  let shaded = blinnPhong(normal, -shadowRayDirection, rayDirection, 0.0, 0.0, lightColor);
  let albedoWithSpecular = albedo * shaded;

  // TODO: output hdr and tonemap
  return vec4(albedo * lightColor, attenuation);
}