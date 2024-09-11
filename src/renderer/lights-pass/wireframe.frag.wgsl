struct Light {
  position: vec3<f32>,
  padding_1: f32,
  color: vec3<f32>,
  padding_2: f32,
  radius: f32,
};

@group(0) @binding(5) var<uniform> light: Light;

@fragment
fn main(
    @location(0) @interpolate(linear) ndc : vec3f
) -> @location(0) vec4f {
  let lightColor = normalize(light.color.rgb);
  return vec4(lightColor, 1.0);
}