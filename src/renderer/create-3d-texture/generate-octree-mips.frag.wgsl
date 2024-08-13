@fragment
fn fragment_main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
  let srcTexel = vec3(vec2<u32>(position.xy),zIndex);
  var colours = array<f32, 8>();
  var isOctantEmpty = true;
  for(var x = u32(0); x < 2; x++){
    for(var y = u32(0); y < 2; y++){
      for(var z = u32(0); z < 2; z++){
        let voxelX = srcTexel.x * 2 + x;
        let voxelY = srcTexel.y * 2 + y;
        let voxelZ = srcTexel.z * 2 + z;
        var voxelId = vec3<u32>(voxelX,voxelY,voxelZ);
        var voxel = textureLoad(voxels,voxelId,0).r;
        if(voxel > 0){
          var index = x + y * 2 + z * 4;
          colours[index] = voxel;
          isOctantEmpty = false;
        }
      }
    }
  }

  // If all voxels in the octant are empty, keep it blank
  if(isOctantEmpty){
    discard;
  }

  // Get the most common colour in the octant
  var mostCommonColour = f32(0);
  var mostCommonColourCount = u32(0);
  for(var i = u32(0); i < 8; i = i + 1u){
    var colour = colours[i];
    var count = u32(0);
    for(var j = u32(0); j < 8; j = j + 1u){
      if(colour > 0 && colour == colours[j]){
        count++;
      }
    }
    if(count > mostCommonColourCount){
      mostCommonColour = colour;
      mostCommonColourCount = count;
    }
  }

  return vec4(mostCommonColour, 0,0,0);
}

