@group(0) @binding(0) var<storage, read> model_matrices: array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> view_projection: mat4x4<f32>;

// Shadow texture and sampler
@group(1) @binding(0) var shadow_texture: texture_depth_2d;
@group(1) @binding(1) var shadow_sampler: sampler_comparison;
@group(1) @binding(2) var<uniform> shadow_view_projection: mat4x4<f32>;


struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) world_position: vec4<f32>, // World position for shadow mapping
};

struct Instance {
  @location(0) pos_x_extent: u32,// 5+5+5
  @location(1) color_y_extent: u32,
  @location(2) model_index: u32, // The index of the vertex in the vertex buffer
}

const positions = array<vec3<f32>, 24>(
    // Back
    vec3<f32>(1.0, 0.0, 0.0),  // 0: bottom-left
    vec3<f32>(0.0, 0.0, 0.0),  // 2: top-left
    vec3<f32>(1.0, 1.0, 0.0),  // 1: bottom-right
    vec3<f32>(0.0, 1.0, 0.0),   // 3: top-right
    // Front
    vec3<f32>(0.0, 0.0, 1.0),  // 0: bottom-left
    vec3<f32>(1.0, 0.0, 1.0),  // 1: bottom-right
    vec3<f32>(0.0, 1.0, 1.0),  // 2: top-left
    vec3<f32>(1.0, 1.0, 1.0),   // 3: top-right
    // Left
     vec3<f32>(0.0, 0.0, 0.0),  // 0: bottom-left
     vec3<f32>(0.0, 0.0, 1.0),  // 4: bottom-left
     vec3<f32>(0.0, 1.0, 0.0),  // 2: top-left
     vec3<f32>(0.0, 1.0, 1.0),   // 6: top-right
     // Right
     // TODO: check mesh generation to see if x is correct
     vec3<f32>(1.0, 0.0, 1.0),  // 1: bottom-right
     vec3<f32>(1.0, 0.0, 0.0),  // 3: top-right
     vec3<f32>(1.0, 1.0, 1.0),  // 5: bottom-right
     vec3<f32>(1.0, 1.0, 0.0),   // 7: top-right
      // Botttom
     vec3<f32>(0.0, 0.0, 0.0),  // 0: bottom-left
     vec3<f32>(1.0, 0.0, 0.0),  // 3: top-right
     vec3<f32>(0.0, 0.0, 1.0),  // 3: top-right
     vec3<f32>(1.0, 0.0, 1.0),
     // Top
     vec3<f32>(1.0, 1.0, 0.0),
     vec3<f32>(0.0, 1.0, 0.0),
     vec3<f32>(1.0, 1.0, 1.0),
     vec3<f32>(0.0, 1.0, 1.0),
);

fn hue_to_rgb(p: f32, q: f32, t: f32) -> f32 {
    var t_mod = t;
    if (t_mod < 0.0) {
        t_mod += 1.0;
    }
    if (t_mod > 1.0) {
        t_mod -= 1.0;
    }
    if (t_mod < 1.0 / 6.0) {
        return p + (q - p) * 6.0 * t_mod;
    }
    if (t_mod < 1.0 / 2.0) {
        return q;
    }
    if (t_mod < 2.0 / 3.0) {
        return p + (q - p) * (2.0 / 3.0 - t_mod) * 6.0;
    }
    return p;
}

fn convert_hsl_to_rgb(h: f32, s: f32, l: f32) -> vec3<f32> {
    if (s == 0.0) {
        // Achromatic (gray)
        return vec3<f32>(l, l, l);
    }

    let q = select( l + s - l * s , l * (1.0 + s), l < 0.5);
    let p = 2.0 * l - q;

    let r = hue_to_rgb(p, q, h + 1.0 / 3.0);
    let g = hue_to_rgb(p, q, h);
    let b = hue_to_rgb(p, q, h - 1.0 / 3.0);

    return vec3<f32>(r, g, b);
}


