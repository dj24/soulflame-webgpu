import { Component } from "@ecs/ecs";

export class CharacterCollider extends Component {
  collidingSides = {
    top: false,
    bottom: false,
    left: false,
    right: false,
    front: false,
    back: false,
  };
  isRaycastInProgress = false;
}
