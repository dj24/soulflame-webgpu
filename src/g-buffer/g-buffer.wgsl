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

fn drawLine(v1: vec2<f32>, v2: vec2<f32>) {
  let v1Vec = vec2<f32>(v1.x, v1.y);
  let v2Vec = vec2<f32>(v2.x, v2.y);

  let dist = i32(distance(v1Vec, v2Vec));
  for (var i = 0; i < dist; i = i + 1) {
    let x = u32(v1.x + f32(v2.x - v1.x) * (f32(i) / f32(dist)));
    let y = u32(v1.y + f32(v2.y - v1.y) * (f32(i) / f32(dist)));
    textureStore(albedoTex, vec2<u32>(x,y), vec4(1.0));
  }
}

fn drawQuad(v1: vec2<f32>, v2: vec2<f32>, v3: vec2<f32>, v4: vec2<f32>) {
  drawLine(v1, v2);
  drawLine(v2, v3);
  drawLine(v3, v4);
  drawLine(v4, v1);
}

fn getVoxelVertices(voxel: vec3<f32>) -> array<vec4<f32>, 8> {
  let voxelVertices = array<vec4<f32>, 8>(
    vec4(voxel + vec3<f32>(0.0, 0.0, 0.0),1),
    vec4(voxel + vec3<f32>(1.0, 0.0, 0.0),1),
    vec4(voxel + vec3<f32>(0.0, 1.0, 0.0),1),
    vec4(voxel + vec3<f32>(1.0, 1.0, 0.0),1),
    vec4(voxel + vec3<f32>(0.0, 0.0, 1.0),1),
    vec4(voxel + vec3<f32>(1.0, 0.0, 1.0),1),
    vec4(voxel + vec3<f32>(0.0, 1.0, 1.0),1),
    vec4(voxel +  vec3<f32>(1.0, 1.0, 1.0),1)
  );
  return voxelVertices;
}

var<workgroup> vertices: array<vec4<f32>, 8>;
var<workgroup> pixels: array<vec2<f32>, 8>;
var<workgroup> mvp: mat4x4<f32>;

@compute @workgroup_size(8, 1, 1)
fn projectVoxels(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>, @builtin(local_invocation_id) LocalInvocationID : vec3<u32>) {
  var voxelId = GlobalInvocationID;
  voxelId.x /= 8;
  let edgeId = LocalInvocationID.x;
  var voxelObject = voxelObjects[0];

  if(edgeId == 0){
    let viewProjectionMatrix = viewProjections.viewProjection;
    let modelMatrix = voxelObject.transform;
    mvp =  viewProjectionMatrix * modelMatrix;
    vertices = getVoxelVertices(vec3<f32>(voxelId));
  }

  workgroupBarrier();

  let vertex = vertices[edgeId];
  let clipSpaceVertex = mvp * vertex;
  var ndc = clipSpaceVertex.xyz / clipSpaceVertex.w;
  ndc = clamp(ndc, vec3<f32>(-1.0), vec3<f32>(1.0));
  var uv = (ndc.xy + vec2<f32>(1.0)) / vec2<f32>(2.0);
  pixels[edgeId] = vec2<f32>(uv * vec2<f32>(textureDimensions(albedoTex)));

  workgroupBarrier();

  let foo = textureLoad(voxels, vec3<u32>(voxelId) + vec3<u32>(voxelObject.atlasLocation), 0);
  if(foo.a == 0.0){
    return;
  }
  switch (edgeId){
    case 0: {
      drawLine(pixels[0], pixels[1]);
      break;
    }
    default :{
      break;
    }
  }
}