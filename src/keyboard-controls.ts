export class KeyboardControls {
  pressed = {
    w: false,
    a: false,
    s: false,
    d: false,
    q: false,
    e: false,
    " ": false,
    shift: false,
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
    window.addEventListener("blur", () => {
      Object.keys(this.pressed).forEach((key) => {
        this.pressed[key as keyof KeyboardControls["pressed"]] = false;
      });
    });
  }
}
