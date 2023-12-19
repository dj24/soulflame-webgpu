@group(0) @binding(0) var outputTex : texture_storage_2d<rg32sint, write>;
@group(0) @binding(1) var<uniform> resolution : vec2<u32>;
@group(0) @binding(2) var<uniform> frustumCornerDirections : FrustumCornerDirections;
@group(0) @binding(3) var<uniform> cameraPosition : vec3<f32>;
@group(0) @binding(4) var<uniform> voxelObjects : array<VoxelObject, VOXEL_OBJECT_COUNT>; // TODO: dynamic amount of these using string interpolation

const DOWNSCALE_FACTOR = 4;

@group(1) @binding(0) var voxelsSampler : sampler;
@group(1) @binding(1) var voxels : texture_3d<f32>;

fn plainIntersect(ro: vec3<f32>, rd: vec3<f32>, p: vec4<f32>) -> f32 {
    return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

struct VoxelObject {
  transform: mat4x4<f32>,
  size : vec3<f32>,
  padding : f32
}

const EPSILON = 0.001;
const BORDER_WIDTH = 0.05;
const MAX_RAY_STEPS = 256;

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
)
{
   var voxelSize = 1.0;
     let downscaledResolution = resolution / DOWNSCALE_FACTOR;
     let pixel = vec2<f32>(f32(GlobalInvocationID.x), f32(downscaledResolution.y - GlobalInvocationID.y));
     let uv = pixel / vec2<f32>(downscaledResolution);
     var rayOrigin = cameraPosition;
     var rayDirection = calculateRayDirection(uv,frustumCornerDirections);
     var colour = vec3(0.0);
     var worldPos = vec3(0.0);
     var tNear = 9999999.0;
     var normal = vec3(0.0);
     var albedo = vec3(0.0);
     var closestIntersection = 9999999.0;
     var hitObjectIndex = -1;
     for (var i = 0; i < VOXEL_OBJECT_COUNT; i++) {
       var voxelObject = voxelObjects[i];
       // Empty object, go to next
       if(voxelObject.size.x == 0.0){
         continue;
       }
       let objectRayOrigin = (voxelObject.transform * vec4<f32>(rayOrigin, 1.0)).xyz;
       let objectRayDirection = (voxelObject.transform * vec4<f32>(rayDirection, 0.0)).xyz;
       let intersect = boxIntersection(objectRayOrigin, objectRayDirection, voxelObject.size * 0.5);
       let boundingBoxSurfacePosition = objectRayOrigin + (intersect.tNear - EPSILON)  * objectRayDirection;
       let isStartingInBounds = all(boundingBoxSurfacePosition > vec3(0.0)) && all(boundingBoxSurfacePosition < vec3(voxelObject.size / voxelSize));
       let isBackwardsIntersection = intersect.tNear < 0.0 && !isStartingInBounds;
       if(!isBackwardsIntersection){
         closestIntersection = intersect.tNear;
         hitObjectIndex = 0;
         break;
       }
     }
    textureStore(outputTex, GlobalInvocationID.xy, vec4(hitObjectIndex, 0,0, 0));

}
