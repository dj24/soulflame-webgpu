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
import { PitchYaw } from "./xmas-game-jam-2024/components/pitch-yaw";
import { MouseLookSystem } from "@input/systems/mouse-look-system";

const LIGHT_INTENSITY = 30;

const ecs = new ECS();

// Lights
for (let x = 64; x < 1024; x += 256) {
  for (let z = 64; z < 1024; z += 256) {
    const newEntity = ecs.addEntity();
    ecs.addComponents(
      newEntity,
      new Transform(
        vec3.create(x, 48, z),
        quat.fromEuler(0, 0, 0, "xyz"),
        vec3.create(1, 1, 1),
      ),
      new Light(
        vec3.mulScalar(
          vec3.normalize(
            vec3.create(Math.random(), Math.random(), Math.random()),
          ),
          LIGHT_INTENSITY,
        ),
      ),
    );
  }
}

// Systems
ecs.addSystem(new KeyboardControl());
ecs.addSystem(new Renderer());
ecs.addSystem(new TerrainSystem());
ecs.addSystem(new VelocitySystem());
ecs.addSystem(new DebugRotaterSystem());
ecs.addSystem(new MouseLookSystem());
ecs.addSystem(new ChunkCombinerSystem(64));
ecs.addSystem(new ChunkCombinerSystem(128));
ecs.addSystem(new ChunkCombinerSystem(256));
ecs.addSystem(new ChunkCombinerSystem(512));
ecs.addSystem(new ChunkCombinerSystem(1024));

const singleton = ecs.addEntity();
ecs.addComponent(singleton, new GPUDeviceSingleton());
ecs.addComponent(singleton, new PhysicsWorldSingleton());
ecs.addComponent(singleton, new TerrainSingleton());

// Camera
const camera = ecs.addEntity();
ecs.addComponents(
  camera,
  new Camera({ fieldOfView: 70 * (Math.PI / 180), near: 2.0, far: 1000000 }),
  new Transform(
    vec3.create(0, 0, -64),
    quat.fromEuler(0, 0, 0, "xyz"),
    vec3.create(1, 1, 1),
  ),
  new KeyboardControllable(),
  new Velocity(),
  new PitchYaw(),
);

// Game loop
const update = () => {
  ecs.update(performance.now());
  requestAnimationFrame(update);
};

update();
