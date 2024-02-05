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

fn project(mvp: mat4x4<f32>, p: vec3<f32>) -> vec3<f32> {
  let resolution = textureDimensions(inputTex, 0).xy;
  let clipSpaceVertex = mvp * vec4(p,1.0);
  var ndc = clipSpaceVertex.xyz / clipSpaceVertex.w;
  ndc = clamp(ndc, vec3<f32>(-1.0), vec3<f32>(1.0));
  var uv = (ndc.xy + vec2<f32>(1.0)) / vec2<f32>(2.0);
  uv.y = 1.0 - uv.y;
  let screenSpaceVertex = vec2<f32>(uv * vec2<f32>(resolution));
  return vec3<f32>(screenSpaceVertex, clipSpaceVertex.z);
}


const LINE_THICKNESS = 2;
const LINE_COLOUR = vec4<f32>(1.0, 0.0, 0.0, 1.0);

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

@compute @workgroup_size(LINE_THICKNESS, LINE_THICKNESS, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>, @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
){

  let offset = vec2<i32>(LocalInvocationID.xy) - vec2<i32>(LINE_THICKNESS / 2, LINE_THICKNESS / 2);
  let distanceFromCenter = distance(vec2<f32>(offset), vec2<f32>(0.0));
  if(distanceFromCenter > f32(LINE_THICKNESS / 2)) {
    return;
  }

  var voxelObject = voxelObjects[0];
  let viewProjectionMatrix = viewProjections.viewProjection;
  let modelMatrix = voxelObject.transform;
  let mvp =  viewProjectionMatrix * modelMatrix;

  let startVertex = project(mvp, BOX_VERTICES[0] * voxelObject.size);
  let endVertex = project(mvp, BOX_VERTICES[1] * voxelObject.size);

  let startPixel = vec2<i32>(project(mvp, startVertex).xy) + offset;
  let endPixel = vec2<i32>(project(mvp, endVertex).xy) + offset;

  drawLine(startPixel, endPixel, vec4<f32>(1.0, 0.0, 0.0, 1.0));
}