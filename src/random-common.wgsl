// Constants
const infinity : f32 = 99999999.0;

// Utility functions
fn degreesToRadians(degrees : f32) -> f32 {
    return degrees * (3.1415926535897932385 / 180.0);
}

fn unitVector(v : vec3<f32>) -> vec3<f32> {
    return v / length(v);
}

fn lengthSquared(v : vec3<f32>) -> f32 {
    return v.x * v.x + v.y * v.y + v.z * v.z;
}

fn random(co : vec2<f32>) -> f32 {
    return fract(sin(dot(co, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

fn randomMinMax(co : vec2<f32>, min : f32, max : f32) -> f32 {
    return min + (max - min) * random(co);
}

fn randomFloat3(co : vec2<f32>) -> vec3<f32> {
    return vec3<f32>(random(co), random(co * 2.0), random(co * 3.0));
}

fn randomFloat3MinMax(co : vec2<f32>, min : f32, max : f32) -> vec3<f32> {
    return vec3<f32>(randomMinMax(co, min, max), randomMinMax(co * 2.0, min, max), randomMinMax(co * 3.0, min, max));
}

fn randomInUnitSphere(co : vec2<f32>) -> vec3<f32> {
    var p : vec3<f32> = randomFloat3MinMax(co, -1.0, 1.0);
    while (lengthSquared(p) < 1.0) {
        p = randomFloat3MinMax(co, -1.0, 1.0);
    }
    return p;
}

fn randomInUnitDisk(seed : vec2<f32>) -> vec2<f32> {
    let r = sqrt(random(seed));
    let theta = 2.0 * 3.14159265359 * random(vec2<f32>(seed.y, seed.x));
    return vec2<f32>(cos(theta), sin(theta)) * r;
}

fn reflect(v : vec3<f32>, n : vec3<f32>) -> vec3<f32> {
    return v - 2.0 * dot(v, n) * n;
}

fn randomUnitVector(co : vec2<f32>) -> vec3<f32> {
    return unitVector(randomInUnitSphere(co));
}

fn nearZero(e : vec3<f32>) -> bool {
    const s : f32 = 1e-8;
    return (abs(e.x) < s) && (abs(e.y) < s) && (abs(e.z) < s);
}

fn randomInHemisphere(co : vec2<f32>, normal : vec3<f32>) -> vec3<f32> {
    let inUnitSphere = randomInUnitSphere(co);
    if (dot(inUnitSphere, normal) > 0.0) {
        return inUnitSphere;
    }
    return -inUnitSphere;
}