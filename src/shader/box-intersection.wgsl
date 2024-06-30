struct BoxIntersectionResult {
    tNear: f32,
    tFar: f32,
    normal: vec3<f32>,
    isHit: bool,
}

fn simpleBoxIntersection(
    ro: vec3<f32>,
    rd: vec3<f32>,
    boxSize: vec3<f32>,
) -> f32 {
  let m = 1.0/rd; // can precompute if traversing a set of aligned boxes
  let n = m*ro;   // can precompute if traversing a set of aligned boxes
  let k = abs(m)*boxSize;
  let t1 = -n - k;
  let t2 = -n + k;
  let tN = max( max( t1.x, t1.y ), t1.z );
  let tF = min( min( t2.x, t2.y ), t2.z );
  if( tN>tF || tF<0.0) {
    return -1.0; // no intersection
  }
  return tN;
}

fn boxIntersection(
    ro: vec3<f32>,
    rd: vec3<f32>,
    boxSize: vec3<f32>,
) -> BoxIntersectionResult {
    var result = BoxIntersectionResult();
    result.isHit = false;
    result.tNear = -1.0;
    result.tFar = -1.0;

    let offsetRayOrigin = ro - boxSize;
    let m: vec3<f32> = 1.0 / rd;
    let n: vec3<f32> = m * offsetRayOrigin;
    let k: vec3<f32> = abs(m) * boxSize;
    let t1: vec3<f32> = -n - k;
    let t2: vec3<f32> = -n + k;
    let tN: f32 = max(max(t1.x, t1.y), t1.z);
    let tF: f32 = min(min(t2.x, t2.y), t2.z);
    if (tN > tF || tF < 0.0) {
        return result;
    }
    // Check if the ray starts inside the volume
    let insideVolume = tN < 0.0;
    var normal = select(
        step(vec3<f32>(tN), t1),
        step(t2, vec3<f32>(tF)),
        tN < 0.0,
    );
    normal *= -sign(rd);
    // Check if the intersection is in the correct direction, only if inside the volume
    if (insideVolume && dot(normal, rd) < 0.0) {
        return result;
    }
    result.tNear = tN;
    result.tFar = tF;
    result.normal = normal;
    result.isHit = true;
    return result;
}

fn get3x3From4x4(m: mat4x4<f32>) -> mat3x3<f32> {
    return mat3x3<f32>(
        m[0].xyz,
        m[1].xyz,
        m[2].xyz,
    );
}


fn intersectOBB(
    ro: vec3<f32>,
    rd: vec3<f32>,
    boxSize: vec3<f32>,
    boxOrientation: mat3x3<f32>,
) -> BoxIntersectionResult {
    var result = BoxIntersectionResult();
    result.isHit = false;
    result.tNear = -1.0;
    result.tFar = -1.0;

    let offsetRayOrigin = ro - boxSize;
    let m: vec3<f32> = 1.0 / rd;
    let n: vec3<f32> = m * offsetRayOrigin;
    let k: vec3<f32> = abs(m) * boxSize;
    let t1: vec3<f32> = -n - k;
    let t2: vec3<f32> = -n + k;
    let tN: f32 = max(max(t1.x, t1.y), t1.z);
    let tF: f32 = min(min(t2.x, t2.y), t2.z);
    if (tN > tF || tF < 0.0) {
        return result;
    }
    // Check if the ray starts inside the volume
    let insideVolume = tN < 0.0;
    var normal = select(
        step(vec3<f32>(tN), t1),
        step(t2, vec3<f32>(tF)),
        tN < 0.0,
    );
    normal *= -sign(rd);
    // Check if the intersection is in the correct direction, only if inside the volume
    if (insideVolume && dot(normal, rd) < 0.0) {
        return result;
    }
    result.tNear = tN;
    result.tFar = tF;
    result.normal = normal;
    result.isHit = true;
    return result;
}