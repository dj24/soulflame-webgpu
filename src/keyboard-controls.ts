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
      const key = event.key.toLowerCase() as keyof KeyboardControls["pressed"];
      this.pressed[key] = true;
    });
    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase() as keyof KeyboardControls["pressed"];
      this.pressed[key] = false;
    });
  }
}
