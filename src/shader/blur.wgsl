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
const BORDER_WIDTH = 0.025;
const BOUNDS_SIZE = 16.0;

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
  var boxSize = vec3<f32>(BOUNDS_SIZE);
  let intersect = boxIntersection(rayOrigin, rayDirection, boxSize);
  var colour = sample_sky(rayDirection);
  let tNear = intersect.x;
  let startingPos = rayOrigin + (intersect.x + EPSILON)  * rayDirection;
  if(tNear > 0.0){
      var pos = startingPos;
      var normal = vec3(0.0);
      var maxSteps = 64;
      var stepsTaken = 0;
      var voxelSize = 1.0;
      var voxelStep = sign(rayDirection);
      var tIntersection = 0.0;
      var tDelta = vec3(voxelSize / abs(rayDirection));
      var scaledStartingPoint = pos / voxelSize;
      var scaledRayOrigin = vec3<f32>(rayOrigin) / voxelSize;
      var currentIndex = floor(scaledStartingPoint);
      var voxelOriginDifference = vec3<f32>(currentIndex) - scaledRayOrigin;
      var clampedVoxelBoundary = (voxelStep * 0.5) + 0.5; // 0 if <= 0, 1 if > 0
      var tMax = (voxelStep * voxelOriginDifference + clampedVoxelBoundary) * tDelta + EPSILON;
      var occlusion = false;
      
      while(stepsTaken <= maxSteps)
      {
        tIntersection = min(min(tMax.x, tMax.y), tMax.z);
        let mask = vec3(
            select(0.0, 1.0, tMax.x == tIntersection),
            select(0.0, 1.0, tMax.y == tIntersection), 
            select(0.0, 1.0, tMax.z == tIntersection)
        );
        tMax += mask * tDelta;
        currentIndex += mask * voxelStep;
        normal = vec3(mask * -voxelStep);
        pos = rayOrigin + rayDirection * tIntersection;
        stepsTaken ++;
        if(sin(currentIndex.x * 0.25) - sin(currentIndex.z * 0.25) > currentIndex.y * 0.4){
            occlusion = true;
            break;
        }
      }
        
      // Voxel borders
      let positionInVoxel = fract(pos);
      let positionInBounds = fract(startingPos / BOUNDS_SIZE);
      let voxelBorder = step(positionInVoxel, vec3(1 - BORDER_WIDTH)) - step(positionInVoxel, vec3(BORDER_WIDTH));
      let boundsBorder = step(positionInBounds, vec3(1 - BORDER_WIDTH)) - step(positionInBounds, vec3(BORDER_WIDTH));
      let isVoxelBorder = step(length(voxelBorder), 1.0);
      let isBoundsBorder = step(length(boundsBorder), 1.0);
        var baseColour = clamp(vec3(currentIndex / 4.0), vec3(0.0), vec3(1.0)) + vec3(0.5);
      if(occlusion){    
        colour = mix(baseColour,baseColour * 0.5,isVoxelBorder);
      }
      colour = mix(colour,vec3(0.0,1.0,0.0),isBoundsBorder);
     
  }

  textureStore(outputTex, WorkGroupID.xy, vec4(colour,1));
}
