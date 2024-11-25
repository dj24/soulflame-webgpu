const FAR_PLANE = 1000000.0;

fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
  return index2D.y * width + index2D.x;
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

fn decodeDepth(depth: u32) -> f32 {
  let reversedDepth = f32(depth) / f32(FAR_PLANE);
  return FAR_PLANE - reversedDepth;
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

@compute @workgroup_size(8,8,1)
fn main(
@builtin(global_invocation_id) id : vec3<u32>
){
    let texSize = textureDimensions(albedoTex);
    if(any(id.xy >= texSize.xy)) {
      return;
    }
    let index = convert2DTo1D(texSize.x, id.xy);
    let depth = decodeDepth(depthBuffer[index]);
    let objectIndex = bitcast<i32>(objectIndexBuffer[index]);
    if(objectIndex == -1) {
        return;
    }
    let depthColor = vec4<f32>(1.0 - depth * 0.001, 0.0, 0.0, 1.0);
    let albedoColor = getDebugColor(u32(objectIndex));
    let uv = vec2<f32>(f32(id.x) / f32(texSize.x), f32(id.y) / f32(texSize.y));

    let index00 = convert2DTo1D(texSize.x, id.xy);

    let normal00 = unpack4x8snorm(normalBuffer[index00]).xyz;

    var normal = normal00;
    let nDotL = dot(normal, vec3<f32>(0.0, 1.0, 0.0));
    // TODO: remove nDotL here and just output albedo
    textureStore(albedoTex, id.xy, albedoColor * mix(nDotL, 1.0, 0.2));
    textureStore(normalTex, id.xy, vec4<f32>(normal, 0.0));
    let rayDirection = calculateRayDirection(uv,viewProjections.inverseViewProjection);
    let worldPos = depth * rayDirection + cameraPosition;
    let velocity = getVelocityStatic(worldPos, viewProjections);
    textureStore(velocityTex, id.xy, vec4<f32>(velocity, 0.0, 1.0));
    textureStore(worldPosTex, id.xy, vec4<f32>(worldPos, depth));
}