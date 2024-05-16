fn calculateRayDirection(uv: vec2<f32>, inverseProjection: mat4x4<f32>) -> vec3<f32> {
  let clipSpace = vec2(1.0 - uv.x, 1.0 - uv.y) * 2.0 - 1.0;
  let viewRay = vec3<f32>(clipSpace, 1.0);
  let viewRayView = inverseProjection * vec4(viewRay, 1.0);
  return normalize(viewRayView.xyz);
}

fn normaliseValue(min: f32, max: f32, value: f32) -> f32 {
  return (value - min) / (max - min);
}