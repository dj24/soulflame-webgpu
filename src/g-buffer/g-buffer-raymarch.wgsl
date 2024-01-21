struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(3) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
// TODO: maybe make a G-Buffer bind group to resuse across shaders
@group(0) @binding(4) var normalTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(5) var albedoTex : texture_storage_2d<rgba8unorm, write>;
//@group(0) @binding(6) var depthRead : texture_2d<f32>;
@group(0) @binding(6) var depthWrite : texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var velocityTex : texture_storage_2d<rg32float, write>;
@group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(10) var<uniform> resolution : vec2<u32>;


fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

fn getVelocity(rayMarchResult: RayMarchResult, viewProjections: ViewProjectionMatrices) -> vec3<f32> {
  let objectSpace = rayMarchResult.inverseModelMatrix * vec4(rayMarchResult.worldPos, 1.0);
  let previousObjectSpace = rayMarchResult.previousInverseModelMatrix * vec4(rayMarchResult.worldPos, 1.0);

  let mvp = viewProjections.viewProjection * rayMarchResult.modelMatrix;
  let previousMvp = viewProjections.previousViewProjection * rayMarchResult.previousModelMatrix;

  let objectClipSpace = mvp * vec4(objectSpace.xyz, 1.0);
  let previousObjectClipSpace = previousMvp * vec4(objectSpace.xyz, 1.0);

  let objectNDC = objectClipSpace.xyz / objectClipSpace.w;
  let previousObjectNDC = previousObjectClipSpace.xyz / previousObjectClipSpace.w;

  var velocity = objectNDC - previousObjectNDC;
  velocity.y = -velocity.y;
  return velocity;
}

fn project(mvp: mat4x4<f32>, p: vec3<f32>) -> vec3<f32> {
  let clipSpaceVertex = mvp * vec4(p,1.0);
  var ndc = clipSpaceVertex.xyz / clipSpaceVertex.w;
  ndc = clamp(ndc, vec3<f32>(-1.0), vec3<f32>(1.0));
  var uv = (ndc.xy + vec2<f32>(1.0)) / vec2<f32>(2.0);
  uv.y = 1.0 - uv.y;
  let screenSpaceVertex = vec2<f32>(uv * vec2<f32>(resolution));
  return vec3<f32>(screenSpaceVertex, clipSpaceVertex.z);
}

const FAR_PLANE = 10000.0;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let resolution = textureDimensions(albedoTex);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  let pixel = GlobalInvocationID.xy;
  let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  let rayOrigin = vec3(cameraPosition.x, -cameraPosition.y, cameraPosition.z);

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(vec3(0.0), FAR_PLANE));
  textureStore(normalTex, GlobalInvocationID.xy, vec4(0.0));
  textureStore(albedoTex, GlobalInvocationID.xy, vec4(0.0));
  textureStore(velocityTex, pixel, vec4(0.0));

  var totalSteps = 0;
  var output = RayMarchResult();
  let maxMipLevel = u32(0);
  let minMipLevel = u32(0);
  var mipLevel = maxMipLevel;

//  for(var i = 0; i < VOXEL_OBJECT_COUNT; i++){
    let voxelObject = voxelObjects[0];
    var objectRayOrigin = (voxelObject.inverseTransform * vec4<f32>(rayOrigin, 1.0)).xyz;
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(rayDirection, 0.0)).xyz;
    let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
    let isInBounds = all(objectRayOrigin >= vec3(0.0)) && all(objectRayOrigin <= voxelObject.size);
    if(!intersect.isHit && !isInBounds) {
      return;
    }
    // Advance ray origin to the point of intersection
    if(!isInBounds){
      objectRayOrigin = objectRayOrigin + objectRayDirection * intersect.tNear + EPSILON;
    }

    // Bounds for octree node
    output = rayMarchAtMip(voxelObject, objectRayDirection, objectRayOrigin, 1);
    totalSteps += output.stepsTaken;
//  }

  let normal = output.normal;
  let depth = distance(output.worldPos, cameraPosition);
  let lambert = dot(normal, normalize(vec3<f32>(0.5, 1.0, -0.5)));
//  let albedo = vec3(mix(vec3(0.1,0,0.5), vec3(1,0.5,0.25), f32(totalSteps) / 50.0));
let albedo = output.colour.rgb;
//let albedo = mix(vec3(0.0), vec3(output.worldPos.x % 1),f32(totalSteps) / 50.0) ;
//  let albedo = vec3(output.objectPos % 1.0);
//  let albedo = output.colour.rgb;
  let colour = mix(albedo,vec3(lambert * albedo),1.0);
  let velocity = getVelocity(output, viewProjections);

  textureStore(depthWrite, GlobalInvocationID.xy, vec4(output.worldPos, select(FAR_PLANE, depth, output.hit)));
  textureStore(albedoTex, pixel, vec4(albedo, select(0.,1.,output.hit)));
  textureStore(normalTex, pixel, vec4(normal,1));
  textureStore(velocityTex, pixel, vec4(velocity,0));
}
