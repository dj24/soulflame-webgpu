fn calculateRayDirection(uv: vec2<f32>, inverseProjection: mat4x4<f32>) -> vec3<f32> {
  let clipSpace = vec2(uv.x, 1.0 - uv.y) * 2.0 - 1.0;
  let viewRay = vec3<f32>(clipSpace, 1.0);
  let viewRayView = inverseProjection * vec4(viewRay, 1.0);
  return normalize(viewRayView.xyz);
}
