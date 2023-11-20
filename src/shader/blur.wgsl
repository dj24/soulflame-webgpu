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

const EPSILON = 0.0001;

const BORDER_WIDTH = 0.01;

@compute @workgroup_size(1, 1, 1)
fn main(
  @builtin(workgroup_id) WorkGroupID : vec3<u32>,
  @builtin(local_invocation_id) LocalInvocationID : vec3<u32>
) {
let timeOffset = (sin(f32(time) * 0.001) * 0.5 + 0.5) * 2.0;
  let pixel = vec2<f32>(f32(WorkGroupID.x), f32(resolution.y - WorkGroupID.y));
  let uv = pixel / vec2<f32>(resolution);
  let rayOrigin = cameraPosition;
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var boxSize = vec3<f32>(4.0);
  let intersect = boxIntersection(rayOrigin, rayDirection, boxSize);
  var colour = sample_sky(rayDirection);
  let tNear = intersect.x;
  if(tNear > 0.0){
      let pos = rayOrigin + (intersect.x +EPSILON)  * rayDirection;
      let normal = intersect.yzw;
      // Voxel borders
      let positionInVoxel = fract(pos);
      let border = step(positionInVoxel, vec3(1 - BORDER_WIDTH)) - step(positionInVoxel, vec3(BORDER_WIDTH));
      let isBorder = 1.0 - step(length(border), 1.0);
      colour = mix(vec3(0.2,0.2,0.2),vec3(0.4,0.4,0.4),isBorder);
  }

  textureStore(outputTex, WorkGroupID.xy, vec4(colour,1));
}
