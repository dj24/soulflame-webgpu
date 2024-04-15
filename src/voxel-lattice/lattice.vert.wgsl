struct VoxelObject {
  transform: mat4x4<f32>,
  inverseTransform: mat4x4<f32>,
  previousTransform: mat4x4<f32>,
  previousInverseTransform: mat4x4<f32>,
  size : vec3<f32>,
  atlasLocation : vec3<f32>,
  brickOffset : u32,
}

@binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;
@group(0) @binding(4) var<storage> voxelObject : VoxelObject;
@binding(1) @group(0) var<uniform> modelMatrix : mat4x4f;


struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0) objectPos : vec3f,
  @location(1) worldPos : vec3f,
  @location(2) @interpolate(linear) ndc : vec3f,
  @location(3) objectNormal : vec3f
}

// if vertex < 4 we are rendering an xy plane
// if vertex < 8 we are rendering an xz plane
// if vertex < 12 we are rendering an yz plane
@vertex
fn main(
  @location(0) vertexPos : vec4f,
  @builtin(instance_index) instanceIndex : u32,
  @builtin(vertex_index) vertexIndex : u32
) -> VertexOutput {
  var output : VertexOutput;
  var objectPos = vertexPos;
  var objectNormal = vec3f(0.0, 0.0, 0.0);
  if (vertexIndex < 4) {
    objectPos.x *= voxelObject.size.x;
    objectPos.y *= voxelObject.size.y;
    objectPos.z += f32(instanceIndex);
    objectNormal = vec3f(0.0, 0.0, 1.0);
  } else if (vertexIndex < 8) {
    objectPos.x *= voxelObject.size.x;
    objectPos.z *= voxelObject.size.z;
    objectPos.y += f32(instanceIndex);
    objectNormal = vec3f(0.0, 1.0, 0.0);
  } else {
    objectPos.y *= voxelObject.size.y;
    objectPos.z *= voxelObject.size.z;
    objectPos.x += f32(instanceIndex);
    objectNormal = vec3f(1.0, 0.0, 0.0);
  }

  var clipPosition = modelViewProjectionMatrix * objectPos;
  output.position = clipPosition;
  output.worldPos = (modelMatrix * objectPos).xyz;
  output.objectPos = objectPos.xyz;
  output.ndc = clipPosition.xyz / clipPosition.w;
  output.ndc.y = -output.ndc.y;
  output.objectNormal = objectNormal;
//  output.objectNormal = (vec4<f32>(objectNormal, 0.0) * voxelObject.inverseTransform).xyz;
  return output;
}
