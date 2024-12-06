struct ViewProjectionMatrices {
  viewProjection : mat4x4<f32>,
  previousViewProjection : mat4x4<f32>,
  inverseViewProjection : mat4x4<f32>,
  inverseViewMatrix : mat4x4<f32>,
  projection : mat4x4<f32>,
  inverseProjection: mat4x4<f32>,
  viewMatrix : mat4x4<f32>,
};

@group(0) @binding(1) var<uniform> viewProjections : ViewProjectionMatrices;
@group(0) @binding(2) var<storage, read> octreeBuffer : array<vec4<u32>>;
@group(0) @binding(3) var<storage> voxelObjects : array<VoxelObject>;

fn extractNearFar(projection: mat4x4<f32>) -> vec2<f32> {
  let near = projection[3][2] / (projection[2][2] - 1.0);
  let far = projection[3][2] / (projection[2][2] + 1.0);
  return vec2<f32>(near, far);
}

struct GBufferOutput {
  @location(0) albedo : vec4f,
  @location(1) normal : vec4f,
  @location(2) worldPosition : vec4f,
  @location(3) velocity : vec4f,
  @builtin(frag_depth) depth : f32,
}

fn getVelocity(objectPos: vec3<f32>, modelMatrix: mat4x4<f32>, previousModelMatrix: mat4x4<f32>, viewProjections: ViewProjectionMatrices) -> vec3<f32> {
  let vp = viewProjections.viewProjection;
  let previousVp = viewProjections.previousViewProjection;

  // Get current object space position of the current pixel
  let objectClipSpace = vp * modelMatrix * vec4(objectPos.xyz, 1.0);
  let objectNDC = objectClipSpace.xyz / objectClipSpace.w;

  // Get previous position of the current object space position
  let previousObjectClipSpace = previousVp * previousModelMatrix * vec4(objectPos.xyz, 1.0);
  let previousObjectNDC = previousObjectClipSpace.xyz / previousObjectClipSpace.w;

  // Get velocity based on the difference between the current and previous positions
  var velocity = previousObjectNDC - objectNDC;
  velocity.y = -velocity.y;
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
    let objectRayDirection = (voxelObject.inverseTransform * vec4<f32>(ray.direction, 0.0)).xyz;
    var result = rayMarchOctree(voxelObject, ray.direction, ray.origin, 9999.0);

    if(!result.hit){
      discard;
      return output;
    }

    output.albedo = vec4(result.colour, 1.0);
    output.normal = vec4(transformNormal(voxelObject.inverseTransform,vec3<f32>(result.normal)), 0.0);
    let raymarchedDistance = length(output.worldPosition.xyz  - ray.origin);
    output.worldPosition = vec4(ray.origin + ray.direction * result.t, raymarchedDistance);

    // TODO: get from buffer
    let nearFar = extractNearFar(viewProjections.projection);
    let viewSpacePosition = (viewProjections.viewMatrix * vec4(output.worldPosition.xyz, 1.0)).xyz;
    let linearDepth = normaliseValue(nearFar[0], nearFar[1], -viewSpacePosition.z);
    output.depth = linearDepth;
    return output;
}