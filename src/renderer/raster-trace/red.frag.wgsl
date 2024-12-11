struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  inverseViewMatrix : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>,
  viewMatrix : mat4x4<f32>,
};

struct Time {
  frame: u32,
  deltaTime: f32,
  elapsed: f32
};

@group(0) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(2) var<storage, read> octreeBuffer : array<vec4<u32>>;
@group(0) @binding(3) var<storage> voxelObjects : array<VoxelObject>;
@group(0) @binding(4) var<uniform> time : Time;


struct GBufferOutput {
  @location(0) albedo : vec4f,
  @location(1) normal : vec4f,
  @location(2) worldPosition : vec4f,
  @location(3) velocity : vec4f,
  @builtin(frag_depth) depth : f32,
}

fn hash( p:vec2<i32> ) -> f32
{
  // 2D -> 1D
  var n = p.x*3 + p.y*113;

  // 1D hash by Hugo Elias
  n = (n << 13) ^ n;
  n = n * (n * n * 15731 + 789221) + 1376312589;
  return -1.0+2.0*f32( n & 0x0fffffff)/f32(0x0fffffff);
}


fn noise( p:vec2<f32> ) -> f32
{
    let i = vec2<i32>(floor( p ));
    let f = fract( p );
    // cubic interpolant
    let u = f*f*(3.0 - 2.0*f);
    return mix( mix( hash( i + vec2<i32>(0,0) ),
                     hash( i + vec2<i32>(1,0) ), u.x),
                mix( hash( i + vec2<i32>(0,1) ),
                     hash( i + vec2<i32>(1,1) ), u.x), u.y);
}


fn fractal(uv:vec2<f32>) -> f32
{
  var f = 0.0;
  var scaledUv = uv * 8.0;
  let m = mat2x2<f32>( 1.6,  1.2, -1.2,  1.6 );
  f  = 0.5000*noise( scaledUv );
  scaledUv = m*scaledUv;
  f += 0.2500*noise( scaledUv );
  scaledUv = m*scaledUv;
  f = 0.5 + 0.5*f;
  return f;
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

fn claculateObjectVelocity(worldPos:vec3<f32>, transform: mat4x4<f32>, previousTransform: mat4x4<f32>) -> vec3<f32> {
  let previousPosition = (previousTransform * vec4<f32>(worldPos, 1.0)).xyz;
  let position = (transform * vec4<f32>(worldPos, 1.0)).xyz;
  return position - previousPosition;
}


fn getVelocity(worldPos: vec3<f32>, viewProjections: ViewProjectionMatrices, objectVelocity: vec3<f32>) -> vec2<f32> {
    let vp = viewProjections.viewProjection;
    let previousVp = viewProjections.previousViewProjection;

    // Calculate the previous world position using object velocity
    let previousWorldPos = worldPos - objectVelocity;

    // Transform current and previous world positions into clip space
    let clipSpace = vp * vec4<f32>(worldPos, 1.0);
    let previousClipSpace = previousVp * vec4<f32>(previousWorldPos, 1.0);

    // Normalize to NDC
    let ndc = clipSpace.xyz / clipSpace.w;
    let previousNdc = previousClipSpace.xyz / previousClipSpace.w;

    // Convert to UV coordinates
    var uv = ndc.xy * 0.5 + 0.5;
    var previousUv = previousNdc.xy * 0.5 + 0.5;

    // Calculate velocity in screen space
    var velocity = uv - previousUv;
    return velocity;
}

struct Ray {
  origin : vec3<f32>,
  direction : vec3<f32>,
};

fn calculate_ray(ndc_coords: vec2<f32>, inverse_view_proj: mat4x4<f32>, inverse_view: mat4x4<f32>) -> Ray {
    let ndc = -ndc_coords;
    // Add the z and w for clip space
    let clip_coords_near = vec4<f32>(ndc, -1.0, 1.0); // NDC near plane
    let clip_coords_far = vec4<f32>(ndc, 1.0, 1.0);   // NDC far plane

    // Transform to world space using inverse view projection matrix
    let world_coords_near = inverse_view_proj * clip_coords_near;
    let world_coords_far = inverse_view_proj * clip_coords_far;

    // Perspective divide
    let world_pos_near = world_coords_near.xyz / world_coords_near.w;
    let world_pos_far = world_coords_far.xyz / world_coords_far.w;

    // The camera position in world space (inverse view applied to (0, 0, 0, 1))
    let ray_origin = (inverse_view * vec4<f32>(0.0, 0.0, 0.0, 1.0)).xyz;

    // The direction is the vector from the origin to the far point
    let ray_direction = normalize(world_pos_far - ray_origin);

    return Ray(ray_origin, ray_direction);
}


@fragment
fn main(
  @location(0) objectPos : vec3f,
  @location(1) worldPos : vec3f,
  @location(2) @interpolate(linear) ndc : vec3f,
  @location(3) @interpolate(flat) instanceIdx : u32
) -> GBufferOutput
 {
    let voxelObject = voxelObjects[instanceIdx];
    var output : GBufferOutput;
    let ray = calculate_ray(ndc.xy, viewProjections.inverseViewProjection, viewProjections.inverseViewMatrix);
//    let r = fractal(ndc.xy + vec2(f32(time.frame) * 0.002, 0));
    let rayDirection = ray.direction;
    let rayOrigin = ray.origin;
    var result = rayMarchOctree(voxelObject, rayDirection, rayOrigin, 9999.0);

    if(!result.hit){
      discard;
      return output;
    }

    let nDotL = dot(result.normal, normalize(vec3<f32>(0.0, 1.0, 0.0)));
    output.albedo = vec4(result.colour * mix(nDotL, 1.0, 1.0), 1.0);
    output.normal = vec4(transformNormal(voxelObject.inverseTransform,vec3<f32>(result.normal)), 0.0);

    let raymarchedDistance = length(output.worldPosition.xyz  - rayOrigin);
    output.worldPosition = vec4(rayOrigin + rayDirection * result.t - 0.0001, raymarchedDistance);

    let objectVelocity = claculateObjectVelocity(output.worldPosition.xyz, voxelObject.transform, voxelObject.previousTransform);

    output.velocity = vec4(getVelocity(output.worldPosition.xyz, viewProjections, objectVelocity), 0.0, 0.0);

    // TODO: get from buffer
    let clipSpacePosition = viewProjections.viewProjection * vec4(output.worldPosition.xyz, 1.0);
    let ndcPosition = clipSpacePosition.xyz / clipSpacePosition.w;
    output.depth = (clipSpacePosition.z / clipSpacePosition.w);
//    output.depth = 0.0;
    return output;
}