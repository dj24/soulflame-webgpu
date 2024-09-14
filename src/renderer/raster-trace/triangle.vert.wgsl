struct VoxelObject {
  transform: mat4x4<f32>,
  inverseTransform: mat4x4<f32>,
  previousTransform: mat4x4<f32>,
  previousInverseTransform: mat4x4<f32>,
  size : vec3<f32>,
  atlasLocation : vec3<f32>,
  paletteIndex : f32,
  octreeBufferIndex: u32
}

@binding(0) @group(0) var<storage> modelViewProjectionMatrices : array<mat4x4f>;
@group(0) @binding(3) var<storage> voxelObjects : array<VoxelObject>;

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) objectPos : vec3f,
  @location(1) worldPos : vec3f,
  @location(2) @interpolate(linear) ndc : vec3f,
  @location(3) @interpolate(flat) instanceIdx : u32,
}

@vertex
fn main(
  @builtin(instance_index) instanceIdx : u32,
  @location(0) objectPos : vec4f,
) -> VertexOutput {
  var output : VertexOutput;
  output.instanceIdx = instanceIdx;
  let modelViewProjectionMatrix = modelViewProjectionMatrices[instanceIdx];
  let voxelObject = voxelObjects[instanceIdx];
  var clipPosition = modelViewProjectionMatrix * objectPos;
  output.position = clipPosition;
  output.worldPos = (voxelObject.transform * objectPos).xyz;
  output.objectPos = objectPos.xyz;
  output.ndc = clipPosition.xyz / clipPosition.w;
  output.ndc.y = -output.ndc.y;
  return output;
}
