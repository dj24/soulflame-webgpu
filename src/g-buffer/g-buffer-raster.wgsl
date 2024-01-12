struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

@group(0) @binding(0) var voxels : texture_3d<f32>;
@group(0) @binding(2) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(3) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation
// TODO: maybe make a G-Buffer bind group to resuse across shaders
@group(0) @binding(4) var normalTex : texture_storage_2d<rgba8snorm, write>;
@group(0) @binding(5) var albedoTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(6) var depthRead : texture_2d<f32>;
@group(0) @binding(7) var velocityTex : texture_storage_2d<r32float, write>;
@group(0) @binding(8) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(9) var<storage, read_write> pixelBuffer : array<PixelBufferElement>;
@group(0) @binding(10) var<uniform> resolution : vec2<u32>;

const FAR_PLANE = 10000.0;


fn convert2DTo1D(size: vec2<u32>, index2D: vec2<u32>) -> u32 {
    return index2D.y * size.x + index2D.x;
}


fn convert1DTo2D(size: vec2<u32>, index1D: u32) -> vec2<u32> {
    return vec2(index1D % size.x, index1D / size.x);
}


const TRIANGLES_PER_VOXEL =  12u;
const VOXELS_PER_WORKGROUP = 12u;
const QUADS_PER_VOXEL = 6u;
const QUADS_PER_WORKGROUP = QUADS_PER_VOXEL * VOXELS_PER_WORKGROUP;
const TRIANGLES_PER_WORKGROUP = VOXELS_PER_WORKGROUP * TRIANGLES_PER_VOXEL;

var<workgroup> workgroup_triangles: array<Triangle, TRIANGLES_PER_WORKGROUP>;

struct Quad {
  v1 : vec3<f32>,
  v2 : vec3<f32>,
  v3 : vec3<f32>,
  v4 : vec3<f32>,
  normal : vec3<f32>
};

struct Triangle {
  v1 : vec3<f32>,
  v2 : vec3<f32>,
  v3 : vec3<f32>,
  normal : vec3<f32>
};

fn isVerexInScreenSpace(v: vec3<f32>) -> bool {
  return v.x >= 0.0 && v.x < f32(resolution.x) && v.y >= 0.0 && v.y < f32(resolution.y) && v.z >= 0.0;
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
      var depth = bc.x * v1.z + bc.y * v2.z + bc.z * v3.z;
      let currentDepth = bitcast<f32>(atomicLoad(&pixelBuffer[bufferIndex].distance));
      if(depth < currentDepth || currentDepth < 0.001) {
        atomicStore(&pixelBuffer[bufferIndex].colour, packedColour);
        atomicStore(&pixelBuffer[bufferIndex].distance, bitcast<u32>(depth));
      }
    }
  }
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


const VOXEL_VERTICES = array<vec3<f32>, 8>(
  vec3<f32>(0.0, 0.0, 0.0),
  vec3<f32>(1.0, 0.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0),
  vec3<f32>(1.0, 1.0, 0.0),
  vec3<f32>(0.0, 0.0, 1.0),
  vec3<f32>(1.0, 0.0, 1.0),
  vec3<f32>(0.0, 1.0, 1.0),
  vec3<f32>(1.0, 1.0, 1.0)
);

const VOXEL_NORMALS = array<vec3<f32>, 6>(
  vec3<f32>(0.0, 0.0, -1.0),
  vec3<f32>(0.0, 0.0, 1.0),
  vec3<f32>(0.0, -1.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0),
  vec3<f32>(1.0, 0.0, 0.0),
  vec3<f32>(-1.0, 0.0, 0.0)
);

