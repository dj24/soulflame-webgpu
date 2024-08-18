import { Component } from "@ecs/ecs";
import * as CANNON from "cannon-es";

export class PhysicsWorldSingleton extends Component {
  world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -150, 0),
  });
  constructor() {
    super();
    // const groundBody = new CANNON.Body({
    //   type: CANNON.Body.STATIC,
    //   shape: new CANNON.Plane(),
    // });
    // groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // make it face up
    // this.world.addBody(groundBody);
  }
}
