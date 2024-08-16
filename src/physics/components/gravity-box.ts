import { Vec3 } from "wgpu-matrix";
import { Component } from "@ecs/ecs";

export class GravityBox extends Component {
  body: any;

  constructor(size: Vec3, position: Vec3, rotation: Vec3) {
    super();
    this.body = {
      name: Symbol(),
      type: "box", // type of shape : sphere, box, cylinder
      size: size, // size of shape
      pos: position, // start position in degree
      rot: rotation, // start rotation in degree
      move: true, // dynamic or statique
      density: 1,
      friction: 0.2,
      restitution: 0.2,
      belongsTo: 1, // The bits of the collision groups to which the shape belongs.
      collidesWith: 0xffffffff, // The bits of the collision groups with which the shape collides.
    };
  }
}
