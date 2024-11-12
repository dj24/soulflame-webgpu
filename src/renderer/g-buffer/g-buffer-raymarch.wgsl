struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>,
  viewMatrix : mat4x4<f32>,
};


fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

fn getVelocityStatic(worldPos: vec3<f32>, viewProjections:ViewProjectionMatrices) -> vec2<f32>{
  let vp = viewProjections.viewProjection;
  let previousVp = viewProjections.previousViewProjection;

  let clipSpace = vp * vec4(worldPos.xyz, 1.0);
  let previousClipSpace = previousVp * vec4(worldPos.xyz, 1.0);

  let ndc = clipSpace.xyz / clipSpace.w;
  let previousNdc = previousClipSpace.xyz / previousClipSpace.w;

  var uv = ndc.xy * 0.5 + 0.5;
  var previousUv = previousNdc.xy * 0.5 + 0.5;

  var velocity = previousUv - uv;
  return velocity;
}

fn getDebugColor(index: u32) -> vec4<f32> {
  let colors = array<vec4<f32>, 8>(
    vec4<f32>(1.0, 0.0, 0.0, 1.0),
    vec4<f32>(0.0, 1.0, 0.0, 1.0),
    vec4<f32>(0.0, 0.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 0.0, 1.0),
    vec4<f32>(1.0, 0.0, 1.0, 1.0),
    vec4<f32>(0.0, 1.0, 1.0, 1.0),
    vec4<f32>(1.0, 1.0, 1.0, 1.0),
    vec4<f32>(0.5, 0.5, 0.5, 1.0)
  );
  return colors[index % 8];
}

fn getVelocity(objectPos: vec3<f32>, modelMatrix: mat4x4<f32>, previousModelMatrix: mat4x4<f32>, viewProjections: ViewProjectionMatrices) -> vec2<f32> {
  let vp = viewProjections.viewProjection;
  let previousVp = viewProjections.previousViewProjection;

  // Get current object space position of the current pixel
  let objectClipSpace = vp * modelMatrix * vec4(objectPos.xyz, 1.0);
  let objectNDC = objectClipSpace.xyz / objectClipSpace.w;

  // Get previous position of the current object space position
  let previousObjectClipSpace = previousVp * previousModelMatrix * vec4(objectPos.xyz, 1.0);
  let previousObjectNDC = previousObjectClipSpace.xyz / previousObjectClipSpace.w;

  // UV
  var uv = objectNDC.xy * 0.5 + 0.5;
  var previousUv = previousObjectNDC.xy * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;
  previousUv.y = 1.0 - previousUv.y;

  // Get velocity based on the difference between the current and previous positions
  var velocity = previousUv - uv;
  return velocity;
}


fn customNormalize(value: f32, min: f32, max: f32) -> f32 {
    return (value - min) / (max - min);
}

fn intersectSphere(origin: vec3<f32>, dir: vec3<f32>, spherePos: vec3<f32>, sphereRad: f32) -> f32
{
	let oc = origin - spherePos;
	let b = 2.0 * dot(dir, oc);
	let c = dot(oc, oc) - sphereRad*sphereRad;
	let disc = b * b - 4.0 * c;
	if (disc < 0.0)
	{
	  return -1.0;
	}

//    float q = (-b + ((b < 0.0) ? -sqrt(disc) : sqrt(disc))) / 2.0;
  let q = (-b + select(sqrt(disc), -sqrt(disc), b < 0.0)) / 2.0;
	var t0 = q;
	var t1 = c / q;
	if (t0 > t1) {
		var temp = t0;
		t0 = t1;
		t1 = temp;
	}
	if (t1 < 0.0){
	  return -1.0;
	}

  return select(t0, t1, t0 < 0.0);
}

fn skyDomeIntersection(ro: vec3<f32>, rd: vec3<f32>) -> f32 {
    return intersectSphere(ro, rd, vec3<f32>(0.0, 0.0, 0.0), FAR_PLANE);
}

const TLAS_INSTANCE_COUNT = 16;
var<workgroup> voxelObjectIndices: array<i32, TLAS_INSTANCE_COUNT>;

fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
    return index2D.y * width + index2D.x;
}

fn encodeDepth(depth: f32) -> u32 {
    let reversedDepth = FAR_PLANE - depth;
    return u32(reversedDepth * 200000.0);
}

fn decodeDepth(depth: u32) -> f32 {
    let reversedDepth = f32(depth) / 200000.0;
    return FAR_PLANE - reversedDepth;
}

// Store reveresed so that 0 is the far plane
fn storeDepth(pixel: vec2<u32>, depth: f32) -> u32 {
    let texSize = textureDimensions(albedoTex);
    let index = convert2DTo1D(texSize.x, pixel);
    return atomicMax(&depthBuffer[index], encodeDepth(depth));
}

// x,y = local pixel position
@compute @workgroup_size(3, 3, 8)
fn main(
    @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
    @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
    @builtin(workgroup_id) WorkgroupID : vec3<u32>,
) {
  let localPixel = vec2<u32>(LocalInvocationID.xy);
  let bufferIndex = GlobalInvocationID.z;

  let resolution = textureDimensions(albedoTex);
  let pixel = vec2<u32>(screenRayBuffer[bufferIndex].xy) + localPixel;
  let isOutOfScreenBounds = any(pixel >= resolution);
  let isOutOfBufferBounds = bufferIndex >= indirectBuffer[3];
  let voxelObjectIndex = screenRayBuffer[bufferIndex].z;

  let rayOrigin = cameraPosition;
  var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
  var rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
  var worldPos = rayOrigin + skyDomeIntersection(rayOrigin, rayDirection) * rayDirection;
  var normal = vec3(0.0);
  var albedo = vec3(0.0);
  var velocity = vec2(0.0);
  let voxelObject = voxelObjects[voxelObjectIndex];

  var rayMarchResult = rayMarchOctree(voxelObject, rayDirection, rayOrigin, 9999.0);

  let previousDepth = decodeDepth(storeDepth(pixel, rayMarchResult.t));

  if(rayMarchResult.t < previousDepth){
    let objectIndexPtr = &objectIndexBuffer[convert2DTo1D(resolution.x, pixel)];
    atomicStore(objectIndexPtr, u32(voxelObjectIndex));
  }
}
