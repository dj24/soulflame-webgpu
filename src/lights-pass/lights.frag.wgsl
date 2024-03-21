@fragment
fn main(
    @location(0) @interpolate(linear) ndc : vec3f
) -> @location(0) vec4f {
  var screenUV = ndc.xy * 0.5 + 0.5;
  return vec4(screenUV, 0.0, 1.0);
}