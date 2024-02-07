fn drawLine(start: vec2<i32>, end: vec2<i32>, color: vec4<f32>) {
  let delta = end - start;
  let numPixels = max(abs(delta.x), abs(delta.y));
  let step = delta / numPixels;
  for (var i = 0; i < numPixels; i = i + 1) {
    let pixel = start + step * i;
    let inputSample = textureLoad(inputTex, pixel.xy, 0);
    textureStore(outputTex, pixel.xy, mix(inputSample, color, color.a));
  }
}

fn barycentricCoords(p: vec2<i32>, p0: vec2<i32>, p1: vec2<i32>, p2: vec2<i32>) -> vec3<f32> {
  let v0 = vec2<f32>(p1 - p0);
  let v1 = vec2<f32>(p2 - p0);
  let v2 = vec2<f32>(p - p0);
  let d00 = dot(v0, v0);
  let d01 = dot(v0, v1);
  let d11 = dot(v1, v1);
  let d20 = dot(v2, v0);
  let d21 = dot(v2, v1);
  let denom = d00 * d11 - d01 * d01;
  let v = (d11 * d20 - d01 * d21) / denom;
  let w = (d00 * d21 - d01 * d20) / denom;
  let u = 1.0 - v - w;
  return vec3<f32>(u, v, w);
}

fn fillTriangle(p0: vec2<i32>, p1: vec2<i32>, p2: vec2<i32>, color: vec4<f32>) {
  let minX = min(min(p0.x, p1.x), p2.x);
  let minY = min(min(p0.y, p1.y), p2.y);
  let maxX = max(max(p0.x, p1.x), p2.x);
  let maxY = max(max(p0.y, p1.y), p2.y);
  let edgeThreshold = 0.02;
  for (var x = minX; x < maxX; x = x + 1) {
    for (var y = minY; y < maxY; y = y + 1) {
      let p = vec2<i32>(x, y);
      let barycentric = barycentricCoords(p, p0, p1, p2);
      let isEdge = any(barycentric < vec3(edgeThreshold)) || any(barycentric > vec3(1.0 - edgeThreshold));
      if (barycentric.x >= 0.0 && barycentric.y >= 0.0 && barycentric.z >= 0.0) {
        let inputSample = textureLoad(inputTex, p, 0);
        textureStore(outputTex, p, mix(inputSample, color, color.a * select(0.0, 1.0, isEdge)));
      }
    }
  }
}

fn wireframeTriangle(p0: vec2<i32>, p1: vec2<i32>, p2: vec2<i32>, color: vec4<f32>) {
  drawLine(p0, p1, color);
  drawLine(p1, p2, color);
  drawLine(p2, p0, color);
}

fn project(mvp: mat4x4<f32>, p: vec3<f32>) -> vec3<f32> {
  let resolution = textureDimensions(inputTex, 0).xy;
  let clipSpaceVertex = mvp * vec4(p,1.0);
  var ndc = clipSpaceVertex.xyz / clipSpaceVertex.w;
  ndc = clamp(ndc, vec3<f32>(-1.0), vec3<f32>(1.0));
  var uv = (ndc.xy + vec2<f32>(1.0)) / vec2<f32>(2.0);
  uv.y = 1.0 - uv.y;
  uv.x = 1.0 - uv.x;
  let screenSpaceVertex = vec2<f32>(uv * vec2<f32>(resolution));
  return vec3<f32>(screenSpaceVertex, clipSpaceVertex.z);
}


const LINE_THICKNESS = 1;
const LINE_COLOUR = vec4<f32>(1.0, 1.0, 1.0, 0.25);
const EDGES_PER_CUBE = 12;

const BOX_VERTICES = array<vec3<f32>, 8>(
  vec3<f32>(0.0, 0.0, 0.0),
  vec3<f32>(1.0, 0.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0),
  vec3<f32>(1.0, 1.0, 0.0),
  vec3<f32>(0.0, 0.0, 1.0),
  vec3<f32>(1.0, 0.0, 1.0),
  vec3<f32>(0.0, 1.0, 1.0),
  vec3<f32>(1.0, 1.0, 1.0)
);

const FACE_COLOURS = array<vec4<f32>, 6>(
  vec4<f32>(1.0, 0.0, 0.0, 0.5),
  vec4<f32>(0.0, 1.0, 0.0, 0.5),
  vec4<f32>(0.0, 0.0, 1.0, 0.5),
  vec4<f32>(1.0, 1.0, 0.0, 0.5),
  vec4<f32>(1.0, 0.0, 1.0, 0.5),
  vec4<f32>(0.0, 1.0, 1.0, 0.5)
);

const BOX_TRIANGLES = array<u32, 36>(
  0, 1, 2, 2, 1, 3, // Front face
  4, 6, 5, 6, 7, 5, // Back face
  0, 2, 4, 4, 2, 6, // Top face
  1, 5, 3, 5, 7, 3, // Bottom face
  0, 4, 1, 4, 5, 1, // Left face
  2, 3, 6, 6, 3, 7  // Right face
);

const BOX_EDGES = array<u32, 24>(
  0, 1, 1, 3, 3, 2, 2, 0, // Front face
  4, 5, 5, 7, 7, 6, 6, 4, // Back face
  0, 4, 1, 5, 2, 6, 3, 7  // Connecting edges
);

const TRIANGLES_PER_CUBE = 12;
@compute @workgroup_size(TRIANGLES_PER_CUBE, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>, @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
){

  let objectIndex = WorkGroupID.x;
  let triangleIndex = LocalInvocationID.x;

//  if(triangleIndex > 1) {
//    return;
//  }

  var voxelObject = voxelObjects[objectIndex];
  let viewProjectionMatrix = viewProjections.viewProjection;
  let modelMatrix = voxelObject.transform;
  let mvp =  viewProjectionMatrix * modelMatrix;

  let startIndex = BOX_EDGES[triangleIndex * 2 ];
  let endIndex = BOX_EDGES[triangleIndex * 2 + 1];
  let startVertex = BOX_VERTICES[startIndex] * voxelObject.size;
  let endVertex = BOX_VERTICES[endIndex] * voxelObject.size;

  let projectedStart = project(mvp, startVertex);
  let projectedEnd = project(mvp, endVertex);

  if(projectedStart.z < 0.0 && projectedEnd.z < 0.0) {
    return;
  }

  let startPixel = vec2<i32>(projectedStart.xy);
  let endPixel = vec2<i32>(projectedEnd.xy);
  drawLine(startPixel, endPixel, LINE_COLOUR);



//    let v = triangleIndex * 3;
//    let v1 = BOX_VERTICES[BOX_TRIANGLES[v]] * voxelObject.size;
//    let v2 = BOX_VERTICES[BOX_TRIANGLES[v + 1]] * voxelObject.size;
//    let v3 = BOX_VERTICES[BOX_TRIANGLES[v + 2]] * voxelObject.size;
//
//    let p1 = project(mvp, v1);
//    let p2 = project(mvp, v2);
//    let p3 = project(mvp, v3);
//
//    if(p1.z < 0.0 || p2.z < 0.0 || p3.z < 0.0) {
//      return;
//    }
//
//    let p1i = vec2<i32>(p1.xy);
//    let p2i = vec2<i32>(p2.xy);
//    let p3i = vec2<i32>(p3.xy);
//
//    let faceIndex = triangleIndex / 2;
//    fillTriangle(p1i, p2i, p3i, LINE_COLOUR);


}