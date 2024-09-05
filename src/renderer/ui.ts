import { debugValues, RenderPass } from "./app";
import GUI from "lil-gui";
import { VolumeAtlas } from "@renderer/volume-atlas";

export class DebugUI {
  gui: GUI;
  timingsFolder: GUI;
  passesFolder: GUI;

  constructor() {
    this.gui = new GUI();
    this.timingsFolder = this.gui.addFolder("timings");
    this.passesFolder = this.gui.addFolder("passes");
  }

  log(timings: Record<string, number>) {
    Object.keys(timings).forEach((key) => {
      const currentController = this.timingsFolder.controllers.find(
        (controller) => controller.property === key,
      );
      if (currentController) {
        currentController.setValue(timings[key].toFixed(2));
      } else {
        this.timingsFolder.add(timings, key);
      }
    });
  }

  setupDebugControls(computePasses: RenderPass[]) {
    const passStates = computePasses.reduce(
      (acc, pass) => {
        acc[pass.label] = true;
        return acc;
      },
      {} as Record<string, boolean>,
    );

    computePasses.forEach((pass) => {
      this.passesFolder.add(passStates, pass.label);
    });
  }

  setupOctreeLogging(atlas: VolumeAtlas) {
    const octreeFolder = this.gui.addFolder("octree");
    octreeFolder.add(atlas, "octreeBufferSizeMB").listen();
  }
}
