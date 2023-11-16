struct FrustumCornerDirections {
  topLeft : vec3<f32>,
  topRight : vec3<f32>,
  bottomLeft : vec3<f32>,
  bottomRight : vec3<f32>
}

fn calculateRayDirection(uv: vec2<f32>, directions: FrustumCornerDirections) -> vec3<f32> {
  let topInterpolated = mix(directions.topLeft, directions.topRight, uv.x);
  let bottomInterpolated = mix(directions.bottomLeft, directions.bottomRight, uv.x);
  let finalInterpolated = mix(bottomInterpolated, topInterpolated, uv.y);
  return normalize(finalInterpolated);
}

fn sphNormal(pos: vec3<f32>, ce: vec3<f32>) -> vec3<f32>
{
  return normalize(pos-ce.xyz);
}

fn sphIntersect(ro: vec3<f32>, rd: vec3<f32>, ce: vec3<f32>, ra: f32) -> vec2<f32> {
  let oc: vec3<f32> = ro - ce;
  let b: f32 = dot(oc, rd);
  let c: f32 = dot(oc, oc) - ra * ra;
  var h: f32 = b * b - c;

  if (h < 0.0) {
      return vec2<f32>(-1.0); // no intersection
  }

  h = sqrt(h);

  return vec2<f32>(-b - h, -b + h);
}

fn boxIntersection(
    ro: vec3<f32>,
    rd: vec3<f32>,
    boxSize: vec3<f32>,
) -> vec4<f32> {
    let m: vec3<f32> = 1.0 / rd;
    let n: vec3<f32> = m * ro;
    let k: vec3<f32> = abs(m) * boxSize;

    let t1: vec3<f32> = -n - k;
    let t2: vec3<f32> = -n + k;

    let tN: f32 = max(max(t1.x, t1.y), t1.z);
    let tF: f32 = min(min(t2.x, t2.y), t2.z);

    if (tN > tF || tF < 0.0) {
        return vec4<f32>(-1.0);
    }

    var normal = select(
        step(vec3<f32>(tN), t1),
        step(t2, vec3<f32>(tF)),
        tN < 0.0,
    );

    normal *= -sign(rd);

    return vec4<f32>(tN, normal);
}

@group(0) @binding(0) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> time : u32;
@group(0) @binding(2) var<uniform> resolution : vec2<u32>;
@group(0) @binding(3) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;

@compute @workgroup_size(1, 1, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
) {
let timeOffset = (sin(f32(time) * 0.001) * 0.5 + 0.5) * 2.0;
  let pixel = vec2<f32>(f32(WorkGroupID.x), f32(resolution.y - WorkGroupID.y));
  let uv = pixel / vec2<f32>(resolution);
  let p = (2.0*pixel-vec2<f32>(resolution)) / vec2<f32>(resolution).y;
//  let rayOrigin = vec3(timeOffset * 0.5,timeOffset,5.0);
  let rayOrigin = cameraPosition;
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
//  rayDirection = normalize( vec3(p,-2.0) );
  
  let spherePos = vec3(0,timeOffset - 1.0,2.0);
  var boxSize = vec3<f32>(0.5);
  //  let intersect = sphIntersect(rayOrigin, rayDirection, spherePos, 0.5);
  let intersect = boxIntersection(rayOrigin, rayDirection, boxSize);
  var green = rayDirection.y;
  var blue = rayDirection.z;
  var red = rayDirection.x;
  if(intersect.x > 0.0){
      let pos = rayOrigin + intersect.y * rayDirection;
      let normal = intersect.yzw;
      red = normal.r;
      green = normal.g;
      blue = normal.b;
  }

  textureStore(outputTex, WorkGroupID.xy, vec4(red,green,blue,1));
}
