import { Component, ECS, Entity, System } from "@ecs/ecs";
import { Camera } from "@renderer/components/camera";
import { Transform } from "@renderer/components/transform";
import { quat, vec3 } from "wgpu-matrix";

class LoggerComponent extends Component {
  constructor(public message: string) {
    super();
  }
}

class LoggerSystem extends System {
  update(entities: Set<Entity>) {
    entities.forEach((entity) => {
      const components = this.ecs.getComponents(entity);
      const logger = components.get(LoggerComponent);
      console.log(`${logger.message} ${performance.now()}`);
    });
  }
  componentsRequired = new Set([LoggerComponent]);
}

const ecs = new ECS();

const camera = ecs.addEntity();
ecs.addComponent(camera, new Camera(70, 0.5, 10000));
ecs.addComponent(
  camera,
  new Transform(vec3.create(0, 0, 0), quat.identity(), vec3.create(1, 1, 1)),
);

const testEntity = ecs.addEntity();
ecs.addComponent(testEntity, new LoggerComponent("Hello, World!"));
ecs.addSystem(new LoggerSystem());

const update = () => {
  ecs.update();
  requestAnimationFrame(update);
};

requestAnimationFrame(update);
