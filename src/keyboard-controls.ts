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
      const key = event.key.toLowerCase();
      if ((key as ValidKeys) in this.pressed) {
        this.pressed[key as ValidKeys] = true;
      }
    });
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if ((key as ValidKeys) in this.pressed) {
        this.pressed[key as ValidKeys] = false;
      }
    });
  }
}
