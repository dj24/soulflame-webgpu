// Function to mimic the ease_out_expo function
fn ease_out_expo(x: f32) -> f32 {
    let t: f32 = x;
    let b: f32 = 0.0;
    let c: f32 = 1.0;
    let d: f32 = 1.0; // Set the duration within the function

    let intermediate_result: f32 = c * (-pow(2.0, -10.0 * t / d) + 1.0) + b;

    return select(intermediate_result, b + c, t == d);

}

fn sample_sky(rayDirection: vec3<f32>) -> vec3<f32> {
    //TODO: add this to uniforms
    let lightDirection = normalize(vec3(1.0,1.0,0.));
    let y = clamp(ease_out_expo(rayDirection.y * 0.66), 0.0, 1.0);
//    let y = rayDirection.y;
    let sunHeight = clamp(lightDirection.y, 0.0, 1.0);
    let horizon = mix(vec3<f32>(0.95, 0.5, 0.4), vec3<f32>(0.6, 0.8, 1.0), sunHeight);
    let sky = mix(vec3<f32>(0.55, 0.7, 0.7), vec3<f32>(0.3, 0.6, 0.95), sunHeight);
    let sunFalloff = 0.8;
    let sunAmount = 1.0 - ease_out_expo(length(lightDirection - rayDirection) * sunFalloff);
//    let sunAmount = 1.0 - length(lightDirection - rayDirection) * sunFalloff;
    let skyColour = mix(horizon, sky, y);
    let sunColour = mix(vec3<f32>(1.8, 1.6, 1.1), vec3<f32>(1.6, 1.6, 1.4), sunHeight);

    let intensity = clamp(sunHeight, 0.75, 1.0);
    return mix(skyColour, sunColour, clamp(sunAmount, 0.0, 1.0)) * intensity;
}