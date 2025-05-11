pub fn convert_rgb_to_hsl(r: u8, g: u8, b: u8) -> (u8, u8, u8) {
    // Normalize RGB values to the range [0, 1]
    let r = r as f32 / 255.0;
    let g = g as f32 / 255.0;
    let b = b as f32 / 255.0;

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
        (h / 360.0 * 255.0).round() as u8,
        (s * 255.0).round() as u8,
        (l * 255.0).round() as u8,
    )
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
