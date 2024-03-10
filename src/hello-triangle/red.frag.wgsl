@binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;
@binding(1) @group(0) var<uniform> inverseModelViewProjectionMatrix : mat4x4f;

@fragment
fn main(
   @builtin(position) clipPos: vec4f,
   @location(0) objectPos : vec3f,
) -> @location(0) vec4f {

  let ndc = clipPos.xy / clipPos.w;

  // Reconstruct the world position from NDC coordinates
  var worldPosition = inverseModelViewProjectionMatrix * vec4f(ndc, 0.0, 1.0);
  worldPosition /= worldPosition.w;

  // Perform shading calculations or any other operations here
  // For now, let's just output the reconstructed world position color
  return vec4f((objectPos.xyz % 1.0), 1.0);
}