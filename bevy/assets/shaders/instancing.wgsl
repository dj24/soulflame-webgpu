#import bevy_pbr::mesh_functions::{get_world_from_local, mesh_position_local_to_clip}
#import bevy_pbr::{
    pbr_functions::alpha_discard,
    pbr_functions,
    pbr_types,
}

#ifdef PREPASS_PIPELINE
#import bevy_pbr::{
    prepass_io::{VertexOutput, FragmentOutput},
    pbr_deferred_functions::deferred_output,
}
#else
#import bevy_pbr::{
    forward_io::{VertexOutput, FragmentOutput},
    pbr_functions::{apply_pbr_lighting, main_pass_post_lighting_processing},
    pbr_types::STANDARD_MATERIAL_FLAGS_UNLIT_BIT,
}
#endif

struct Vertex {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
};

struct Instance {
  @location(3) pos_x_extent: u32, // 5+5+5 
  @location(4) color_y_extent: u32,
}

@group(1) @binding(0) var<uniform> model_matrix: mat4x4<f32>;

@vertex
fn vertex(vertex: Vertex, instance: Instance) -> VertexOutput {
    let unpacked_pos_x_extent = unpack4xU8(instance.pos_x_extent);
    let x_pos = f32(unpacked_pos_x_extent.x);
    let y_pos = f32(unpacked_pos_x_extent.y);
    let z_pos = f32(unpacked_pos_x_extent.z);

    let unpacked_color_y_extent = unpack4xU8(instance.color_y_extent);

    let x_scale = f32(unpacked_pos_x_extent.w);
    let y_scale = f32(unpacked_color_y_extent.w);

    var scale = vec3(0.0);
    // Use the normal to determine how to apply the scale
    if (abs(vertex.normal.x) > 0.5) {
        // For faces pointing in X direction (left/right), scale Y and Z
        scale = vec3(1.0, x_scale, y_scale);
    } else if (abs(vertex.normal.y) > 0.5) {
        // For faces pointing in Y direction (top/bottom), scale X and Z
        scale = vec3(x_scale, 1.0, y_scale);
    } else {
        // For faces pointing in Z direction (front/back), scale X and Y
        scale = vec3(x_scale, y_scale, 1.0);
    }

    let local_position = vertex.position * scale + vec3(x_pos,y_pos,z_pos);
    var out: VertexOutput;
    out.position = mesh_position_local_to_clip(model_matrix, vec4<f32>(local_position, 1.0));
    out.color = vec4(f32(unpacked_color_y_extent.r) / 31.0,f32(unpacked_color_y_extent.g) / 31.0,f32(unpacked_color_y_extent.b) / 31.0,1.0);
    // TODO: transform normal into world space
    out.world_normal = normalize(vertex.normal);
    out.world_position = model_matrix * vec4<f32>(local_position, 1.0);
//    out.color = out.world_position / 256.0;
    return out;
}

@fragment
fn fragment(
    in: VertexOutput,
    @builtin(front_facing) is_front: bool,
) -> FragmentOutput {
    // generate a PbrInput struct from the StandardMaterial bindings
    var pbr_input: pbr_types::PbrInput = pbr_types::pbr_input_new();
    pbr_input.material.perceptual_roughness = 1.0;
    pbr_input.is_orthographic = false;
    pbr_input.V = pbr_functions::calculate_view(in.world_position, pbr_input.is_orthographic);
    pbr_input.frag_coord = in.position;
    pbr_input.world_position = in.world_position;
    pbr_input.material.base_color = in.color;
    pbr_input.world_normal = pbr_functions::prepare_world_normal(
      in.world_normal,
      true,
      is_front,
    );
    #ifdef LOAD_PREPASS_NORMALS
        pbr_input.N = prepass_utils::prepass_normal(in.position, 0u);
    #else
        pbr_input.N = normalize(pbr_input.world_normal);
    #endif
    pbr_input.material.base_color = alpha_discard(pbr_input.material, pbr_input.material.base_color);

#ifdef PREPASS_PIPELINE
    let out = deferred_output(in, pbr_input);
#else
    // in forward mode, we calculate the lit color immediately, and then apply some post-lighting effects here.
    // in deferred mode the lit color and these effects will be calculated in the deferred lighting shader
    var out: FragmentOutput;
    out.color = apply_pbr_lighting(pbr_input);
//    if (pbr_input.material.flags & STANDARD_MATERIAL_FLAGS_UNLIT_BIT) == 0u {
//        out.color = apply_pbr_lighting(pbr_input);
//    } else {
//        out.color = pbr_input.material.base_color;
//    }

    // apply in-shader post processing (fog, alpha-premultiply, and also tonemapping, debanding if the camera is non-hdr)
    // note this does not include fullscreen postprocessing effects like bloom.
    out.color = main_pass_post_lighting_processing(pbr_input, out.color);
#endif
//    return out.color = in.world_position;
    return out;
}