@group(0) @binding(1) var nearestSampler : sampler;
@group(0) @binding(2) var worldPosTex : texture_2d<f32>;
@group(0) @binding(4) var albedoTex : texture_2d<f32>;


const LIGHT_CENTER = vec3(-15, 3.5, -45);
const LIGHT_RADIUS = 4.0;
const LIGHT_INTENSITY = 1.0;
const LIGHT_COLOR = vec3(1.0, 0.8, 0.5);

@fragment
fn main(
    @location(0) @interpolate(linear) ndc : vec3f
) -> @location(0) vec4f {
  var screenUV = ndc.xy * 0.5 + 0.5;
  let worldPos = textureSample(worldPosTex, nearestSampler, screenUV).xyz;
  let albedo = textureSample(albedoTex, nearestSampler, screenUV).rgb;
  let distanceToLight = length(worldPos - LIGHT_CENTER);
  if(distanceToLight > LIGHT_RADIUS) {
    return vec4(0.0, 0.0, 0.0, 1.0); //
//    discard;
  }
  let falloff = LIGHT_RADIUS / (distanceToLight * distanceToLight);
  let lightColor = LIGHT_COLOR * falloff * LIGHT_INTENSITY;
  return vec4(lightColor * albedo, 1.0);
}