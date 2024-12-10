import { ECS } from "@ecs/ecs";
import { Camera } from "@renderer/components/camera";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { Renderer } from "@renderer/systems/renderer";
import { KeyboardControl } from "@input/systems/keyboard-control";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { GPUDeviceSingleton } from "@renderer/components/gpu-device-singleton";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { GamepadKinematicBoxControl } from "@input/systems/gamepad-kinematic-box-control";
import { TerrainSystem } from "./procgen/systems/terrain-system";
import { TerrainSingleton } from "./procgen/components/terrain-singleton";
import { VelocitySystem } from "./systems/velocity-system";
import { Velocity } from "./components/velocity";
import { MouseScrollZoomSystem } from "@input/systems/mouse-scroll-zoom-system";
import { Light } from "@renderer/components/light";
import { ChunkCombinerSystem } from "./procgen/systems/chunk-combiner-system";
import { DebugRotaterSystem } from "./systems/debug-rotater-system";
import { processNewVoxelImport } from "@renderer/create-tavern";
import { getGPUDeviceSingleton } from "./abstractions/get-gpu-device-singleton";
import { FpsHandSystem } from "./xmas-game-jam-2024/systems/fps-hand-system";
import { HingeSystem } from "./systems/hinge-system";
import { GravitySystem } from "@physics/systems/gravity-system";
import { KinematicSystem } from "@physics/systems/kinematic-system";
import { GlobalAudioSystem } from "./xmas-game-jam-2024/systems/global-audio-system";
import { GlobalAudioSource } from "./xmas-game-jam-2024/components/global-audio-source";
import { MouseLookSystem } from "@input/systems/mouse-look-system";
import { AudioSource } from "./xmas-game-jam-2024/components/audio-source";
import { FootstepAudioSystem } from "./xmas-game-jam-2024/systems/footstep-audio-system";
import { LightFlickerSystem } from "./xmas-game-jam-2024/systems/light-flicker-system";
import { BoxRayIntersect } from "./components/box-ray-intersect";

const LIGHT_INTENSITY = 500;

const ecs = new ECS();

// Systems
ecs.addSystem(new GravitySystem());
ecs.addSystem(new KinematicSystem());
ecs.addSystem(new KeyboardControl());
ecs.addSystem(new Renderer());
ecs.addSystem(new GamepadKinematicBoxControl());
ecs.addSystem(new TerrainSystem());
ecs.addSystem(new VelocitySystem());
ecs.addSystem(new DebugRotaterSystem());
ecs.addSystem(new ChunkCombinerSystem(64));
ecs.addSystem(new ChunkCombinerSystem(128));
ecs.addSystem(new ChunkCombinerSystem(256));
ecs.addSystem(new ChunkCombinerSystem(512));
ecs.addSystem(new ChunkCombinerSystem(1024));
ecs.addSystem(new HingeSystem());
ecs.addSystem(new FpsHandSystem());
ecs.addSystem(new GlobalAudioSystem());
ecs.addSystem(new MouseLookSystem());
ecs.addSystem(new FootstepAudioSystem());
ecs.addSystem(new LightFlickerSystem());

// Lights
// for (let x = 64; x < 1024; x += 128) {
//   for (let z = 64; z < 1024; z += 128) {
//     const newEntity = ecs.addEntity();
//     ecs.addComponents(
//       newEntity,
//       new Transform(
//         vec3.create(x, 24, z),
//         quat.fromEuler(0, 0, 0, "xyz"),
//         vec3.create(1, 1, 1),
//       ),
//       new Light(
//         vec3.mulScalar(
//           vec3.normalize(
//             vec3.create(Math.random(), Math.random(), Math.random()),
//           ),
//           LIGHT_INTENSITY,
//         ),
//       ),
//     );
//   }
// }

// Globals
const singleton = ecs.addEntity();
ecs.addComponent(singleton, new GPUDeviceSingleton());
ecs.addComponent(singleton, new PhysicsWorldSingleton());
ecs.addComponent(singleton, new TerrainSingleton());
ecs.addComponent(
  singleton,
  new GlobalAudioSource("./xmas-game-jam-2024/blizzard.wav", 0.01),
);

// Camera / Player
const camera = ecs.addEntity();
ecs.addComponents(
  camera,
  new Camera({ fieldOfView: 70 * (Math.PI / 180), near: 2.0, far: 1000000 }),
  new Transform(
    vec3.create(64, 32, 64),
    quat.fromEuler(0, 45 * (Math.PI / 180), 0, "xyz"),
    vec3.create(1, 1, 1),
  ),
  new KeyboardControllable(),
  new Velocity(),
  new AudioSource("./xmas-game-jam-2024/snow-footsteps.wav", 0.02),
  new GlobalAudioSource("./xmas-game-jam-2024/heartbeat.wav", 0.01),
  new BoxRayIntersect(),
);

const breathing = ecs.addEntity();
ecs.addComponent(
  breathing,
  new GlobalAudioSource("./xmas-game-jam-2024/breathing.wav", 0.01),
);

const wind = ecs.addEntity();
ecs.addComponent(
  wind,
  new GlobalAudioSource("./xmas-game-jam-2024/wind.wav", 0.02),
);

// Game loop
const update = () => {
  ecs.update(performance.now());
  requestAnimationFrame(update);
};

update();
