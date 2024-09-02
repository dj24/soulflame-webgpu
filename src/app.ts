import { ECS } from "@ecs/ecs";
import { Camera } from "@renderer/components/camera";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { Renderer } from "@renderer/systems/renderer";
import { KeyboardControl } from "@input/systems/keyboard-control";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { GPUDeviceSingleton } from "@renderer/components/gpu-device-singleton";
import { GravitySystem } from "@physics/systems/gravity-system";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { KinematicSystem } from "@physics/systems/kinematic-system";
import { GamepadControllable } from "@input/components/gamepad-controllable";
import { GamepadKinematicBoxControl } from "@input/systems/gamepad-kinematic-box-control";

const ecs = new ECS();

// Systems
ecs.addSystem(new KeyboardControl());
ecs.addSystem(new Renderer());
ecs.addSystem(new GamepadKinematicBoxControl());

const singleton = ecs.addEntity();
ecs.addComponent(singleton, new GPUDeviceSingleton());
ecs.addComponent(singleton, new PhysicsWorldSingleton());

// Camera
const camera = ecs.addEntity();
ecs.addComponents(
  camera,
  new Camera({ fieldOfView: 70 * (Math.PI / 180), near: 0.5, far: 10000 }),
  new Transform(
    vec3.create(0, 50, -120),
    quat.fromEuler(0, 0, 0, "xyz"),
    vec3.create(1, 1, 1),
  ),
  new KeyboardControllable(),
);

const debug = ecs.addEntity();
ecs.addComponents(
  debug,
  new Transform(vec3.create(0, 0, 0), quat.identity(), vec3.create(1, 1, 1)),
  new KeyboardControllable(),
);

// Game loop
const update = () => {
  ecs.update(performance.now());
};

setInterval(update, 1000 / 60);
