pub fn convert_rgb_to_hsl(r:f32, g:f32, b:f32) -> (f32, f32, f32) {
    // Find max and min RGB values
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;

    // Calculate lightness
    let l = (max + min) / 2.0;

    // Calculate saturation
    let s = if delta == 0.0 {
        0.0
    } else if l <= 0.5 {
        delta / (max + min)
    } else {
        delta / (2.0 - max - min)
    };

    // Calculate hue
    let h = if delta == 0.0 {
        0.0
    } else if max == r {
        ((g - b) / delta) % 6.0
    } else if max == g {
        (b - r) / delta + 2.0
    } else {
        (r - g) / delta + 4.0
    } * 60.0;

    let h = if h < 0.0 { h + 360.0 } else { h };

    // Convert HSL values to the range [0, 255]
    (
        h / 360.0,
        s,
        l,
    )
}

pub fn convert_rgb_to_hsl_u8(r: u8, g: u8, b: u8) -> (u8, u8, u8) {
    // Normalize RGB values to the range [0, 1]
    let r = r as f32 / 255.0;
    let g = g as f32 / 255.0;
    let b = b as f32 / 255.0;

    let (h,s,l) = convert_rgb_to_hsl(r,g,b);

    // Convert HSL values to the range [0, 255]
    (
        (h / 360.0 * 255.0).round() as u8,
        (s * 255.0).round() as u8,
        (l * 255.0).round() as u8,
    )
}

// Convert from linear to gamma space (gamma = 2.2)
pub fn linear_to_gamma(linear: f32) -> f32 {
    linear.powf(1.0/2.2)
}

// Convert from gamma to linear space (gamma = 2.2)
pub fn gamma_to_linear(gamma: f32) -> f32 {
    gamma.powf(2.2)
}

// creates a 15 bit quantisation of a colour, with the first bit being 1 to indicate solid voxel
pub fn create_hsl_voxel(r: f32, g: f32, b: f32) -> u16 {
    let (h, s, l) = convert_rgb_to_hsl(r, g, b);

    let h5 = convert_8bit_to_n_bits((h * 255.0).round() as u8, 6);
    let s5 = convert_8bit_to_n_bits((s * 255.0).round() as u8, 5);
    let l5 = convert_8bit_to_n_bits((l * 255.0).round() as u8, 4);

    (1 << 15) | (h5 << 9) | (s5 << 4) | (l5)
}

pub fn get_hsl_voxel(voxel: u16) -> (u16, u16, u16) {
    let h = (voxel & 0b0111_1110_0000_0000) >> 9;
    let s = (voxel & 0b0000_0001_1111_0000) >> 4;
    let l = voxel & 0b0000_0000_0000_1111;

    (h, s, l)
}

pub fn convert_8bit_to_n_bits(value: u8, n: u8) -> u16 {
    let max_value = (1 << n) - 1;
    let scaled_value = ((value as u16 * max_value) + 127) / 255;
    scaled_value
}

pub fn convert_n_bits_to_8bit(value: u16, n: u8) -> u8 {
    let max_value = (1 << n) - 1;
    let scaled_value = ((value as u32 * 255) + (max_value / 2)) / max_value;
    scaled_value as u8
}
