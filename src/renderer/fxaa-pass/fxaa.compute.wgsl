
fn convertToLuminance(color : vec4<f32>) -> f32 {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

// North, East, South, West, Middle pixels
struct LuminanceData {
  n: f32,
  e: f32,
  s: f32,
  w: f32,
  m: f32,
  ne: f32,
  se: f32,
  sw: f32,
  nw: f32
}

fn sampleLuminanceNeighbours(tex: texture_2d<f32>, pixel: vec2<i32>) -> LuminanceData {
  let n = textureLoad(tex, pixel + vec2(0, -1), 0).r;
  let e = textureLoad(tex, pixel + vec2(1, 0), 0).r;
  let s = textureLoad(tex, pixel + vec2(0, 1), 0).r;
  let w = textureLoad(tex, pixel + vec2(-1, 0), 0).r;
  let m = textureLoad(tex, pixel, 0).r;
  let ne = textureLoad(tex, pixel + vec2(1, -1), 0).r;
  let se = textureLoad(tex, pixel + vec2(1, 1), 0).r;
  let sw = textureLoad(tex, pixel + vec2(-1, 1), 0).r;
  let nw = textureLoad(tex, pixel + vec2(-1, -1), 0).r;
  return LuminanceData(n, e, s, w, m, ne, se, sw, nw);
}

fn getPixelBlendFactor(l: LuminanceData, contrast: f32) -> f32 {
  var blendFactor = 2.0 * (l.n + l.e + l.s + l.w);
  blendFactor += l.ne + l.se + l.sw + l.nw;
  blendFactor *= 1.0 / 12.0;
  blendFactor = abs(blendFactor - l.m);
  blendFactor = saturate(blendFactor / contrast);
  blendFactor = smoothstep(0.0, 1.0, blendFactor);
  return blendFactor * blendFactor;
}

struct EdgeData {
  isHorizontal: bool,
  pixelStep: i32,
  oppositeLuminance: f32,
  gradient: f32
}

fn determineEdge(l: LuminanceData) -> EdgeData {
  var edgeData = EdgeData();
  let horizontal = abs(l.n + l.s - 2 * l.m) * 2 + abs(l.ne + l.se - 2 * l.e) + abs(l.nw + l.sw - 2 * l.w);
  let vertical = abs(l.e + l.w - 2 * l.m) * 2 + abs(l.ne + l.nw - 2 * l.n) + abs(l.se + l.sw - 2 * l.s);
  edgeData.isHorizontal = horizontal >= vertical;
  let pLuminance = select(l.e,l.n, edgeData.isHorizontal);
  let nLuminance = select(l.w,l.s, edgeData.isHorizontal);
  let pGradient = abs(pLuminance - l.m);
  let nGradient = abs(nLuminance - l.m);
  edgeData.pixelStep = select(1, -1, edgeData.isHorizontal);
  if(pGradient < nGradient){
    edgeData.pixelStep = -edgeData.pixelStep;
    edgeData.oppositeLuminance = nLuminance;
    edgeData.gradient = nGradient;
  } else{
    edgeData.oppositeLuminance = pLuminance;
    edgeData.gradient = pGradient;
  }
  return edgeData;
}

fn determineEdgeBlendFactor(l: LuminanceData, edge: EdgeData, pixel: vec2<i32>) -> f32 {
  var pixelEdge = pixel;
  var edgeStep: vec2<i32>;
  if(edge.isHorizontal){
    pixelEdge.y += edge.pixelStep;
    edgeStep = vec2(1,0);
  } else {
    pixelEdge.x += edge.pixelStep;
    edgeStep = vec2(0,1);
  }

  let edgeLuminance = (l.m + edge.oppositeLuminance) * 0.5;
  let gradientThreshold = edge.gradient * 0.25;
  var puv = pixelEdge + edgeStep;
  var pLuminanceDelta = textureLoad(intermediaryTexture, puv, 0).r - edgeLuminance;
  var pAtEnd = abs(pLuminanceDelta) >= gradientThreshold;

  for (var i = 0; i < 16 && !pAtEnd; i++) {
    puv += edgeStep;
    pLuminanceDelta = textureLoad(intermediaryTexture, puv, 0).r - edgeLuminance;
    pAtEnd = abs(pLuminanceDelta) >= gradientThreshold;
  }

  var nuv = pixelEdge - edgeStep;
  var nLuminanceDelta = textureLoad(intermediaryTexture, nuv, 0).r - edgeLuminance;
  var nAtEnd = abs(nLuminanceDelta) >= gradientThreshold;

  var pDistance: i32;
  var nDistance: i32;
  var deltaSign: bool;
  if(edge.isHorizontal){
    pDistance = puv.x - pixel.x;
    nDistance = pixel.x - nuv.x;
    deltaSign = pLuminanceDelta > 0;
  } else {
    pDistance = puv.y - pixel.y;
    nDistance = pixel.y - nuv.y;
    deltaSign = nLuminanceDelta > 0;
  }

  if(deltaSign == (l.m - edgeLuminance >= 0)){
    return 0.0;
  }

  var shortestDistance: i32;
  if(pDistance < nDistance){
    shortestDistance = pDistance;
  } else {
    shortestDistance = nDistance;
  }

  return 0.5 - f32(shortestDistance) / f32(pDistance + nDistance);
}

@compute @workgroup_size(8, 8, 1)
fn main(
    @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let texSize = textureDimensions(outputTex);
  let pixel = GlobalInvocationID.xy;
  let inputSample = textureLoad(inputTex, pixel, 0);
  let luminance = convertToLuminance(inputSample);
  textureStore(outputTex, pixel, vec4(luminance));
}

const CONTRAST_THRESHOLD : f32 = 0.0312;
const RELATIVE_THRESHOLD : f32 = 0.063;

@compute @workgroup_size(8, 8, 1)
fn composite(
    @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
   let pixel = vec2<i32>(GlobalInvocationID.xy);
   let inputSample = textureLoad(inputTex, pixel, 0);
   let luminanceNeighbours = sampleLuminanceNeighbours(intermediaryTexture, pixel);
   let highest = max(luminanceNeighbours.n, max(luminanceNeighbours.e, max(luminanceNeighbours.s, max(luminanceNeighbours.w, luminanceNeighbours.m))));
   let lowest = min(luminanceNeighbours.n, min(luminanceNeighbours.e, min(luminanceNeighbours.s, min(luminanceNeighbours.w, luminanceNeighbours.m))));
   let contrast = highest - lowest;
   let threshold = max(CONTRAST_THRESHOLD, RELATIVE_THRESHOLD * highest);
   if(contrast < threshold){
    return;
   }
   let pixelBlendFactor = getPixelBlendFactor(luminanceNeighbours, contrast);
   let edge = determineEdge(luminanceNeighbours);
   var samplePixel = pixel;
   if(edge.isHorizontal){
     samplePixel.x += edge.pixelStep;
   } else {
     samplePixel.y += edge.pixelStep;
   }

    let edgeBlendFactor = determineEdgeBlendFactor(luminanceNeighbours, edge, pixel);
    let finalBlend = max(pixelBlendFactor, edgeBlendFactor);

     var output = mix(inputSample, textureLoad(inputTex, samplePixel, 0), finalBlend);

   textureStore(outputTex, pixel, output);
}