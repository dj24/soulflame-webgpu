struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(2) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(3) var voxels : texture_3d<f32>;
@group(0) @binding(4) var<storage> voxelObject : VoxelObject;
@group(0) @binding(5) var<uniform> cameraPosition : vec3<f32>;

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
  @location(3) velocity : vec4f
}

fn getVelocity(rayMarchResult: RayMarchResult, viewProjections: ViewProjectionMatrices) -> vec3<f32> {
  let vp = viewProjections.viewProjection;
    let previousVp = viewProjections.previousViewProjection;
    let modelMatrix = rayMarchResult.modelMatrix;
    let previousModelMatrix = rayMarchResult.previousModelMatrix;

    // Get current object space position of the current pixel
    let objectPos = rayMarchResult.objectPos.xyz;
    let objectClipSpace = vp * modelMatrix * vec4(objectPos.xyz, 1.0);
    let objectNDC = objectClipSpace.xyz / objectClipSpace.w;

    // Get previous position of the current object space position
    let previousObjectClipSpace = previousVp * previousModelMatrix * vec4(objectPos.xyz, 1.0);
    let previousObjectNDC = previousObjectClipSpace.xyz / previousObjectClipSpace.w;

    // Get velocity based on the difference between the current and previous positions
    var velocity = objectNDC - previousObjectNDC;
    velocity.y = -velocity.y;
  return velocity;
}


// TODO: output depth
@fragment
fn main(
   @location(0) objectPos : vec3f,
//   @location(1) worldPos : vec3f,
    @location(2) @interpolate(linear) ndc : vec3f
) -> GBufferOutput
 {
    var output : GBufferOutput;
    var screenUV = ndc.xy * 0.5 + 0.5;
    var inverseViewProjection = viewProjections.inverseViewProjection;
    let rayDirection = calculateRayDirection(screenUV,inverseViewProjection);


    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(cameraPosition, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    let tNear = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5).tNear + EPSILON;;
    let worldPos = transformPosition(voxelObject.transform, objectRayOrigin + objectRayDirection * tNear);

    let result = rayMarchTransformed(voxelObject, rayDirection, worldPos, 0);
    if(!result.hit){
      discard;
    }
//    output.albedo = vec4(abs(result.worldPos) % 1.0, 1);
    output.albedo = vec4(result.colour, 1);
    output.normal = vec4(result.normal, 1);
    output.worldPosition = vec4(result.worldPos, 1);
    output.velocity = vec4(getVelocity(result, viewProjections), 1);
    return output;
}