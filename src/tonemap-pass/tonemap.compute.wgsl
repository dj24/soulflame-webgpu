fn uncharted2_tonemap_partial(x: vec3<f32>) -> vec3<f32>
{
    let A = 0.15f;
    let B = 0.50f;
    let C = 0.10f;
    let D = 0.20f;
    let E = 0.02f;
    let F = 0.30f;
    return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
}

fn luminance(v: vec3<f32>) -> f32
{
    return dot(v, vec3(0.2126f, 0.7152f, 0.0722f));
}

fn aces(v: vec3<f32>) -> vec3<f32>
{
    let a = 2.51f;
    let b = 0.03f;
    let c = 2.43f;
    let d = 0.59f;
    let e = 0.14f;
    return clamp((v*(a*v+b))/(v*(c*v+d)+e), vec3(0.0), vec3(1.0f));
}

fn uncharted2_filmic(v: vec3<f32>) -> vec3<f32>
{
    let exposure_bias = 0.5f;
    let curr = uncharted2_tonemap_partial(v * exposure_bias);

    let W = vec3(11.2f);
    let white_scale = vec3(1.0f) / uncharted2_tonemap_partial(W);
    return curr * white_scale;
}

fn reinhard_jodie(v: vec3<f32>) -> vec3<f32>
{
    let l = luminance(v);
    let tv = v / (1.0f + v);
    return mix(v / (1.0f + l), tv, tv);
}

@compute @workgroup_size(8, 8, 1)
fn main(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  let pixel = GlobalInvocationID.xy;
  let inputSample = textureLoad(inputTex, pixel, 0);
  let toneMapped = reinhard_jodie(inputSample.rgb);
  textureStore(outputTex,pixel,vec4(toneMapped,1));
}