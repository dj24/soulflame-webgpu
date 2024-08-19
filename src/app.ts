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
import { PlayerControlSystem } from "@input/systems/player-control-system";
import { PlayerBodySpringSystem } from "./systems/player-body-spring-system";
import { PlayerLookAtSystem } from "./systems/player-look-at-system";
import { SpringSystem } from "./systems/spring-system";
import { SwordSystem } from "./systems/sword-system";
import { HingeSystem } from "./systems/hinge-system";
import { FollowTargetSystem } from "@input/systems/follow-target-system";
import { SpawnerSystem } from "@input/systems/spawner-system";
import { BombSystem } from "./systems/bomb-system";
import { PlayerHealthSystem } from "./systems/player-health-system";

const ecs = new ECS();

// Systems
ecs.addSystem(new Renderer());
ecs.addSystem(new KeyboardControl());
ecs.addSystem(new GravitySystem());
ecs.addSystem(new KinematicSystem());
// ecs.addSystem(new GamepadKinematicBoxControl());
ecs.addSystem(new ArenaTiltSystem());
ecs.addSystem(new PlayerControlSystem());
ecs.addSystem(new PlayerLookAtSystem());
ecs.addSystem(new SpringSystem());
ecs.addSystem(new SwordSystem());
ecs.addSystem(new HingeSystem());
ecs.addSystem(new FollowTargetSystem());
ecs.addSystem(new SpawnerSystem());
ecs.addSystem(new BombSystem());
ecs.addSystem(new PlayerHealthSystem());

const singleton = ecs.addEntity();
ecs.addComponent(singleton, new GPUDeviceSingleton());
ecs.addComponent(singleton, new PhysicsWorldSingleton());

// Camera
const camera = ecs.addEntity();
ecs.addComponents(
  camera,
  new Camera({ fieldOfView: 50 * (Math.PI / 180), near: 0.5, far: 10000 }),
  new Transform(
    vec3.create(0, 250, -250),
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
