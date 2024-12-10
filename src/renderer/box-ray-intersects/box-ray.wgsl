struct BoxRayInput {
  position: vec3<f32>,
  right: vec3<f32>,
  top: vec3<f32>,
  front: vec3<f32>,
};

struct BoxRayOutput {
  top: f32,
  bottom: f32,
  left: f32,
  right: f32,
  front: f32,
  back: f32,
};

@group(0) @binding(0) var<storage, read> boxRayInputs: array<BoxRayInput>;
@group(0) @binding(1) var<storage, read_write> boxRayOutputs : array<BoxRayOutput>;
@group(0) @binding(2) var<storage, read> octreeBuffer : array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> bvhNodes: array<BVHNode>;
@group(0) @binding(4) var<storage> voxelObjects : array<VoxelObject>;

// X dim is the face of the box
@compute @workgroup_size(6,1,1)
fn main(
  @builtin(local_invocation_id) localIdx : vec3<u32>,
  @builtin(workgroup_id) workgroupIdx : vec3<u32>,
) {
  let boxRayOutputIndex = workgroupIdx.x;
  let boxRayInput = boxRayInputs[boxRayOutputIndex];


  switch(localIdx.x){
    case 0: {
      let rayDirection = boxRayInput.top;
      let raymarchResult = rayMarchBVHFirstHit(boxRayInput.position, rayDirection);
      boxRayOutputs[boxRayOutputIndex].top = raymarchResult.t;
      break;
    }
    case 1: {
      let rayDirection = -boxRayInput.top;
      let raymarchResult = rayMarchBVHFirstHit(boxRayInput.position, rayDirection);
      boxRayOutputs[boxRayOutputIndex].bottom = raymarchResult.t;
      break;
    }
    case 2: {
      let rayDirection = -boxRayInput.right;
      let raymarchResult = rayMarchBVHFirstHit(boxRayInput.position, rayDirection);
      boxRayOutputs[boxRayOutputIndex].left = raymarchResult.t;
      break;
    }
    case 3: {
      let rayDirection = boxRayInput.right;
      let raymarchResult = rayMarchBVHFirstHit(boxRayInput.position, rayDirection);
      boxRayOutputs[boxRayOutputIndex].right = raymarchResult.t;
      break;
    }
    case 4: {
      let rayDirection = boxRayInput.front;

      break;
    }
    case 5: {
      let rayDirection = -boxRayInput.front;

      break;
    }
    default: {
      break;
    }
  }
}