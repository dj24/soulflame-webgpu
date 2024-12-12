import { ECS } from "@ecs/ecs";
import { Camera } from "@renderer/components/camera";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { Renderer } from "@renderer/systems/renderer";
import { KeyboardControllable } from "@input/components/keyboard-controllable";
import { GPUDeviceSingleton } from "@renderer/components/gpu-device-singleton";
import { PhysicsWorldSingleton } from "@physics/components/physics-world-singleton";
import { TerrainSystem } from "./procgen/systems/terrain-system";
import { TerrainSingleton } from "./procgen/components/terrain-singleton";
import { VelocitySystem } from "./systems/velocity-system";
import { Velocity } from "./components/velocity";
import { ChunkCombinerSystem } from "./procgen/systems/chunk-combiner-system";
import { DebugRotaterSystem } from "./systems/debug-rotater-system";
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
import { PlayerControllerSystem } from "./xmas-game-jam-2024/systems/player-controller-system";
import { PitchYaw } from "./xmas-game-jam-2024/components/pitch-yaw";
import { KrampusSystem } from "./xmas-game-jam-2024/systems/krampus-system";
import { UpdatePreviousTransforms } from "./systems/update-previous-transforms";
import { PresentPickupSystem } from "./xmas-game-jam-2024/systems/present-pickup-system";
import { KrampusProximitySystem } from "./xmas-game-jam-2024/systems/krampus-proximity-system";
import { KrampusProximity } from "./xmas-game-jam-2024/components/krampus-proximity";
import { PresentCount } from "./xmas-game-jam-2024/components/present-count";

const ecs = new ECS();

// Systems
ecs.addSystem(new GravitySystem());
ecs.addSystem(new KinematicSystem());
ecs.addSystem(new Renderer());
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
ecs.addSystem(new PlayerControllerSystem());
ecs.addSystem(new KrampusSystem());
ecs.addSystem(new UpdatePreviousTransforms());
ecs.addSystem(new PresentPickupSystem());
ecs.addSystem(new KrampusProximitySystem());

// Globals
const singleton = ecs.addEntity();
ecs.addComponent(singleton, new GPUDeviceSingleton());
ecs.addComponent(singleton, new PhysicsWorldSingleton());
ecs.addComponent(singleton, new TerrainSingleton());
ecs.addComponent(
  singleton,
  new GlobalAudioSource("./xmas-game-jam-2024/blizzard.wav", 0.05),
);

// Camera / Player
const camera = ecs.addEntity();
ecs.addComponents(
  camera,
  new Camera({ fieldOfView: 70 * (Math.PI / 180), near: 2.0, far: 1000000 }),
  new Transform(
    vec3.create(256 * 1.5, 64, 256 * 1.5),
    quat.fromEuler(0, 45 * (Math.PI / 180), 0, "xyz"),
    vec3.create(1, 1, 1),
  ),
  new KeyboardControllable(),
  new Velocity(),
  new AudioSource("./xmas-game-jam-2024/snow-footsteps.wav", 0.04),
  // new GlobalAudioSource("./xmas-game-jam-2024/heartbeat.wav", 0.01),
  new BoxRayIntersect(),
  new PitchYaw(),
  new PresentCount(),
);

const wind = ecs.addEntity();
ecs.addComponent(
  wind,
  new GlobalAudioSource("./xmas-game-jam-2024/wind.wav", 0.05),
);

const heartbeat = ecs.addEntity();
ecs.addComponents(
  heartbeat,
  new GlobalAudioSource("./xmas-game-jam-2024/heartbeat.wav", 0.1),
  new KrampusProximity(),
);

const breath = ecs.addEntity();
ecs.addComponents(
  breath,
  new GlobalAudioSource("./xmas-game-jam-2024/breathing.wav", 0.02),
  new KrampusProximity(),
);

// Game loop
const update = () => {
  ecs.update(performance.now());
  requestAnimationFrame(update);
};

update();
