const NODES_PER_LEVEL = 8u;

/*
  gets the most common color in the octant
  if all voxels in octant are empty, keep it blank
*/
@compute @workgroup_size(4, 4, 4)
fn main(
  @builtin(global_invocation_id) srcTexel : vec3<u32>
){
  // Get the colours of the 8 voxels in the octant
  var colours = array<vec4<f32>, NODES_PER_LEVEL>();
  var isOctantEmpty = true;
  for(var x = u32(0); x < 2; x++){
    for(var y = u32(0); y < 2; y++){
      for(var z = u32(0); z < 2; z++){
        let voxelX = srcTexel.x * 2 + x + 1;
        let voxelY = srcTexel.y * 2 + y;
        let voxelZ = srcTexel.z * 2 + z;
        var voxelId = vec3<u32>(voxelX,voxelY,voxelZ);
        var voxel = textureLoad(input,voxelId,0);
        if(voxel.a > 0){
          var index = x + y * 2 + z * 4;
          colours[index] = voxel;
          isOctantEmpty = false;
        }
      }
    }
  }

  // If all voxels in the octant are empty, keep it blank
  if(isOctantEmpty){
    return;
  }

  // Get the most common colour in the octant
  var mostCommonColour = vec4<f32>(0);
  var mostCommonColourCount = u32(0);
  for(var i = u32(0); i < NODES_PER_LEVEL; i = i + 1u){
    var colour = colours[i];
    var count = u32(0);
    for(var j = u32(0); j < NODES_PER_LEVEL; j = j + 1u){
      if(colour.a > 0 && all(colour == colours[j])){
        count++;
      }
    }
    if(count > mostCommonColourCount){
      mostCommonColour = colour;
      mostCommonColourCount = count;
    }
  }

  // Write the most common colour as this nodes colour
  textureStore(output, srcTexel, mostCommonColour);
}