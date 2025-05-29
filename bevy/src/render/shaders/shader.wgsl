@group(0) @binding(0)
var<uniform> model_view_proj: mat4x4<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

struct Instance {
  @location(0) pos_x_extent: u32, // 5+5+5
  @location(1) color_y_extent: u32,
}

const positions = array<vec3<f32>, 8>(
    // Back
    vec3<f32>(0.0, 0.0, 0.0),  // 0: bottom-left
    vec3<f32>(1.0, 0.0, 0.0),  // 1: bottom-right
    vec3<f32>(0.0, 1.0, 0.0),  // 2: top-left
    vec3<f32>(1.0, 1.0, 0.0),   // 3: top-right
    // Front
    vec3<f32>(0.0, 0.0, 1.0),  // 0: bottom-left
    vec3<f32>(0.0, 1.0, 1.0),  // 2: top-left
    vec3<f32>(1.0, 0.0, 1.0),  // 1: bottom-right
    vec3<f32>(1.0, 1.0, 1.0)   // 3: top-right
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

    var scale = vec3(x_scale, y_scale, 1.0);

    let local_pos = positions[in_vertex_index];
    let pos = local_pos * scale + vec3<f32>(x_pos, y_pos, z_pos);
    var projected_pos = model_view_proj * vec4<f32>(pos, 1.0);

    var output: VertexOutput;
    output.position = projected_pos;  // Transform to clip space
    output.color = vec4(convert_hsl_to_rgb(unpacked_h,unpacked_s, unpacked_l), 1.0);
    return output;
}

@fragment
fn fs_main(vertex: VertexOutput) -> @location(0) vec4<f32> {
    return vertex.color;
}