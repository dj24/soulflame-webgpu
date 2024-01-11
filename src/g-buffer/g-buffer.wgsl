struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
};


struct PixelBufferElement {
  colour : u32,
  distance : atomic<u32>
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
@group(0) @binding(9) var<storage, read_write> pixelBuffer : array<PixelBufferElement>;
@group(0) @binding(10) var<uniform> resolution : vec2<u32>;


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

// Convert 2D index to 1D
fn convert2DTo1D(size: vec2<u32>, index2D: vec2<u32>) -> u32 {
    return index2D.y * size.x + index2D.x;
}

// Convert 1D index to 2D
fn convert1DTo2D(size: vec2<u32>, index1D: u32) -> vec2<u32> {
    return vec2(index1D % size.x, index1D / size.x);
}

fn getVoxelVertices(voxel: vec3<f32>) -> array<vec3<f32>, 8> {
  return array<vec3<f32>, 8>(
     voxel + vec3<f32>(0.0, 0.0, 0.0),
     voxel + vec3<f32>(1.0, 0.0, 0.0),
     voxel + vec3<f32>(0.0, 1.0, 0.0),
     voxel + vec3<f32>(1.0, 1.0, 0.0),
     voxel + vec3<f32>(0.0, 0.0, 1.0),
     voxel + vec3<f32>(1.0, 0.0, 1.0),
     voxel + vec3<f32>(0.0, 1.0, 1.0),
     voxel +  vec3<f32>(1.0, 1.0, 1.0)
   );
}

fn getVoxelNormals(voxel: vec3<f32>) -> array<vec3<f32>, 6> {
  return array<vec3<f32>, 6>(
    vec3<f32>(0.0, 0.0, -1.0),
    vec3<f32>(0.0, 0.0, 1.0),
    vec3<f32>(0.0, -1.0, 0.0),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(1.0, 0.0, 0.0),
    vec3<f32>(-1.0, 0.0, 0.0)

  );
}

const QUADS_PER_VOXEL = 6u;
const VOXELS_PER_WORKGROUP = 12u;
const QUADS_PER_WORKGROUP = VOXELS_PER_WORKGROUP * QUADS_PER_VOXEL;

var<workgroup> workgroup_quads: array<Quad, QUADS_PER_WORKGROUP>;

struct Quad {
  v1 : vec3<f32>,
  v2 : vec3<f32>,
  v3 : vec3<f32>,
  v4 : vec3<f32>,
  normal : vec3<f32>
};

fn getVoxelQuads(voxel: vec3<f32>) -> array<Quad, QUADS_PER_VOXEL> {
  let vertices = getVoxelVertices(voxel);
  let normals = getVoxelNormals(voxel);
  return array<Quad, QUADS_PER_VOXEL>(
    Quad(vertices[0], vertices[1], vertices[2], vertices[3], normals[0]),
    Quad(vertices[4], vertices[5], vertices[6], vertices[7], normals[1]),
    Quad(vertices[0], vertices[1], vertices[4], vertices[5], normals[2]),
    Quad(vertices[2], vertices[3], vertices[6], vertices[7], normals[3]),
    Quad(vertices[0], vertices[2], vertices[4], vertices[6], normals[4]),
    Quad(vertices[1], vertices[3], vertices[5], vertices[7], normals[5])
  );
}

fn isVerexInScreenSpace(v: vec3<f32>) -> bool {
  return v.x >= 0.0 && v.x < f32(resolution.x) && v.y >= 0.0 && v.y < f32(resolution.y) && v.z >= 0.5 && v.z < 10000;
}

fn drawQuad(mvp: mat4x4<f32>, quad: Quad, packedColour: u32) {
  let v1 = project(mvp, quad.v1);
  let v2 = project(mvp, quad.v2);
  let v3 = project(mvp, quad.v3);
  let v4 = project(mvp, quad.v4);

  if(!isVerexInScreenSpace(v1) || !isVerexInScreenSpace(v2) || !isVerexInScreenSpace(v3) || !isVerexInScreenSpace(v4)) {
    return;
  }

  draw_triangle(v1, v2, v3, packedColour);
  draw_triangle(v2, v3, v4, packedColour);

//  drawLineTriangle(v1, v2, v3, packedColour);
//  drawLineTriangle(v2, v3, v4, packedColour);
}

fn barycentric(v1: vec3<f32>, v2: vec3<f32>, v3: vec3<f32>, p: vec2<f32>) -> vec3<f32> {
  let u = cross(
    vec3<f32>(v3.x - v1.x, v2.x - v1.x, v1.x - p.x),
    vec3<f32>(v3.y - v1.y, v2.y - v1.y, v1.y - p.y)
  );

  if (abs(u.z) < 1.0) {
    return vec3<f32>(-1.0, 1.0, 1.0);
  }

  return vec3<f32>(1.0 - (u.x+u.y)/u.z, u.y/u.z, u.x/u.z);
}

fn get_min_max(v1: vec3<f32>, v2: vec3<f32>, v3: vec3<f32>) -> vec4<f32> {
  var min_max = vec4<f32>();
  min_max.x = min(min(v1.x, v2.x), v3.x);
  min_max.y = min(min(v1.y, v2.y), v3.y);
  min_max.z = max(max(v1.x, v2.x), v3.x);
  min_max.w = max(max(v1.y, v2.y), v3.y);

  return min_max;
}

// Hack to allow us to use atomic min, we cant use it on floats
const DEPTH_PRECISION = 1000000.0;

fn drawLine(v1: vec2<f32>, v2: vec2<f32>, packedColour: u32) {
  let dist = distance(v1, v2);
  for (var i = 0.0; i < dist; i += 1.0) {
    let x = u32(v1.x + (v2.x - v1.x) * (i / dist));
    let y = u32(v1.y + (v2.y - v1.y) * (i / dist));
    let bufferIndex = convert2DTo1D(resolution, vec2<u32>(x, y));

    pixelBuffer[bufferIndex].colour = packedColour;
    atomicStore(&pixelBuffer[bufferIndex].distance, 255u);

  }
}

/**
  * Writes screen space triangle to pixel buffer
  * For each vertex, x and y are screen coordinates, z is depth
*/
fn draw_triangle(v1: vec3<f32>, v2: vec3<f32>, v3: vec3<f32>, packedColour: u32) {
  let min_max = get_min_max(v1, v2, v3);
  let startX = u32(min_max.x);
  let startY = u32(min_max.y);
  let endX = u32(min_max.z);
  let endY = u32(min_max.w);

  for (var x: u32 = startX; x <= endX; x = x + 1u) {
    for (var y: u32 = startY; y <= endY; y = y + 1u) {
      let bc = barycentric(v1, v2, v3, vec2(f32(x), f32(y)));
      if (bc.x < 0.0 || bc.y < 0.0 || bc.z < 0.0) {
        continue;
      }
      let bufferIndex = convert2DTo1D(resolution, vec2<u32>(x, y));
      let depth = bc.x * v1.z + bc.y * v2.z + bc.z * v3.z;
      let intDepth = u32(depth * DEPTH_PRECISION);
      let currentDepth = atomicLoad(&pixelBuffer[bufferIndex].distance);
      if(intDepth < currentDepth || currentDepth == 0u) {
        pixelBuffer[bufferIndex].colour = packedColour;
        atomicStore(&pixelBuffer[bufferIndex].distance, intDepth);
      }
    }
  }
}

fn drawLineTriangle(v1: vec3<f32>, v2: vec3<f32>, v3: vec3<f32>, packedColour: u32) {
  drawLine(v1.xy, v2.xy, packedColour);
  drawLine(v2.xy, v3.xy, packedColour);
  drawLine(v3.xy, v1.xy,  packedColour);
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

struct nearFarPlane {
  near : f32,
  far : f32
};

fn extractNearFarPlane(projectionMatrix: mat4x4<f32>) -> nearFarPlane {
  let a = projectionMatrix[2][2];
  let b = projectionMatrix[3][2];
  let near = b / (a - 1.0);
  let far = b / (a + 1.0);
  return nearFarPlane(near, far);
}

/**
  x = quad id * voxel idx
  y = voxel idy
  z = voxel idz
**/

// TOOD: share multiple voxels in the workgroup
@compute @workgroup_size(QUADS_PER_WORKGROUP, 1, 1)
fn projectVoxels(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>, @builtin(local_invocation_id) LocalInvocationID : vec3<u32>) {
    var voxelId = GlobalInvocationID;
    var localVoxelId = LocalInvocationID / VOXELS_PER_WORKGROUP;
    var quadId = LocalInvocationID.x;
    let localQuadId = quadId % QUADS_PER_VOXEL;
    voxelId.x = voxelId.x / QUADS_PER_VOXEL;
    var voxelObject = voxelObjects[0];
    var objectSpaceVoxel = vec3<f32>(voxelId);
    let viewProjectionMatrix = viewProjections.viewProjection;
    let inverseViewProjectionMatrix = viewProjections.inverseViewProjection;
    let modelMatrix = voxelObject.transform;
    let mvp =  viewProjectionMatrix * modelMatrix;
    let clipSpaceVoxel = mvp * vec4(objectSpaceVoxel, 1.0);
    let worldSpaceVoxel = modelMatrix * vec4(objectSpaceVoxel, 1.0);
    var ndc = clipSpaceVoxel.xyz / clipSpaceVoxel.w;
    var uv = (ndc.xy + vec2<f32>(1.0)) / vec2<f32>(2.0);
    uv.y = 1.0 - uv.y;


    // Only calculate quads once per voxel
    let isFirstQuadOfVoxel = localQuadId == 0u;
    if(isFirstQuadOfVoxel) {
      let workgroup_quads_temp = getVoxelQuads(objectSpaceVoxel);
      for (var i: u32 = 0u; i < 6u; i = i + 1u) {
        workgroup_quads[quadId + i] = workgroup_quads_temp[i];
      }
    }

    workgroupBarrier();

    // Empty voxel
    let foo = textureLoad(voxels, vec3<u32>(voxelId) + vec3<u32>(voxelObject.atlasLocation), 0);
    if(foo.a == 0.0){
      return;
    }

    let nearFar = extractNearFarPlane(viewProjections.projection);
    let far = nearFar.far;

    var viewDirection = normalize(worldSpaceVoxel.xyz - cameraPosition);

    let worldNormal = normalize((vec4<f32>(workgroup_quads[quadId].normal, 0.0) * voxelObject.transform).xyz);
//    if(dot(worldNormal, viewDirection) > 0.0) {
//      return;
//    }
    let lambert = dot(worldNormal, normalize(vec3<f32>(0.5, -1.0, -0.5)));
    let colour = abs(vec4(lambert * foo.rgb, 1.0));
    let packedColour =  pack4x8unorm(colour);
    drawQuad(mvp, workgroup_quads[quadId], packedColour);

}

@compute @workgroup_size(8, 8, 1)
fn bufferToScreen(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let bufferIndex = convert2DTo1D(textureDimensions(albedoTex), GlobalInvocationID.xy);
  let colour = pixelBuffer[bufferIndex].colour;
  let unpackedColour = unpack4x8unorm(colour);
  let depth = atomicLoad(&pixelBuffer[bufferIndex].distance);
  let unpackedDepth = f32(depth) / DEPTH_PRECISION;
  let pixel = convert1DTo2D(textureDimensions(albedoTex), bufferIndex);
//  textureStore(albedoTex, pixel, vec4(unpackedDepth * 0.1));
  textureStore(albedoTex, pixel, unpackedColour);
}