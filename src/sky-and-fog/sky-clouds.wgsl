const PI	 	= 3.141592;
const EPSILON_NRM = 0.0001; // TODO: use resolution to normalize

struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
};

// Cloud parameters
const EARTH_RADIUS = 6300e3;
const CLOUD_START = 800.0;
const CLOUD_HEIGHT = 900.0;
const SUN_POWER = vec3(1.0,0.9,0.6) * 750.;
const LOW_SCATTER = vec3(1.0, 0.7, 0.5);

@group(0) @binding(0) var depth : texture_2d<f32>;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var outputTex : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(4) var<uniform> sunDirection : vec3<f32>;
@group(0) @binding(5) var<uniform> time : Time;
@group(0) @binding(6) var blueNoiseTex : texture_2d<f32>;
@group(0) @binding(7) var pebbleTex : texture_2d<f32>;
@group(0) @binding(8) var linearSampler : sampler;
@group(0) @binding(9) var<uniform> cameraPosition : vec3<f32>;
@group(1) @binding(1) var skyCube : texture_cube<f32>;
@group(1) @binding(2) var skyCubeWrite : texture_storage_2d_array<rgba8unorm, write>;
@group(1) @binding(3) var lastSkyCube : texture_2d_array<f32>;


// Noise generation functions (by iq)
fn hash( n: f32 ) -> f32
{
    return fract(sin(n)*43758.5453);
}

fn hash2( p: vec2<f32> ) -> f32 {
    return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);
}

fn sampleBlueNoise( uv: vec2<f32> ) -> vec2<f32>
{
    return textureSampleLevel(blueNoiseTex, linearSampler, uv, 0.0).rg;
}

fn samplePebbles( uv: vec2<f32> ) -> f32
{
  return textureSampleLevel(pebbleTex, linearSampler, uv, 0.0).r;
}

fn noise3( x:vec3<f32> ) -> f32
{
  var p = floor(x);
  var f = fract(x);
  f = f*f*(3.0 - 2.0 *f);
	let uv = (p.xy+vec2(37.0,17.0)*p.z) + f.xy;
	let rg = sampleBlueNoise((uv+0.5)/256.0).yx;
	return mix( rg.x, rg.y, f.z );
}

fn noise2( p:vec2<f32> ) -> f32
{
  let i = floor( p );
  var f = fract( p );
	f = f*f*(3.0 - 2.0*f);
  return -1.0+2.0*mix( mix( hash2( i + vec2(0.0,0.0) ),
                     hash2( i + vec2(1.0,0.0) ), f.x),
                mix( hash2( i + vec2(0.0,1.0) ),
                     hash2( i + vec2(1.0,1.0) ), f.x), f.y);
}

