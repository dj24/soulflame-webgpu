fn distanceToReversedNormalisedDepth(depth: f32, near: f32, far: f32) -> f32 {
   return (far - depth) / (far - near);//Reversed
}

fn reversedNormalisedDepthToDistance(depth: f32, near: f32, far: f32) -> f32 {
    return far - depth * (far - near); //Reversed
}