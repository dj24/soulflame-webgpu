override shadow_map_size: f32 = 4096.0;

struct Uniforms {
  view_projection: mat4x4<f32>,
  camera_position: vec4<f32>,
}

struct Light {
  color: vec3<f32>,
  range: f32,
  position: vec3<f32>,
  intensity: f32,
}

@group(0) @binding(0) var<storage, read> model_matrices: array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var<uniform> lights: array<Light, 32>;

// Shadow texture and sampler
@group(1) @binding(0) var shadow_texture: texture_depth_2d;
@group(1) @binding(1) var shadow_sampler: sampler_comparison;
@group(1) @binding(2) var<uniform> shadow_view_projections: array<mat4x4<f32>, 4>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(perspective, centroid) color: vec4<f32>,
    @location(1) @interpolate(perspective, centroid) world_position: vec4<f32>,
    @location(2) @interpolate(perspective, centroid) normal: vec3<f32>,
    @location(3) @interpolate(perspective, centroid) uv: vec2<f32>,
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

fn get_hsl_voxel(hsl:u32) -> vec3<f32> {
    let h = (hsl & 0x7E00u) >> 9;
    let s = (hsl & 0x01C0u) >> 6;
    let l = hsl & 0x003Fu;

    return vec3(
      f32(h) / 63.0,
      f32(s) / 7.0,
      f32(l) / 63.0
    );
}

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

    let hsl = unpacked_color_y_extent.rg;
    let ao_packed = unpacked_color_y_extent.b;

    // Extract AO values for 4 corners (2 bits each)
    let ao_corner0 = (ao_packed >> 6u) & 3u;  // Top-left
    let ao_corner1 = (ao_packed >> 4u) & 3u;  // Top-right
    let ao_corner2 = (ao_packed >> 2u) & 3u;  // Bottom-left
    let ao_corner3 = ao_packed & 3u;          // Bottom-right

    let unpacked_hsl = get_hsl_voxel(instance.color_y_extent);
    let unpacked_h = unpacked_hsl.x;
    let unpacked_s = unpacked_hsl.y;
    let unpacked_l = unpacked_hsl.z;

    let local_vertex_index = in_vertex_index % 24u; // Ensure the index is within the bounds of the positions array

    let is_z_face = local_vertex_index < 8u; // First 8 vertices are for the front and back faces
    let is_x_face = local_vertex_index >= 8u && local_vertex_index < 16u; // Next 8 vertices are for the left and right faces
    let is_y_face = local_vertex_index >= 16u; // Last 8 vertices are for the top and bottom faces

    var scale = vec3(0.0);

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
    let model_view_proj = uniforms.view_projection * model_matrices[instance.model_index];
    var projected_pos = model_view_proj * vec4<f32>(pos, 1.0);

    // Calculate ambient occlusion for this vertex based on its position within the quad
    var ao_value = 0.0;
    let vertex_in_quad = local_vertex_index % 4u;

    // Check if we need to flip the quad for consistent triangle subdivision
    let should_flip_quad = (ao_corner0 + ao_corner3) > (ao_corner1 + ao_corner2);

    if should_flip_quad {
        // Flipped quad vertex order
        if vertex_in_quad == 0u {
            ao_value = f32(ao_corner1); // bottom-right -> top-right
        } else if vertex_in_quad == 1u {
            ao_value = f32(ao_corner0); // top-left -> bottom-left
        } else if vertex_in_quad == 2u {
            ao_value = f32(ao_corner3); // bottom-left -> top-left
        } else if vertex_in_quad == 3u {
            ao_value = f32(ao_corner2); // top-right -> bottom-right
        }
    } else {
        // Normal quad vertex order
        if vertex_in_quad == 0u {
            ao_value = f32(ao_corner2); // bottom-left
        } else if vertex_in_quad == 1u {
            ao_value = f32(ao_corner3); // bottom-right
        } else if vertex_in_quad == 2u {
            ao_value = f32(ao_corner0); // top-left
        } else if vertex_in_quad == 3u {
            ao_value = f32(ao_corner1); // top-right
        }
    }

    // Convert AO value to a multiplier (0-3 maps to darker to lighter)
    let ao_multiplier = (ao_value / 3.0) * 0.7 + 0.3; // Maps 0->0.3, 3->1.0

    let albedo = convert_hsl_to_rgb(unpacked_h, unpacked_s, unpacked_l) * ao_multiplier;

    var output: VertexOutput;
    output.position = projected_pos;  // Transform to clip space
    output.color = vec4(albedo, 1.0);
    output.world_position = model_matrices[instance.model_index] * vec4<f32>(pos, 1.0);
    output.normal = normal;
    output.uv = (projected_pos.xy / projected_pos.w) * 0.5 + 0.5;

    return output;
}

