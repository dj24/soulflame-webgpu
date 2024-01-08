struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>
};

@group(0) @binding(0) var voxels : texture_3d<f32>;
@group(0) @binding(1) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(2) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(3) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
// TODO: maybe make a G-Buffer bind group to resuse across shaders
@group(0) @binding(4) var normalTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(5) var albedoTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(6) var depthRead : texture_2d<f32>;
//@group(0) @binding(7) var depthWrite : texture_storage_2d<r32float, write>;
@group(0) @binding(7) var velocityTex : texture_storage_2d<r32float, write>;
@group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;


fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

const FAR_PLANE = 10000.0;

const RAYS_PER_THREAD = 2;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
//  let initialDepth = textureLoad(depthRead, vec2<i32>(GlobalInvocationID.xy), 0).r;
//  if(initialDepth > 10000) {
//    textureStore(normalTex, GlobalInvocationID.xy, vec4(0.0));
//    textureStore(albedoTex, GlobalInvocationID.xy, vec4(0.0));
//    return;
//  }

  let resolution = textureDimensions(albedoTex);
  var uv = vec2<f32>(GlobalInvocationID.xy) / vec2<f32>(resolution);
  uv = vec2(uv.x, 1.0 - uv.y);
  var pixel = GlobalInvocationID.xy;


  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);

  var rayOrigin = cameraPosition;

  let rayMarchResult = rayMarch( rayOrigin, rayDirection, voxelObjects);
  let colour = rayMarchResult.colour;
  let depth = distance(rayMarchResult.worldPos, cameraPosition);

//  textureStore(depthWrite, GlobalInvocationID.xy, vec4(depth,0.0,0.0,0.0));
  textureStore(normalTex, pixel, vec4(rayMarchResult.normal,1));
  textureStore(albedoTex, pixel, vec4(rayMarchResult.worldPos % 1,1));

  // VELOCITY
  //TODO: pass both inverse and normal versions in as uniforms
  let inverseMvp = viewProjections.viewProjection * rayMarchResult.modelMatrix ;
  let previousInverseMvp = viewProjections.previousViewProjection *  rayMarchResult.previousModelMatrix;
  let currentClipSpace = inverseMvp * vec4(rayMarchResult.worldPos, 1.0);
  let previousClipSpace = previousInverseMvp * vec4(rayMarchResult.worldPos, 1.0);
  let currentNDC = currentClipSpace.xyz / currentClipSpace.w;
  let previousNDC = previousClipSpace.xyz / previousClipSpace.w;
  let velocity = currentNDC - previousNDC;

  textureStore(velocityTex, pixel, vec4(velocity,0));
}

@compute @workgroup_size(4, 4, 4)
fn projectVoxels(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
  var voxelObject = voxelObjects[0];
  let voxelId = GlobalInvocationID;
  var voxel = textureLoad(voxels, voxelId, 0);
  let viewProjectionMatrix = viewProjections.viewProjection;
  let modelMatrix = voxelObject.transform;
  let mvp =  viewProjectionMatrix * modelMatrix;

  let centerOfVoxel = vec3<f32>(voxelId) + vec3<f32>(0.5);

  var clipSpace = mvp * vec4(centerOfVoxel, 1.0);
  if(clipSpace.z < -1.0) {
    return;
  }
  let ndc = clipSpace.xyz / clipSpace.w;
  if(ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0 || ndc.z < -1.0 || ndc.z > 1.0) {
    return;
  }
  let worldPos = (modelMatrix * vec4(centerOfVoxel, 1.0)).xyz;
  var uv = (ndc.xy + vec2<f32>(1.0)) / vec2<f32>(2.0);
//  uv.y = 1.0 - uv.y;
  let pixel = vec2<i32>(uv * vec2<f32>(textureDimensions(albedoTex)));


//  for(var x = 0; x < 128; x+=4) {
//    for(var y = 0; y < 128; y+=4) {
//      textureStore(albedoTex, vec2(x,y), vec4(1.0,0,0,1));
//    }
//  }

  var r = 4;
  let foo = textureLoad(voxels, vec3<u32>(voxelId) + vec3<u32>(voxelObject.atlasLocation), 0);
  let colour = vec3<f32>(voxelId) / vec3<f32>(voxelObject.size);
  if(foo.a > 0.0){
    for(var x = -r; x <= r; x++) {
      for(var y = -r; y <= r; y++) {
        let distancetoCenter = distance(vec2(0.0), vec2(f32(x),f32(y)));
        if(distancetoCenter > f32(r)) {
          continue;
        }
        textureStore(albedoTex, pixel + vec2<i32>(x,y), vec4(colour,1));
      }
    }
  }

}