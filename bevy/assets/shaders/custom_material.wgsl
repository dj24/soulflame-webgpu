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

@group(2) @binding(100) var<storage, read> face_buffer: array<vec3<f32>>;

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

const FACE_VERTEX_POSITIONS = array(
    vec3<f32>(0.0, 0.0, 0.0),
    vec3<f32>(1.0, 0.0, 0.0),
    vec3<f32>(1.0, 1.0, 0.0),
    vec3<f32>(0.0, 1.0, 0.0),
    vec3<f32>(0.0, 0.0, 0.0),
    vec3<f32>(1.0, 1.0, 0.0),
);

@vertex
fn vertex(vertex: Vertex, @builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    var world_from_local = mesh_functions::get_world_from_local(vertex.instance_index);
    let face_index = vertex_index / 6;
    let local_vertex_index = vertex_index % 6;
    let local_vertex_position = FACE_VERTEX_POSITIONS[local_vertex_index];
    let vertex_position = local_vertex_position + face_buffer[face_index];
    out.world_position = world_from_local * vec4<f32>(vertex_position, 1.0);
    out.position = position_world_to_clip(out.world_position.xyz);
    out.world_normal = (world_from_local * vec4<f32>(0.0, 1.0, 0.0, 0.0)).xyz;
#ifdef VERTEX_COLORS
    out.color = vertex.color;
    out.color = vec4(local_vertex_position, 1.0);
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