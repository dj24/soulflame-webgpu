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
@group(0) @binding(6) var palette : texture_2d<f32>;


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

//  @location(0) objectPos : vec3f,
//   @location(1) worldPos : vec3f,
    @location(2) @interpolate(linear) ndc : vec3f
) -> GBufferOutput
 {
    var output : GBufferOutput;
    var screenUV = ndc.xy * 0.5 + 0.5;
    var inverseViewProjection = viewProjections.inverseViewProjection;
    let rayDirection = calculateRayDirection(screenUV,inverseViewProjection);

    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(cameraPosition, 1.0)).xyz;

    let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size - vec3(1));

    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    var tNear = 0.0;
    if(!isInBounds){
      tNear = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5).tNear - 0.00001;
    }
    var worldPos = transformPosition(voxelObject.transform, objectRayOrigin + objectRayDirection * tNear);
    var result = rayMarchOctree(voxelObject, rayDirection, worldPos, 2);
//    var result = rayMarchTransformed(voxelObject, rayDirection, worldPos, 0);
    if(!result.hit){
      discard;
      return output;
    }


    let objectPos = objectRayOrigin + objectRayDirection * result.t;
    let paletteX = i32(result.palettePosition * 255.0);
    let paletteY = i32(voxelObject.paletteIndex);
    let albedo = textureLoad(palette, vec2(paletteX, paletteY), 0).rgb;
    output.albedo =  vec4(albedo, 1.0);
    output.normal = vec4(result.normal, 1);
    output.worldPosition = vec4(result.worldPos, 1);
    output.velocity = vec4(getVelocity(result.objectPos, voxelObject.transform, voxelObject.previousTransform, viewProjections), 1);

    let raymarchedDistance = length(result.worldPos - cameraPosition);

    let near = 0.5;
    let far = 10000.0;
    let linearDepth = normaliseValue(near, far, raymarchedDistance);
    output.depth = linearDepth;
    return output;
}