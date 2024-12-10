import { Component } from "@ecs/ecs";

export class BoxRayIntersect extends Component {
  top: number;
  bottom: number;
  left: number;
  right: number;
  front: number;
  back: number;
}