fn fbm( p: vec3<f32> ) -> f32
{
    var pCopy = p;
    let m = mat3x3<f32>( 0.00,  0.80,  0.60,
              -0.80,  0.36, -0.48,
              -0.60, -0.48,  0.64 );
    var f = 0.5000*noise3( pCopy );
    pCopy = m*pCopy*2.02;
    f += 0.2500*noise3( pCopy );
    pCopy = m*pCopy*2.03;
    f += 0.1250*noise3( pCopy );
    return f;
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

// TODO: pass time buffer

// return the density of clouds at a given point, and height
fn clouds(p: vec3<f32>) -> vec2<f32>
{
    var pCopy = p;
    let atmoHeight = length(p - vec3(0.0, -EARTH_RADIUS, 0.0)) - EARTH_RADIUS;
    let cloudHeight = clamp((atmoHeight-CLOUD_START)/(CLOUD_HEIGHT), 0.0, 1.0);
    pCopy.z += time.elapsed*10.3;
    let largeWeather = clamp((samplePebbles(-0.00005*pCopy.zx) - 0.18)*5.0, 0.0, 2.0);
    pCopy.x += time.elapsed*8.3;
    var weather = largeWeather*max(0.0,samplePebbles(0.0002*pCopy.zx) - 0.28)/0.72;
    weather *= smoothstep(0.0, 0.5, cloudHeight) * smoothstep(1.0, 0.5, cloudHeight);
    let cloudShape = pow(weather, 0.3+1.5*smoothstep(0.2, 0.5, cloudHeight));
    if(cloudShape <= 0.0){
        return vec2(0.0, cloudHeight);
    }
    pCopy.x += time.elapsed*12.3;
	  var den= max(0.0, cloudShape - 0.7*fbm(p*.01));
    if(den <= 0.0){
        return vec2(0.0, cloudHeight);
    }
    pCopy.y += time.elapsed*15.2;
    den= max(0.0, den - 0.2*fbm(p*0.05));
    return vec2(largeWeather*0.2*min(1.0, 5.0*den), cloudHeight);
}

// From https://www.shadertoy.com/view/4sjBDG
fn numericalMieFit( costh: f32) -> f32
{
    // This function was optimized to minimize (delta*delta)/reference in order to capture
    // the low intensity behavior.
    var bestParams = array<f32, 10>();
    bestParams[0]=9.805233e-06;
    bestParams[1]=-6.500000e+01;
    bestParams[2]=-5.500000e+01;
    bestParams[3]=8.194068e-01;
    bestParams[4]=1.388198e-01;
    bestParams[5]=-8.370334e+01;
    bestParams[6]=7.810083e+00;
    bestParams[7]=2.054747e-03;
    bestParams[8]=2.600563e-02;
    bestParams[9]=-4.552125e-12;

    var p1 = costh + bestParams[3];
    let expValues = exp(vec4(bestParams[1] *costh+bestParams[2], bestParams[5] *p1*p1, bestParams[6] *costh, bestParams[9] *costh));
    let expValWeight= vec4(bestParams[0], bestParams[4], bestParams[7], bestParams[8]);
    return dot(expValues, expValWeight);
}

fn lightRay(p: vec3<f32>, phaseFunction: f32, dC: f32, mu: f32, sun_direction: vec3<f32>, cloudHeight: f32) -> f32
{
    let nbSampleLight = 4;
	  let zMaxl         = 300.;
    let stepL         = zMaxl/f32(nbSampleLight);
    var pCopy = p;
    var cloudHeightCopy = cloudHeight;

    var lighRayDen = 0.0;
    pCopy += sun_direction*stepL*hash(dot(pCopy, vec3(12.256, 2.646, 6.356)) + time.elapsed);
    for(var j=0; j<nbSampleLight; j++)
    {
        let cloudsResult = clouds( pCopy + sun_direction*f32(j)*stepL);
        lighRayDen += cloudsResult.x;
        cloudHeightCopy = cloudsResult.y;
    }
    let scatterAmount = mix(0.008, 1.0, smoothstep(0.96, 0.0, mu));
    let beersLaw = exp(-stepL*lighRayDen)+0.5*scatterAmount*exp(-0.1*stepL*lighRayDen)+scatterAmount*0.4*exp(-0.02*stepL*lighRayDen);
    return beersLaw * phaseFunction * mix(0.05 + 1.5*pow(min(1.0, dC*8.5), 0.3+5.5*cloudHeightCopy), 1.0, clamp(lighRayDen*0.4, 0.0, 1.0));
}


fn Schlick (f0: f32, VoH: f32 ) -> f32
{
	return f0+(1.-f0)*pow(1.0-VoH,5.0);
}

fn skyRay(org: vec3<f32>, dir: vec3<f32>,sun_direction: vec3<f32>) -> vec3<f32>
{
  let ATM_START = EARTH_RADIUS+CLOUD_START;
	let ATM_END = ATM_START+CLOUD_HEIGHT;

  let nbSample = 16;
  var color = vec3(0.0);
  let distToAtmStart = intersectSphere(org, dir, vec3(0.0, -EARTH_RADIUS, 0.0), ATM_START);
  let distToAtmEnd = intersectSphere(org, dir, vec3(0.0, -EARTH_RADIUS, 0.0), ATM_END);
  var p = org + distToAtmStart * dir;
  let stepS = (distToAtmEnd-distToAtmStart) / f32(nbSample);
  var T = 1.;
  let mu = dot(sun_direction, dir);
  let phaseFunction = numericalMieFit(mu);
  p += dir*stepS*hash(dot(dir, vec3(12.256, 2.646, 6.356)) + time.elapsed);
  if(dir.y > 0.01){
    for(var i=0; i<nbSample; i++)
    {
      let cloudResult = clouds(p);
      let cloudHeight = cloudResult.y;
      let density = cloudResult.x;
      if(density>0.)
      {
        let intensity = lightRay(p, phaseFunction, density, mu, sun_direction, cloudHeight);
        let ambient = (0.5 + 0.6*cloudHeight)*vec3(0.2, 0.5, 1.0)*6.5 + vec3(0.8) * max(0.0, 1.0 - 2.0*cloudHeight);
        var radiance = ambient + SUN_POWER*intensity;
        radiance*=density;
        color += T*(radiance - radiance * exp(-density * stepS)) / density;   // By Seb Hillaire
        T *= exp(-density*stepS);
        if( T <= 0.05){
          break;
        }
      }
      p += dir*stepS;
    }
  }

  let pC = org + intersectSphere(org, dir, vec3(0.0, -EARTH_RADIUS, 0.0), ATM_END+1000.0)*dir;
  color += T*vec3(3.0)*max(0.0, fbm(vec3(1.0, 1.0, 1.8)*pC*0.002) - 0.4);

	var background = 6.0*mix(vec3(0.2, 0.52, 1.0), vec3(0.8, 0.95, 1.0), pow(0.5+0.5*mu, 15.0))+mix(vec3(3.5), vec3(0.0), min(1.0, 2.3*dir.y));
  background += T*vec3(1e4*smoothstep(0.9998, 1.0, mu));
  color += background * T;

  return color;
}

fn D_GGX(r: f32,  NoH: f32, h: vec3<f32>) -> f32
{
    let a = NoH * r;
    let k = r / ((1.0 - NoH * NoH) + a * a);
    return k * k * (1.0 / PI);
}

fn HenyeyGreenstein(mu: f32, inG: f32) -> f32
{
	return (1.-inG * inG)/(pow(1.+inG*inG - 2.0 * inG*mu, 1.5)*4.0* PI);
}

fn tonemapACES( x: vec3<f32> ) -> vec3<f32>
{
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return (x*(a*x+b))/(x*(c*x+d)+e);
}


fn sample_sky(rayDirection: vec3<f32>, rayOrigin: vec3<f32>) -> vec3<f32> {
    return skyRay(rayOrigin, rayDirection,sunDirection);
}

struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  previousInverseViewProjection : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>
};

