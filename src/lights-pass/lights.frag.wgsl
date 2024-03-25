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
@group(0) @binding(10) var depthTex : texture_2d<f32>;

fn blinnPhong(normal: vec3<f32>, lightDirection: vec3<f32>, viewDirection: vec3<f32>, specularStrength: f32, shininess: f32, lightColour: vec3<f32>) -> vec3<f32> {
  let halfDirection = normalize(lightDirection + viewDirection);
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let specular = pow(max(dot(normal, halfDirection), 0.0), shininess);
  return (diffuse + specular * specularStrength) * lightColour;
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
  return ndc * 0.5 + 0.5;
}

const JITTERED_LIGHT_CENTER_RADIUS = 0.0;
const SHADOW_ACNE_OFFSET: f32 = 0.05;
const SCATTER_AMOUNT: f32 = 0.2;
const POSITION_SCATTER_AMOUNT: f32 = 0.2;

@fragment
fn main(
    @location(0) @interpolate(linear) ndc : vec3f
) -> @location(0) vec4f {
  let lightPosition = light.position.xyz;
  let lightRadius = light.radius * light.radius; // WHY?
  let lightColor = light.color.rgb;
  var screenUV = ndc.xy * 0.5 + 0.5;
  // TODO: use bluenoise instead uv
  let r = screenUV;
  let rayDirection = calculateRayDirection(screenUV,viewProjections.inverseViewProjection);
  let albedo = textureSampleLevel(albedoTex, nearestSampler, screenUV, 0.0).rgb;
  let normal = textureSampleLevel(normalTex, nearestSampler, screenUV, 0.0).xyz;
  var worldPos = textureSampleLevel(worldPosTex, nearestSampler, screenUV, 0.0).xyz + normal * SHADOW_ACNE_OFFSET;
//  worldPos += randomInPlanarUnitDisk(r, normal) * POSITION_SCATTER_AMOUNT;
  let jitteredLightCenter = lightPosition;

  var distanceToLight = distance(worldPos, jitteredLightCenter);
  var attenuation = lightRadius / (distanceToLight * distanceToLight);

  var shadowRayDirection = -normalize(jitteredLightCenter - worldPos);
//  shadowRayDirection += randomInHemisphere(r, shadowRayDirection) * SCATTER_AMOUNT;

  let rayStep = normalize(shadowRayDirection);
  var screenRayStep = projectRayToScreenSpace(rayStep, viewProjections.viewProjection);
  let lightPositionUV = calculateScreenSpaceUV(lightPosition, viewProjections.viewProjection);
  var screenRayPosition = ndc.xy;

  if(lightPositionUV.x < 0.0 || lightPositionUV.x > 1.0 || lightPositionUV.y < 0.0 || lightPositionUV.y > 1.0) {
    return vec4(0.0);
  }
  // Screen space shadow ray
  let cameraPosition = getCameraPosition(viewProjections.inverseViewProjection);
  let distanceToCamera = distance(worldPos, cameraPosition);
  for(var i = 0; i < 64; i++) {
    screenRayPosition += screenRayStep * 0.0005;
    if(screenRayPosition.x < -1.0 || screenRayPosition.x > 1.0 || screenRayPosition.y < -1.0 || screenRayPosition.y > 1.0) {
      return vec4(0.0);
    }
    let uv = ndcToScreenUV(screenRayPosition);
    let worldPosSample = textureSampleLevel(worldPosTex, nearestSampler, uv,0.0).xyz  + normal * SHADOW_ACNE_OFFSET;;
//    if(distance(worldPosSample, jitteredLightCenter) > lightRadius) {
//      return vec4(0.0);
//    }

    let distanceToCameraSample = distance(worldPosSample, cameraPosition);
    // closer than the current fragment, occluded
    if(distanceToCameraSample < distanceToCamera - 0.0001) {
//        return vec4(worldPosSample % 1.0, 1);
      return vec4(0.0);
    }
  }

  let lightDirection = normalize(jitteredLightCenter - worldPos);
  let shaded = blinnPhong(normal, lightDirection, -rayDirection, 0.0, 0.0, lightColor);
  let albedoWithSpecular = albedo * shaded;



return vec4(distanceToCamera * 0.01);
//return vec4(shadowRayDirection, 1.0);
  return vec4(screenRayStep, 0, 1.0);
//
  return vec4(vec3(abs(worldPos) % 1.0), 1);
//  return vec4(vec3(distanceToCamera * 0.01), 1);


  // TODO: output hdr and tonemap
  return vec4(lightColor * albedoWithSpecular, attenuation);
}