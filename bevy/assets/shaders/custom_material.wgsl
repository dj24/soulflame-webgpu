#import bevy_pbr::{
    pbr_fragment::pbr_input_from_standard_material,
    pbr_functions::alpha_discard,
    mesh_functions,
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

fn debug_color(index: u32) -> vec4<f32> {
    let colors = array(
        vec4<f32>(1.0, 0.0, 0.0, 1.0),
        vec4<f32>(0.0, 1.0, 0.0, 1.0),
        vec4<f32>(0.0, 0.0, 1.0, 1.0),
        vec4<f32>(1.0, 1.0, 0.0, 1.0),
        vec4<f32>(1.0, 0.0, 1.0, 1.0),
        vec4<f32>(0.0, 1.0, 1.0, 1.0),
    );
    return colors[index % 6];
}

@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
    var out: VertexOutput;
    var world_from_local = mesh_functions::get_world_from_local(vertex.instance_index);
    out.world_position = mesh_functions::mesh_position_local_to_world(world_from_local, vec4<f32>(vertex.position, 1.0));
    out.position = position_world_to_clip(out.world_position.xyz);
#ifdef UNCLIPPED_DEPTH_ORTHO_EMULATION
    out.unclipped_depth = out.position.z;
    out.position.z = min(out.position.z, 1.0); // Clamp depth to avoid clipping
#endif // UNCLIPPED_DEPTH_ORTHO_EMULATION
#ifdef VERTEX_UVS_A
    out.uv = vertex.uv;
#endif // VERTEX_UVS_A
#ifdef VERTEX_UVS_B
    out.uv_b = vertex.uv_b;
#endif // VERTEX_UVS_B
    out.world_normal = mesh_functions::mesh_normal_local_to_world(
        vertex.normal,
        vertex.instance_index
    );
#ifdef VERTEX_COLORS
    out.color = vertex.color;
#endif
#ifdef MOTION_VECTOR_PREPASS
    let prev_vertex = vertex;
    let prev_model = mesh_functions::get_previous_world_from_local(prev_vertex.instance_index);
    out.previous_world_position = mesh_functions::mesh_position_local_to_world(
        prev_model,
        vec4<f32>(prev_vertex.position, 1.0)
    );
#endif // MOTION_VECTOR_PREPASS
#ifdef VERTEX_OUTPUT_INSTANCE_INDEX
    out.instance_index = vertex.instance_index;
#endif
    out.color = debug_color(out.instance_index);
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