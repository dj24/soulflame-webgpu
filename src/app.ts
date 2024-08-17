import { ECS } from "@ecs/ecs";
import { Camera } from "@renderer/components/camera";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { Renderer } from "@renderer/systems/renderer";
import { KeyboardControl } from "@input/systems/keyboard-control";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { GamepadControl } from "@input/systems/gamepad-control";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { GPUDeviceSingleton } from "@renderer/components/gpu-device-singleton";
import { GravitySystem } from "@physics/systems/gravity-system";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { KinematicSystem } from "@physics/systems/kinematic-system";
import { GamepadKinematicBoxControl } from "@input/systems/gamepad-kinematic-box-control";

const ecs = new ECS();

// Systems
ecs.addSystem(new Renderer());
ecs.addSystem(new KeyboardControl());
// ecs.addSystem(new GamepadControl());
ecs.addSystem(new GravitySystem());
ecs.addSystem(new KinematicSystem());
ecs.addSystem(new GamepadKinematicBoxControl());

const singleton = ecs.addEntity();
ecs.addComponent(singleton, new GPUDeviceSingleton());
ecs.addComponent(singleton, new PhysicsWorldSingleton());

// Camera
const camera = ecs.addEntity();
ecs.addComponents(
  camera,
  new Camera(90 * (Math.PI / 180), 0.5, 10000),
  new KeyboardControllable(),
  // new GamepadControllable(),
  new Transform(
    vec3.create(-30, 50, -120),
    quat.identity(),
    vec3.create(1, 1, 1),
  ),
);

const debug = ecs.addEntity();
ecs.addComponents(
  debug,
  new Transform(vec3.create(0, 0, 0), quat.identity(), vec3.create(1, 1, 1)),
  new KeyboardControllable(),
);

// Game loop
const update = (now: number) => {
  ecs.update(now);
  requestAnimationFrame(update);
};

requestAnimationFrame(update);