@vertex
fn vs_main(@builtin(vertex_index) in_vertex_index: u32, instance: Instance) -> VertexOutput {
    let unpacked_pos_x_extent = unpack4xU8(instance.pos_x_extent);
    let x_pos = f32(unpacked_pos_x_extent.x);
    let y_pos = f32(unpacked_pos_x_extent.y);
    let z_pos = f32(unpacked_pos_x_extent.z);

    let unpacked_color_y_extent = unpack4xU8(instance.color_y_extent);

    let x_scale = f32(unpacked_pos_x_extent.w);
    let y_scale = f32(unpacked_color_y_extent.w);

    let unpacked_h = f32(unpacked_color_y_extent.r) / 63.0;
    let unpacked_s = f32(unpacked_color_y_extent.g) / 7.0;
    let unpacked_l = f32(unpacked_color_y_extent.b) / 63.0;

    let local_vertex_index = in_vertex_index % 24u; // Ensure the index is within the bounds of the positions array

    let is_z_face = local_vertex_index < 8u; // First 8 vertices are for the front and back faces
    let is_x_face = local_vertex_index >= 8u && local_vertex_index < 16u; // Next 8 vertices are for the left and right faces
    let is_y_face = local_vertex_index >= 16u; // Last 8 vertices are for the top and bottom faces

    var scale = vec3(0.0);
    // Use the normal to determine how to apply the scale
    if (is_x_face) {
        // For faces pointing in X direction (left/right), scale Y and Z
        scale = vec3(1.0, x_scale, y_scale);
    } else if (is_y_face) {
        // For faces pointing in Y direction (top/bottom), scale X and Z
        scale = vec3(x_scale, 1.0, y_scale);
    } else {
        // For faces pointing in Z direction (front/back), scale X and Y
        scale = vec3(x_scale, y_scale, 1.0);
    }

    var normal = vec3(0.0);

    let is_plus_z_face = local_vertex_index < 4u; // First 4 vertices are for the front face
    let is_minus_z_face = local_vertex_index >= 4u && local_vertex_index < 8u; // Last 4 vertices are for the back face
    let is_plus_x_face = local_vertex_index >= 8u && local_vertex_index < 12u; // First 4 vertices are for the right face
    let is_minus_x_face = local_vertex_index >= 12u && local_vertex_index < 16u; // Last 4 vertices are for the left face
    let is_plus_y_face = local_vertex_index >= 16u && local_vertex_index < 20u; // First 4 vertices are for the top face
    let is_minus_y_face = local_vertex_index >= 20u; // Last 4 vertices are for the bottom face

    if (is_plus_z_face) {
        normal = vec3(0.0, 0.0, 1.0);
    } else if (is_minus_z_face) {
        normal = vec3(0.0, 0.0, -1.0);
    } else if (is_plus_x_face) {
        normal = vec3(1.0, 0.0, 0.0);
    } else if (is_minus_x_face) {
        normal = vec3(-1.0, 0.0, 0.0);
    } else if (is_plus_y_face) {
        normal = vec3(0.0, 1.0, 0.0);
    } else if (is_minus_y_face) {
        normal = vec3(0.0, -1.0, 0.0);
    }

    let local_pos = positions[local_vertex_index];
    let pos = local_pos * scale + vec3<f32>(x_pos, y_pos, z_pos);
    let model_view_proj = view_projection * model_matrices[instance.model_index];
    var projected_pos = model_view_proj * vec4<f32>(pos, 1.0);

    let albedo = convert_hsl_to_rgb(unpacked_h,unpacked_s, unpacked_l);

    let light_dir = vec3<f32>(0.577, -0.577, 0.577); // Example light direction
    let n_dot_l = max(dot(normal, light_dir), 0.0);

    var output: VertexOutput;
    output.position = projected_pos;  // Transform to clip space
    output.color = vec4(mix(albedo * n_dot_l, albedo, 0.1), 1.0);

    output.world_position = model_matrices[instance.model_index] * vec4<f32>(pos, 1.0);
    return output;
}

@fragment
fn fs_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
  // TODO: get world position from vertex shader, and project into shadow space
    let shadow_coords = shadow_view_projection * vertex.world_position;

    let shadow_coords_uv = shadow_coords.xy / shadow_coords.w * 0.5 + 0.5; // Convert to [0, 1] range

    let depth_reference = shadow_coords.z / shadow_coords.w;

    let shadow_depth = textureSampleCompare(shadow_texture, shadow_sampler, shadow_coords_uv, depth_reference);

    return vec4(depth_reference);

//    return mix(
//        vertex.color, // Light color
//        vec4(0.0, 0.0, 0.0, 1.0), // Shadow color
//        step(shadow_depth, shadow_coords.z) // Compare depth
//    );
}