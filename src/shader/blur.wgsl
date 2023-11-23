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

struct BoxIntersectionResult {
    tNear: f32,
    tFar: f32,
    normal: vec3<f32>
}

fn boxIntersection(
    ro: vec3<f32>,
    rd: vec3<f32>,
    boxSize: vec3<f32>,
) -> BoxIntersectionResult {
    var result = BoxIntersectionResult();

    let offsetRayOrigin = ro - boxSize;
    let m: vec3<f32> = 1.0 / rd;
    let n: vec3<f32> = m * offsetRayOrigin;
    let k: vec3<f32> = abs(m) * boxSize;

    let t1: vec3<f32> = -n - k;
    let t2: vec3<f32> = -n + k;

    let tN: f32 = max(max(t1.x, t1.y), t1.z);
    let tF: f32 = min(min(t2.x, t2.y), t2.z);

    if (tN > tF || tF < 0.0) {
        result.tNear = -1.0;
        result.tFar = -1.0;
        result.normal = vec3(0.0);

        return result;
    }

    var normal = select(
        step(vec3<f32>(tN), t1),
        step(t2, vec3<f32>(tF)),
        tN < 0.0,
    );

    normal *= -sign(rd);

    result.tNear = tN;
    result.tFar = tF;
    result.normal = normal;

    return result;
}

@group(0) @binding(0) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> time : u32;
@group(0) @binding(2) var<uniform> resolution : vec2<u32>;
@group(0) @binding(3) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(4) var<uniform> cameraPosition : vec3<f32>;

const EPSILON = 0.0001;
const BORDER_WIDTH = 0.025;
const BOUNDS_SIZE = 64.0;
const MAX_RAY_STEPS = 128;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
let timeOffset = (sin(f32(time) * 0.001) * 0.5 + 0.5) * 2.0;
  let pixel = vec2<f32>(f32(GlobalInvocationID.x), f32(resolution.y - GlobalInvocationID.y));
  let uv = pixel / vec2<f32>(resolution);
  let rayOrigin = cameraPosition;
  var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
  var boxSize = vec3<f32>(BOUNDS_SIZE);
  let intersect = boxIntersection(rayOrigin, rayDirection, boxSize * 0.5);
  var colour = sample_sky(rayDirection);
  let tNear = intersect.tNear;
  let startingPos = rayOrigin + (tNear + EPSILON)  * rayDirection;
  if(tNear > 0.0){
  }
      var pos = startingPos;
      var normal = vec3(0.0);
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
      
      while(stepsTaken <= MAX_RAY_STEPS)
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
        let isInBounds = all(currentIndex > vec3(0.0)) && all(currentIndex < vec3(BOUNDS_SIZE));
        if(!isInBounds){
            break;
        }
        let isSolidVoxel = sin(currentIndex.x * 0.25) - sin(currentIndex.z * 0.25) > (currentIndex.y - 8) * 0.4;
        if(isSolidVoxel){
            occlusion = true;
            break;
        }
      }
        
      // Voxel borders
      let positionInVoxel = fract(pos);
      let positionInBounds = fract(startingPos / BOUNDS_SIZE);
      let voxelBorder = step(positionInVoxel, vec3(1 - BORDER_WIDTH)) - step(positionInVoxel, vec3(BORDER_WIDTH));
      let boundsBorderWidth = BORDER_WIDTH / BOUNDS_SIZE * 2.0;
      let boundsBorder = step(positionInBounds, vec3(1 - boundsBorderWidth)) - step(positionInBounds, vec3(boundsBorderWidth));
      let isVoxelBorder = step(length(voxelBorder), 1.0);
      let isBoundsBorder = step(length(boundsBorder), 1.0);
      let baseColour = normal;
      occlusion = true;
      if(occlusion){    
        colour = mix(baseColour,baseColour * 0.8,isVoxelBorder);
      }
      colour = mix(colour,vec3(0.0,1.0,0.0),isBoundsBorder);
     
 

  textureStore(outputTex, GlobalInvocationID.xy, vec4(colour,1));
}