fn get_shadow_visibility(
    vertex: VertexOutput
) -> f32 {
    var cascade_index = -1;
    var shadow_coords = vec4<f32>(0.0);
    for(var i = 0u; i < 4u; i++) {
      shadow_coords = shadow_view_projections[i] * vertex.world_position;
      if (all(shadow_coords.xy >= vec2(-1.0)) && all(shadow_coords.xy <= vec2(1.0))) {
          // If the shadow coordinates are within the range, we can use this cascade
          cascade_index = i32(i);
          break;
      }
    }

    // cascade 0 is the top left
     var shadow_coords_uv = vec2<f32>(
         shadow_coords.x  * 0.5 + 0.5,
         0.5 - shadow_coords.y  * 0.5
     ) * 0.5;

    var uv_offset = vec2<f32>(0.0);
    // Offset the shadow uv to match the quadrant of that cascade
    if cascade_index == 1 {
      uv_offset = vec2(0.5, 0.0);
    } else if cascade_index == 2 {
       uv_offset = vec2(0.0, 0.5);
    } else if cascade_index == 3 {
      uv_offset = vec2(0.5, 0.5);
    }
    shadow_coords_uv += uv_offset;

    let depth_reference = shadow_coords.z / shadow_coords.w;

    // Calculate texel size
    let texel_size = 1.0 / shadow_map_size;

    // Add a small bias to avoid shadow acne
    let bias = 0.00007 * pow(3.0, f32(cascade_index));

    // Calculate bilinear interpolation weights
    let shadow_texel_pos = shadow_coords_uv * shadow_map_size;
    let texel_pos = floor(shadow_texel_pos);
    let frac_part = shadow_texel_pos - texel_pos;

    // Calculate weights for bilinear interpolation
    let w00 = (1.0 - frac_part.x) * (1.0 - frac_part.y);
    let w10 = frac_part.x * (1.0 - frac_part.y);
    let w01 = (1.0 - frac_part.x) * frac_part.y;
    let w11 = frac_part.x * frac_part.y;

    var visibility = 0.0;
    var total_weight = 0.0;
    let uv_max = uv_offset + vec2(0.5, 0.5);

    if(all(shadow_coords_uv < uv_max) && all(shadow_coords_uv > uv_offset)) {
        let sample00 = textureSampleCompare(
            shadow_texture, shadow_sampler,
            shadow_coords_uv,
            depth_reference + bias
        );
        total_weight += w00;
        visibility += sample00 * w00;
    }
    let shadow_coords_uv_10 = shadow_coords_uv + vec2(texel_size, 0.0);
    if( all(shadow_coords_uv_10 < uv_max) && all(shadow_coords_uv_10 > uv_offset)) {
        let sample01 = textureSampleCompare(
            shadow_texture, shadow_sampler,
            shadow_coords_uv_10,
            depth_reference + bias
        );
        total_weight += w10;
        visibility += sample01 * w10;
    }
    let shadow_coords_uv_01 = shadow_coords_uv + vec2(0.0, texel_size);
    if( all(shadow_coords_uv_01 < uv_max) && all(shadow_coords_uv_01 > uv_offset)) {
        let sample10 = textureSampleCompare(
            shadow_texture, shadow_sampler,
            shadow_coords_uv_01,
            depth_reference + bias
        );
        total_weight += w01;
        visibility += sample10 * w01;
    }
    let shadow_coords_uv_11 = shadow_coords_uv + vec2(texel_size, texel_size);
    if( all(shadow_coords_uv_11 < uv_max) && all(shadow_coords_uv_11 > uv_offset)) {
        let sample11 = textureSampleCompare(
            shadow_texture, shadow_sampler,
            shadow_coords_uv_11,
            depth_reference + bias
        );
        total_weight += w11;
        visibility += sample11 * w11;
    }
    // Average the samples to get a smoother shadow
    visibility /= total_weight;

    if(any(shadow_coords_uv > vec2(1.0)) || any(shadow_coords_uv < vec2(0.0))){
      return 1.0;
    }

    return visibility;
}

fn simple_lighting(
    vertex: VertexOutput,
    light_dir: vec3<f32>,
    view_dir: vec3<f32>
) -> vec4<f32> {
    let n_dot_l = max(dot(-vertex.normal, light_dir), 0.0);
    let reflect_dir = reflect(-light_dir, -vertex.normal);
    let spec = pow(max(dot(view_dir, reflect_dir), 0.0), 8.0);
    let spec_strength = 0.5; // Specular strength
    let ambient_strength = 0.02; // Ambient strength
    return (ambient_strength + n_dot_l + (spec_strength * spec)) * vertex.color;
}

fn apply_point_lights(
    vertex: VertexOutput,
    view_dir: vec3<f32>
) -> vec4<f32> {
    var color = vec4<f32>(0.0);
    for (var i = 0u; i < 32; i++) {
        let light = lights[i];
        let light_dir = normalize(light.position - vertex.world_position.xyz);
        let distance = distance(light.position,vertex.world_position.xyz);
        let attenuation = light.range / (distance * distance);
        let intensity_color = vec4(light.color, 1.0) * light.intensity;
        color += simple_lighting(vertex, light_dir, view_dir) * intensity_color * attenuation;
    }
    return color;
}

fn apply_fog(
    vertex: VertexOutput,
    view_dir: vec3<f32>
) -> vec3<f32> {
    let fog_start = 30.0; // Distance at which fog starts
    let fog_end = 1000.0; // Distance at which fog reaches full density
    let distance = length(vertex.world_position.xyz - uniforms.camera_position.xyz);
    let fog_factor = clamp((distance - fog_start) / (fog_end - fog_start), 0.0, 1.0);
    return fog_factor * vec3(0.56, 0.8, 1.0);
}

@fragment
fn fs_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    let light_dir = normalize(vec3(1.0)); // Direction of the light source
    var view_dir = normalize(uniforms.camera_position.xyz - vertex.world_position.xyz);

    let shadow_visibility = get_shadow_visibility(vertex);

    let diffuse_color = simple_lighting(vertex, light_dir, view_dir) * 4.0;

    let ambient = vertex.color * 0.02; // Ambient light color

    let shadowed = mix(
     ambient,
     diffuse_color,
     shadow_visibility
   );

   let fog_factor = apply_fog(vertex, view_dir);

    return vertex.color;

//    var output_color = shadowed + apply_point_lights(vertex, view_dir);
//    output_color = mix(output_color, vec4(0.5, 0.5, 0.5, 1.0), vec4(fog_factor, 1.0)); // Apply fog effect

//    return output_color;
}