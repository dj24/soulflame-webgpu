struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>,
  viewMatrix : mat4x4<f32>,
};

@group(0) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(2) var<storage, read> octreeBuffer : array<vec4<u32>>;
@group(0) @binding(3) var<storage> voxelObjects : array<VoxelObject>;
@group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;


const IDENTITY_MATRIX = mat4x4<f32>(
  vec4<f32>(1.0, 0.0, 0.0, 0.0),
  vec4<f32>(0.0, 1.0, 0.0, 0.0),
  vec4<f32>(0.0, 0.0, 1.0, 0.0),
  vec4<f32>(0.0, 0.0, 0.0, 1.0)
);

struct GBufferOutput {
  @location(0) albedo : vec4f,
  @location(1) normal : vec4f,
  @location(2) worldPosition : vec4f,
  @location(3) velocity : vec4f,
  @builtin(frag_depth) depth : f32,
}

fn getVelocity(objectPos: vec3<f32>, modelMatrix: mat4x4<f32>, previousModelMatrix: mat4x4<f32>, viewProjections: ViewProjectionMatrices) -> vec3<f32> {
  let vp = viewProjections.viewProjection;
  let previousVp = viewProjections.previousViewProjection;

  // Get current object space position of the current pixel
  let objectClipSpace = vp * modelMatrix * vec4(objectPos.xyz, 1.0);
  let objectNDC = objectClipSpace.xyz / objectClipSpace.w;

  // Get previous position of the current object space position
  let previousObjectClipSpace = previousVp * previousModelMatrix * vec4(objectPos.xyz, 1.0);
  let previousObjectNDC = previousObjectClipSpace.xyz / previousObjectClipSpace.w;

  // Get velocity based on the difference between the current and previous positions
  var velocity = previousObjectNDC - objectNDC;
  velocity.y = -velocity.y;
  return velocity;
}

@fragment
fn main(
  @location(0) objectPos : vec3f,
  @location(2) @interpolate(linear) ndc : vec3f,
  @location(3) @interpolate(flat) instanceIdx : u32
) -> GBufferOutput
 {
    let voxelObject = voxelObjects[instanceIdx];
    var output : GBufferOutput;
    var screenUV = ndc.xy * 0.5 + 0.5;
    let rayDirection = calculateRayDirection(screenUV, viewProjections.inverseViewProjection);
    var worldPos = transformPosition(voxelObject.transform, objectPos);

    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    var result = rayMarchOctree(voxelObject, rayDirection, cameraPosition, 9999.0);
//
    if(!result.hit){
      discard;
      return output;
    }


    output.albedo = vec4(result.colour, 1.0);
    output.normal = vec4(transformNormal(voxelObject.inverseTransform,vec3<f32>(result.normal)), 0.0);
    output.worldPosition = vec4(cameraPosition + rayDirection * result.t, 0.0);
    let raymarchedDistance = length(output.worldPosition.xyz  - cameraPosition);



    let near = 0.5;
    let far = 10000.0;
    let linearDepth = normaliseValue(near, far, raymarchedDistance);
    output.depth = linearDepth;
    return output;
}