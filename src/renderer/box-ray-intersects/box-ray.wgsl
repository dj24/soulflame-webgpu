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
  var rayDirection = vec3(0.0);

  boxRayOutputs[boxRayOutputIndex].top = -1.0;
  boxRayOutputs[boxRayOutputIndex].bottom = -1.0;
  boxRayOutputs[boxRayOutputIndex].left = -1.0;
  boxRayOutputs[boxRayOutputIndex].right = -1.0;



  switch(localIdx.x){
    case 0: {
      rayDirection = boxRayInput.top;

      break;
    }
    case 1: {
      rayDirection = -boxRayInput.top;

      break;
    }
    case 2: {
      rayDirection = -boxRayInput.right;

      break;
    }
    case 3: {
      rayDirection = boxRayInput.right;

      break;
    }
    case 4: {
      rayDirection = boxRayInput.front;

      break;
    }
    case 5: {
      rayDirection = -boxRayInput.front;

      break;
    }
    default: {
      break;
    }
  }
}