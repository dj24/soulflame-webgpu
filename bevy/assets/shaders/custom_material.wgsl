#import bevy_pbr::{
    pbr_fragment::pbr_input_from_standard_material,
    pbr_functions::alpha_discard,
    mesh_functions::get_world_from_local,
    mesh_functions::mesh_position_local_to_world,
    view_transformations::position_world_to_clip,
}

#import bevy_pbr::{
    prepass_io::{Vertex, VertexOutput, FragmentOutput},
    pbr_deferred_functions::deferred_output,
}

struct MyExtendedMaterial {
    color: vec4<f32>
}

@group(2) @binding(100)
var<uniform> my_extended_material: MyExtendedMaterial;

@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
  var out: VertexOutput;
  let world_from_local = get_world_from_local(vertex.instance_index);
  out.world_position = mesh_position_local_to_world(world_from_local, vec4<f32>(vertex.position, 1.0));
  out.position = position_world_to_clip(out.world_position.xyz);
  out.color = vertex.color;
  return out;
}


@fragment
fn fragment(
    in: VertexOutput,
    @builtin(front_facing) is_front: bool,
) -> FragmentOutput {
    var pbr_input = pbr_input_from_standard_material(in, is_front);
    pbr_input.material.base_color = alpha_discard(pbr_input.material, pbr_input.material.base_color);
    let out = deferred_output(in, pbr_input);
    return out;
}