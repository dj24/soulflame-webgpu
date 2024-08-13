@group(0) @binding(0) var<uniform> textureWidth : u32;
@group(0) @binding(1) var<storage, read_write> pixelBuffer : array<PixelBufferElement>;

fn convert2DTo1D(width: u32, index2D: vec2<u32>) -> u32 {
    return index2D.y * width + index2D.x;
}

@compute @workgroup_size(8, 8, 1)
fn clearPixelBuffer(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let bufferIndex = convert2DTo1D(textureWidth, GlobalInvocationID.xy);
  atomicStore(&pixelBuffer[bufferIndex].colour, 0u);
  atomicStore(&pixelBuffer[bufferIndex].distance, bitcast<u32>(10000.0));
}

