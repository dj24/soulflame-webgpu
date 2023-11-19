// Helper function for SmoothDamp on Vector3
import { deltaTime } from "./app";
import { Vector3 } from "./vector3";

export function smoothDampVector3(
  current: Vector3,
  target: Vector3,
  currentVelocity: Vector3,
  smoothTime: number,
): { position: Vector3; velocity: Vector3 } {
  const x = smoothDampValue(current.x, target.x, currentVelocity.x, smoothTime);
  const y = smoothDampValue(current.y, target.y, currentVelocity.y, smoothTime);
  const z = smoothDampValue(current.z, target.z, currentVelocity.z, smoothTime);
  return {
    position: new Vector3(x.value, y.value, z.value),
    velocity: new Vector3(x.velocity, y.velocity, z.velocity),
  };
}

// Helper function for scalar interpolation
export function smoothDampValue(
  current: number,
  target: number,
  currentVelocity: number,
  smoothTime: number,
): {
  velocity: number;
  value: number;
} {
  const maxSpeed = Infinity; // You can set a maximum speed if needed
  const deltaTimeFactor = deltaTime > 0 ? 1 / deltaTime : 0;
  // Calculate the smooth time factor based on the frame time
  const smoothTimeFactor = 1.0 - Math.exp(-smoothTime * deltaTime);

  // Calculate the desired position based on SmoothDamp
  const omega = 2.0 / smoothTime;
  const x = omega * smoothTimeFactor;
  const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;

  let temp =
    (change -
      Math.min(maxSpeed, Math.max(-maxSpeed, currentVelocity)) *
        deltaTimeFactor) *
    exp;

  return {
    velocity: currentVelocity + temp * deltaTimeFactor,
    value:
      target + Math.min(Math.abs(change), Math.abs(temp)) * Math.sign(change),
  };
}
