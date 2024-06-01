import { RenderPass } from "../app";

export const setupDebugControls = (computePasses: RenderPass[]) => {
  document.getElementById("flags").innerHTML = computePasses.reduce(
    (acc, pass) => {
      if (!pass.label) {
        return acc;
      }
      const id = `flag-${pass.label}`;
      return `${acc}<div class="debug-row">
                    <label for="${id}">
                        ${pass.label}
                    </label>
                    <div>
                        <input id="${id}" type="checkbox" checked>
                   </div>
                </div>`;
    },
    "",
  );
};
