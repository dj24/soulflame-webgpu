// TODO: actually make linear
fn distanceToReversedLinearDepth(cameraDistance: f32, near: f32, far: f32) -> f32 {
  return (far - cameraDistance) / (far - near);//Reversed
}

fn reversedLinearDepthToDistance(linearDepth: f32, near: f32, far: f32) -> f32 {
    return far - linearDepth * (far - near); //Reversed
}

fn distanceToLogarithmicDepth(cameraDistance: f32, near: f32, far: f32) -> f32 {
    return log2(cameraDistance / near + 1.0) / log2(far / near + 1.0);
}

fn logarithmicDepthToDistance(logDepth: f32, near: f32, far: f32) -> f32 {
    let base = far / near + 1.0;
    return near * (pow(base, logDepth) - 1.0);
}