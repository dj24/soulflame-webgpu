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

const LIGHT_INTENSITY = 50;

const ecs = new ECS();

// Lights
for (let x = 0; x < 512; x += 128) {
  for (let z = 0; z < 512; z += 128) {
    const newEntity = ecs.addEntity();
    ecs.addComponents(
      newEntity,
      new Transform(
        vec3.create(x, 84, z),
        quat.fromEuler(0, 0, 0, "xyz"),
        vec3.create(128, 128, 128),
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
ecs.addSystem(new GamepadKinematicBoxControl());
ecs.addSystem(new TerrainSystem());
ecs.addSystem(new VelocitySystem());

const singleton = ecs.addEntity();
ecs.addComponent(singleton, new GPUDeviceSingleton());
ecs.addComponent(singleton, new PhysicsWorldSingleton());
ecs.addComponent(singleton, new TerrainSingleton());

// Camera
const camera = ecs.addEntity();
ecs.addComponents(
  camera,
  new Camera({ fieldOfView: 70 * (Math.PI / 180), near: 0.5, far: 10000 }),
  new Transform(
    vec3.create(-48, 84, -48),
    quat.fromEuler(0, 45 * (Math.PI / 180), 0, "xyz"),
    vec3.create(1, 1, 1),
  ),
  new KeyboardControllable(),
  new GamepadKinematicBoxControl(),
  new Velocity(),
);

// Game loop
const update = () => {
  ecs.update(performance.now());
  requestAnimationFrame(update);
};

update();