const VOXEL_TRIANGLES = array<Triangle, TRIANGLES_PER_VOXEL>(
  Triangle(VOXEL_VERTICES[0], VOXEL_VERTICES[1], VOXEL_VERTICES[2], VOXEL_NORMALS[0]),
  Triangle(VOXEL_VERTICES[1], VOXEL_VERTICES[2], VOXEL_VERTICES[3], VOXEL_NORMALS[0]),
  Triangle(VOXEL_VERTICES[4], VOXEL_VERTICES[5], VOXEL_VERTICES[6], VOXEL_NORMALS[1]),
  Triangle(VOXEL_VERTICES[5], VOXEL_VERTICES[6], VOXEL_VERTICES[7], VOXEL_NORMALS[1]),
  Triangle(VOXEL_VERTICES[0], VOXEL_VERTICES[1], VOXEL_VERTICES[4], VOXEL_NORMALS[2]),
  Triangle(VOXEL_VERTICES[1], VOXEL_VERTICES[4], VOXEL_VERTICES[5], VOXEL_NORMALS[2]),
  Triangle(VOXEL_VERTICES[2], VOXEL_VERTICES[3], VOXEL_VERTICES[6], VOXEL_NORMALS[3]),
  Triangle(VOXEL_VERTICES[3], VOXEL_VERTICES[6], VOXEL_VERTICES[7], VOXEL_NORMALS[3]),
  Triangle(VOXEL_VERTICES[0], VOXEL_VERTICES[2], VOXEL_VERTICES[4], VOXEL_NORMALS[4]),
  Triangle(VOXEL_VERTICES[2], VOXEL_VERTICES[4], VOXEL_VERTICES[6], VOXEL_NORMALS[4]),
  Triangle(VOXEL_VERTICES[1], VOXEL_VERTICES[3], VOXEL_VERTICES[5], VOXEL_NORMALS[5]),
  Triangle(VOXEL_VERTICES[3], VOXEL_VERTICES[5], VOXEL_VERTICES[7], VOXEL_NORMALS[5])
);

/**
  x = quad id * voxel idx
  y = voxel idy
  z = voxel idz
**/

// TOOD: share multiple voxels in the workgroup
@compute @workgroup_size(TRIANGLES_PER_WORKGROUP, 1, 1)
fn projectVoxels(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>, @builtin(local_invocation_id) LocalInvocationID : vec3<u32>) {
    var voxelId = GlobalInvocationID;
    voxelId.x = voxelId.x / TRIANGLES_PER_VOXEL;

    var localVoxelId = LocalInvocationID / VOXELS_PER_WORKGROUP;
    var triangleId = LocalInvocationID.x;
    let localTriangleId = triangleId % TRIANGLES_PER_VOXEL;
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

    // Empty voxel
    let foo = textureLoad(voxels, vec3<u32>(voxelId) + vec3<u32>(voxelObject.atlasLocation), 0);
    if(foo.a == 0.0){
      return;
    }

    var viewDirection = normalize(worldSpaceVoxel.xyz - cameraPosition);

    var tri = VOXEL_TRIANGLES[localTriangleId];
    tri.v1 = tri.v1 + objectSpaceVoxel;
    tri.v2 = tri.v2 + objectSpaceVoxel;
    tri.v3 = tri.v3 + objectSpaceVoxel;

    let v1 = project(mvp, tri.v1);
    let v2 = project(mvp, tri.v2);
    let v3 = project(mvp, tri.v3);

    if(!isVerexInScreenSpace(v1) && !isVerexInScreenSpace(v2) && !isVerexInScreenSpace(v3)) {
      return;
    }

    var worldPos = worldSpaceVoxel.xyz;
    let worldNormal = normalize((vec4<f32>(tri.normal, 0.0) * voxelObject.transform).xyz);
    let lambert = dot(worldNormal, normalize(vec3<f32>(0.5, -1.0, -0.5)));
    let colour = abs(vec3(lambert * foo.rgb));
    let packedColour =  pack4x8unorm(vec4(tri.normal,1));

    let triangleSize = distance(v1.xy, v2.xy) + distance(v2.xy, v3.xy) + distance(v3.xy, v1.xy);
    if(triangleSize > 256.0 || triangleSize < 0.5) {
      return;
    }
    draw_triangle(v1, v2, v3, packedColour);
}


@compute @workgroup_size(8, 8, 1)
fn bufferToScreen(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let bufferIndex = convert2DTo1D(textureDimensions(albedoTex), GlobalInvocationID.xy);
  let colour = atomicLoad(&pixelBuffer[bufferIndex].colour);
  let unpackedColour = unpack4x8unorm(colour);
  let depth = atomicLoad(&pixelBuffer[bufferIndex].distance);
  let unpackedDepth = bitcast<f32>(depth);
  let pixel = convert1DTo2D(textureDimensions(albedoTex), bufferIndex);
//  textureStore(outputTex, pixel, vec4(unpackedDepth % 0.5) * 2.0);
  textureStore(albedoTex, pixel, unpackedColour);
}