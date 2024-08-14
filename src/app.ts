import { ECS } from "@ecs/ecs";
import { Camera } from "@renderer/components/camera";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";
import { Renderer } from "@renderer/systems/renderer";
import { CameraKeyboardControl } from "@renderer/systems/camera-keyboard-control";

const ecs = new ECS();

ecs.addSystem(new Renderer());
ecs.addSystem(new CameraKeyboardControl());

const camera = ecs.addEntity();
ecs.addComponent(camera, new Camera(90 * (Math.PI / 180), 0.5, 10000));
ecs.addComponent(
  camera,
  new Transform(vec3.create(0, 0, 0), quat.identity(), vec3.create(1, 1, 1)),
);

const update = (now: number) => {
  ecs.update(now);
  requestAnimationFrame(update);
};

requestAnimationFrame(update);
