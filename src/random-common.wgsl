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

fn randomInPlanarUnitDisk(seed : vec2<f32>, normal: vec3<f32>) -> vec3<f32> {
    let disk = randomInUnitDisk(seed);
    var diskNormal = cross(normal, vec3<f32>(0.0, 1.0, 0.0));
    if (length(diskNormal) < 0.01) {
        diskNormal = cross(normal, vec3<f32>(1.0, 0.0, 0.0));
    }
    diskNormal = normalize(diskNormal);
    let diskTangent = cross(diskNormal, normal);
    return disk.x * diskTangent + disk.y * diskNormal;
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
    let inUnitSphere = randomUnitVector(co);
    if (dot(inUnitSphere, normal) > 0.0) {
        return inUnitSphere;
    }
    return -inUnitSphere;
}

// Function to perturb the normal vector within the hemisphere
fn perturbDirection(normal: vec3<f32>, scatterAmount: f32, co: vec2<f32>) -> vec3<f32> {
    // Generate a random vector in a hemisphere
    let hemisphereVector : vec3<f32> = randomInHemisphere(co, normal);

    // Combine the perturbation with the original normal
    let perturbedDir : vec3<f32> = normalize(normal + scatterAmount * hemisphereVector);

    return perturbedDir;
}

fn permute4(x: vec4<f32>) -> vec4<f32> { return ((x * 34. + 1.) * x) % vec4<f32>(289.); }
fn taylorInvSqrt4(r: vec4<f32>) -> vec4<f32> { return 1.79284291400159 - 0.85373472095314 * r; }
fn fade3(t: vec3<f32>) -> vec3<f32> { return t * t * t * (t * (t * 6. - 15.) + 10.); }

fn perlinNoise3(P: vec3<f32>) -> f32 {
    var Pi0 : vec3<f32> = floor(P); // Integer part for indexing
    var Pi1 : vec3<f32> = Pi0 + vec3<f32>(1.); // Integer part + 1
    Pi0 = Pi0 % vec3<f32>(289.);
    Pi1 = Pi1 % vec3<f32>(289.);
    let Pf0 = fract(P); // Fractional part for interpolation
    let Pf1 = Pf0 - vec3<f32>(1.); // Fractional part - 1.
    let ix = vec4<f32>(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    let iy = vec4<f32>(Pi0.yy, Pi1.yy);
    let iz0 = Pi0.zzzz;
    let iz1 = Pi1.zzzz;

    let ixy = permute4(permute4(ix) + iy);
    let ixy0 = permute4(ixy + iz0);
    let ixy1 = permute4(ixy + iz1);

    var gx0: vec4<f32> = ixy0 / 7.;
    var gy0: vec4<f32> = fract(floor(gx0) / 7.) - 0.5;
    gx0 = fract(gx0);
    var gz0: vec4<f32> = vec4<f32>(0.5) - abs(gx0) - abs(gy0);
    var sz0: vec4<f32> = step(gz0, vec4<f32>(0.));
    gx0 = gx0 + sz0 * (step(vec4<f32>(0.), gx0) - 0.5);
    gy0 = gy0 + sz0 * (step(vec4<f32>(0.), gy0) - 0.5);

    var gx1: vec4<f32> = ixy1 / 7.;
    var gy1: vec4<f32> = fract(floor(gx1) / 7.) - 0.5;
    gx1 = fract(gx1);
    var gz1: vec4<f32> = vec4<f32>(0.5) - abs(gx1) - abs(gy1);
    var sz1: vec4<f32> = step(gz1, vec4<f32>(0.));
    gx1 = gx1 - sz1 * (step(vec4<f32>(0.), gx1) - 0.5);
    gy1 = gy1 - sz1 * (step(vec4<f32>(0.), gy1) - 0.5);

    var g000: vec3<f32> = vec3<f32>(gx0.x, gy0.x, gz0.x);
    var g100: vec3<f32> = vec3<f32>(gx0.y, gy0.y, gz0.y);
    var g010: vec3<f32> = vec3<f32>(gx0.z, gy0.z, gz0.z);
    var g110: vec3<f32> = vec3<f32>(gx0.w, gy0.w, gz0.w);
    var g001: vec3<f32> = vec3<f32>(gx1.x, gy1.x, gz1.x);
    var g101: vec3<f32> = vec3<f32>(gx1.y, gy1.y, gz1.y);
    var g011: vec3<f32> = vec3<f32>(gx1.z, gy1.z, gz1.z);
    var g111: vec3<f32> = vec3<f32>(gx1.w, gy1.w, gz1.w);

    let norm0 = taylorInvSqrt4(
        vec4<f32>(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 = g000 * norm0.x;
    g010 = g010 * norm0.y;
    g100 = g100 * norm0.z;
    g110 = g110 * norm0.w;
    let norm1 = taylorInvSqrt4(
        vec4<f32>(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 = g001 * norm1.x;
    g011 = g011 * norm1.y;
    g101 = g101 * norm1.z;
    g111 = g111 * norm1.w;

    let n000 = dot(g000, Pf0);
    let n100 = dot(g100, vec3<f32>(Pf1.x, Pf0.yz));
    let n010 = dot(g010, vec3<f32>(Pf0.x, Pf1.y, Pf0.z));
    let n110 = dot(g110, vec3<f32>(Pf1.xy, Pf0.z));
    let n001 = dot(g001, vec3<f32>(Pf0.xy, Pf1.z));
    let n101 = dot(g101, vec3<f32>(Pf1.x, Pf0.y, Pf1.z));
    let n011 = dot(g011, vec3<f32>(Pf0.x, Pf1.yz));
    let n111 = dot(g111, Pf1);

    var fade_xyz: vec3<f32> = fade3(Pf0);
    let temp = vec4<f32>(f32(fade_xyz.z)); // simplify after chrome bug fix
    let n_z = mix(vec4<f32>(n000, n100, n010, n110), vec4<f32>(n001, n101, n011, n111), temp);
    let n_yz = mix(n_z.xy, n_z.zw, vec2f(f32(fade_xyz.y))); // simplify after chrome bug fix
    let n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
}