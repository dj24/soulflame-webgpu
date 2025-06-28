fn toneMapSDR(color: vec3<f32>) -> vec3<f32> {
  // Simple Reinhard tone mapping
  return color / (vec3(1.0) + color);
}
