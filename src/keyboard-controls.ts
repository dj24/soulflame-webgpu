type ValidKeys = "w" | "a" | "s" | "d";
export class KeyboardControls {
  pressed = {
    w: false,
    a: false,
    s: false,
    d: false,
    " ": false,
    Control: false,
  };
  constructor() {
    window.addEventListener("keydown", (event) => {
      if ((event.key as ValidKeys) in this.pressed) {
        this.pressed[event.key as ValidKeys] = true;
      }
    });
    window.addEventListener("keyup", (event) => {
      if ((event.key as ValidKeys) in this.pressed) {
        this.pressed[event.key as ValidKeys] = false;
      }
    });
  }
}
