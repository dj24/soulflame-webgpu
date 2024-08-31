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

fn getLeftChildIndex(index: i32) -> i32 {
  return index * 2 + 1;
}

fn getRightChildIndex(index: i32) -> i32 {
  return index * 2 + 2;
}

fn getParentIndex(index: i32) -> i32 {
  return (index - 1) / 2;
}


fn dirIsNegative(dir: vec3<f32>, axis: i32) -> bool {
  return dir[axis] < 0.0;
}

fn getDebugColour(index: i32) -> vec3<f32> {
  let colours = array<vec3<f32>, 6>(
    vec3<f32>(1.0, 0.0, 0.0),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(0.0, 0.0, 1.0),
    vec3<f32>(1.0, 1.0, 0.0),
    vec3<f32>(1.0, 0.0, 1.0),
    vec3<f32>(0.0, 1.0, 1.0)
  );
  return colours[index % 6];
}


fn customNormalize(value: f32, min: f32, max: f32) -> f32 {
    return (value - min) / (max - min);
}

const IDENTITY_MATRIX = mat4x4<f32>(
  vec4<f32>(1.0, 0.0, 0.0, 0.0),
  vec4<f32>(0.0, 1.0, 0.0, 0.0),
  vec4<f32>(0.0, 0.0, 1.0, 0.0),
  vec4<f32>(0.0, 0.0, 0.0, 1.0)
);

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

const BLUE_NOISE_SIZE = 511;

fn tracePixel(pixel: vec2<u32>){
   let resolution = textureDimensions(albedoTex);
   var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
   var rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);

    // DOF
    let blueNoiseOffset = vec2<u32>(0);
    var blueNoisePixel = pixel;
    blueNoisePixel.x += time.frame * 32;
    blueNoisePixel.y += time.frame * 16;
    blueNoisePixel = (blueNoisePixel + blueNoiseOffset) % BLUE_NOISE_SIZE;
    if(time.frame % 2 == 0){
      blueNoisePixel.y = BLUE_NOISE_SIZE - blueNoisePixel.y;
    }
    if(time.frame % 3 == 0){
      blueNoisePixel.x = BLUE_NOISE_SIZE - blueNoisePixel.x;
    }
    var r = textureLoad(blueNoiseTex, blueNoisePixel, 0).rg;
    let aperture = 0.15;
    let focalDistance = 100.0;
    let randomOffset = randomInUnitDisk(r) * aperture;
    let cameraRight = vec3(viewProjections.viewMatrix[0].x, viewProjections.viewMatrix[1].x, viewProjections.viewMatrix[2].x);
    let cameraUp = vec3(viewProjections.viewMatrix[0].y, viewProjections.viewMatrix[1].y, viewProjections.viewMatrix[2].y);
    let rayOrigin = cameraPosition + randomOffset.x * cameraRight + randomOffset.y * cameraUp;
    let focalPoint = cameraPosition + normalize(rayDirection) * focalDistance;
    rayDirection = normalize(focalPoint - rayOrigin);

    var closestIntersection = RayMarchResult();
    var worldPos = vec3(0.0);
    var normal = vec3(0.0);
    var albedo = vec3(0.0);
    var velocity = vec2(0.0);
    let bvhResult = rayMarchBVH(rayOrigin, rayDirection);
    if(bvhResult.hit){
      let voxelObject = voxelObjects[bvhResult.voxelObjectIndex];
      albedo = bvhResult.colour;
      normal = transformNormal(voxelObject.inverseTransform,vec3<f32>(bvhResult.normal));
      worldPos = rayOrigin + rayDirection * bvhResult.t;
    }
    else{
      albedo = vec3(0.0);
      worldPos = rayOrigin + skyDomeIntersection(rayOrigin, rayDirection) * rayDirection;
    }
    velocity = getVelocityStatic(worldPos, viewProjections);

    textureStore(albedoTex, pixel, vec4(albedo, 1));
    textureStore(normalTex, pixel, vec4(normal,1));
    textureStore(velocityTex, pixel, vec4(velocity,0,f32(bvhResult.voxelObjectIndex)));
    textureStore(worldPosTex, pixel, vec4(worldPos,0));
}

@compute @workgroup_size(16, 8, 1)
fn main(
   @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
) {
  let pixel = GlobalInvocationID.xy;
  tracePixel(pixel);
}

@group(1) @binding(0) var<storage, read> screenRayBuffer : array<vec2<u32>>;

const REMAINING_RAY_OFFSETS = array<vec2<u32>, 8>(
  vec2<u32>(0,1),
  vec2<u32>(1,0),
  vec2<u32>(1,1),
  vec2<u32>(2,0),
  vec2<u32>(2,1),
  vec2<u32>(0,2),
  vec2<u32>(1,2),
  vec2<u32>(2,2)
);

@compute @workgroup_size(64, 1, 1)
fn bufferMarch(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>,
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
) {
  let bufferIndex = GlobalInvocationID.x / 8;
  let localRayIndex = GlobalInvocationID.x % 8;
  let pixel = screenRayBuffer[bufferIndex];
  let offsetPixel = pixel + REMAINING_RAY_OFFSETS[localRayIndex];

  tracePixel(offsetPixel);
//  textureStore(depthWrite, offsetPixel, vec4(0,0,0,0));
//   textureStore(albedoTex, offsetPixel, vec4(1,0,0,1));
}