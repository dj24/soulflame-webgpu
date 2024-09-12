struct Light {
  position: vec3<f32>,
  padding_1: f32,
  color: vec3<f32>,
  padding_2: f32,
  radius: f32,
};


@binding(0) @group(0) var<storage> modelViewProjectionMatrices : array<mat4x4<f32>>;
@group(0) @binding(4) var<storage> lights: array<Light>;

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) @interpolate(linear) ndc : vec3f,
  @location(1) lightPosition : vec3f,
  @location(2) lightColor : vec3f,
}

@vertex
fn main(
  @builtin(instance_index) instanceIdx : u32,
  @location(0) objectPos : vec4f,
) -> VertexOutput {
  var output : VertexOutput;
  var clipPosition = modelViewProjectionMatrices[instanceIdx] * objectPos;
  output.position = clipPosition;
  output.ndc = clipPosition.xyz / clipPosition.w;
  output.ndc.y = -output.ndc.y;
  output.lightPosition = lights[instanceIdx].position;
  output.lightColor = lights[instanceIdx].color;
  return output;
}
