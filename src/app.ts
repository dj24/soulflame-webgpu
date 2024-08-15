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

const ecs = new ECS();

// Systems
ecs.addSystem(new Renderer());
ecs.addSystem(new KeyboardControl());
ecs.addSystem(new GamepadControl());

const rendererConfig = ecs.addEntity();
ecs.addComponent(rendererConfig, new GPUDeviceSingleton());

// Camera
const camera = ecs.addEntity();
ecs.addComponents(
  camera,
  new Camera(90 * (Math.PI / 180), 0.5, 10000),
  // new KeyboardControllable(),
  new GamepadControllable(),
  new Transform(
    vec3.create(-30, 10, -70),
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