// Function to mimic the ease_out_expo function
fn ease_out_expo(x: f32) -> f32 {
    let t: f32 = x;
    let b: f32 = 0.0;
    let c: f32 = 1.0;
    let d: f32 = 1.0; // Set the duration within the function
    let intermediate_result: f32 = c * (-pow(2.0, -10.0 * t / d) + 1.0) + b;
    return select(intermediate_result, b + c, t == d);
}

const SKY_COLOUR: vec3<f32> = vec3<f32>(0.6, 0.8, 0.9);
const START_DISTANCE: f32 = 0.0;
const FOG_DENSITY: f32 = 0.01;
const NEAR: f32 = 0.5;
const FAR: f32 = 10000.0;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    let resolution = textureDimensions(depth);
    let pixel = GlobalInvocationID.xy;
    var uv = vec2<f32>(pixel) / vec2<f32>(resolution);
    let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
    let rayOrigin = cameraPosition;
    //let sky = sample_sky(rayDirection, rayOrigin);
    let sky = textureSampleLevel(skyCube, linearSampler, rayDirection, 0.0).rgb;

    let mu = dot(sunDirection, rayDirection);

    var color = sky;
    let fogDistance = intersectSphere(rayOrigin, rayDirection, vec3(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS+160.0);
    let fogPhase = 0.5*HenyeyGreenstein(mu, 0.7)+0.5*HenyeyGreenstein(mu, -0.6);
    //color = mix(fogPhase*0.1*LOW_SCATTER*SUN_POWER+10.0*vec3(0.55, 0.8, 1.0), color, exp(-0.0003*fogDistance));
    //color = tonemapACES(color * 0.1);

    for(var x = 0u; x < 1u; x++){
      for(var y = 0u; y < 1u; y++){
         let offsetPixel = pixel + vec2(x, y);
         let depthSample = textureLoad(depth, offsetPixel, 0).r;
         let inputSample = textureLoad(inputTex, offsetPixel, 0).rgb;
         let dist = NEAR * FAR / (FAR - depthSample * (FAR - NEAR));
         let depthFactor = clamp(exp(-(dist - START_DISTANCE) * FOG_DENSITY), 0.0, 1.0);
         let output = vec4(mix(color,inputSample, depthFactor), 1);
         textureStore(outputTex, offsetPixel, output);
      }
    }
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

fn getCubeRayDirection(uv: vec2<f32>, faceIndex: u32) -> vec3<f32>
{
  let uMapped = uv.x * 2.0 - 1.0;
  let vMapped = uv.y * 2.0 - 1.0;

  switch(faceIndex)
  {
    case 0{return vec3<f32>(1.0, -vMapped, -uMapped);}
    case 1{return vec3<f32>(-1.0, -vMapped, uMapped);}
    case 2{return vec3<f32>(uMapped, 1.0, vMapped);}
    case 3{return vec3<f32>(uMapped, -1.0, -vMapped);}
    case 4{return vec3<f32>(uMapped, -vMapped, 1.0);}
    case 5{return vec3<f32>(-uMapped, -vMapped, -1.0);}
    default{return vec3<f32>(0.0);}
  }
}

@compute @workgroup_size(8, 8, 1)
fn writeToCube(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let cubeFaceIndex = GlobalInvocationID.z;
  if(cubeFaceIndex == 3){
    // Down
    return;
  }
  let pixel = GlobalInvocationID.xy;
  var rayDirection = getCubeRayDirection(vec2<f32>(pixel) / vec2<f32>(textureDimensions(skyCubeWrite).xy), cubeFaceIndex);
  if(rayDirection.y < 0.0){
    return;
  }
  rayDirection = normalize(rayDirection);
  let sky = sample_sky(rayDirection, cameraPosition);
  let mu = dot(sunDirection, rayDirection);
  let fogDistance = intersectSphere(cameraPosition, rayDirection, vec3(0.0, -EARTH_RADIUS, 0.0), EARTH_RADIUS+160.0);
  let fogPhase = 0.5*HenyeyGreenstein(mu, 0.7)+0.5*HenyeyGreenstein(mu, -0.6);
  var colour = sky;
  colour = mix(fogPhase*0.1*LOW_SCATTER*SUN_POWER+10.0*vec3(0.55, 0.8, 1.0), colour, exp(-0.0003*fogDistance));
  colour = tonemapACES(colour * 0.1);

  let previousColour = textureLoad(lastSkyCube, pixel, cubeFaceIndex, 0).rgb;
  colour = mix(previousColour, colour, 0.1);

  textureStore(skyCubeWrite, pixel, cubeFaceIndex, vec4(colour,1));
}