@binding(0) @group(0) var<uniform> modelViewProjectionMatrix : mat4x4f;

@vertex
fn main(
  @builtin(vertex_index) VertexIndex : u32
) -> @builtin(position) vec4f {
  var pos = array<vec4f, 3>(
    vec4(0.0, 10.0, 0, 1.0),
    vec4(-10.0, 0, 0, 1.0),
    vec4(10.0, 0.0, 0, 1.0),
  );
  let offset = vec4(-15.001907348632813,
                                    0.9799962043762207,
                                    -53.33998107910156, 0.0);

  var vertex = modelViewProjectionMatrix * (pos[VertexIndex] + offset);

  vertex = vertex / vertex.w;

  return vertex;
}
