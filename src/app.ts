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
import { GamepadKinematicBoxControl } from "@input/systems/gamepad-kinematic-box-control";
import { ArenaTiltSystem } from "./systems/arena-tilt-system";
import { GamepadGravityBoxControl } from "@input/systems/gamepad-gravity-box-control";
import { PlayerBodySpringSystem } from "./systems/player-body-spring-system";

const ecs = new ECS();

// Systems
ecs.addSystem(new Renderer());
ecs.addSystem(new KeyboardControl());
// ecs.addSystem(new GamepadControl());
ecs.addSystem(new GravitySystem());
ecs.addSystem(new KinematicSystem());
ecs.addSystem(new GamepadKinematicBoxControl());
ecs.addSystem(new ArenaTiltSystem());
ecs.addSystem(new GamepadGravityBoxControl());
ecs.addSystem(new PlayerBodySpringSystem());

const singleton = ecs.addEntity();
ecs.addComponent(singleton, new GPUDeviceSingleton());
ecs.addComponent(singleton, new PhysicsWorldSingleton());

// Camera
const camera = ecs.addEntity();
ecs.addComponents(
  camera,
  new Camera({ fieldOfView: 30 * (Math.PI / 180), near: 0.5, far: 10000 }),
  new Transform(
    vec3.create(0, 400, -370),
    quat.fromEuler(50 * (Math.PI / 180), 0, 0, "xyz"),
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
