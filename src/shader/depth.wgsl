// TODO: actually make linear
fn distanceToReversedLinearDepth(cameraDistance: f32, near: f32, far: f32) -> f32 {
  return (far - cameraDistance) / (far - near);//Reversed
}

fn reversedLinearDepthToDistance(linearDepth: f32, near: f32, far: f32) -> f32 {
    return far - linearDepth * (far - near); //Reversed
}