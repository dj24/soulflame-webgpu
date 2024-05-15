const parseRgbPadded = (line: string) => {
  const [r, g, b] = line.split(" ").map(parseFloat);
  return [r, g, b, 0];
};

export const importCubeLut = async (device: GPUDevice, path: string) => {
  const response = await fetch(path);
  const text = await response.text();
  const colours = text.split("#LUT data points")[1];
  const lines = colours.split("\n").slice(1, -1);
  const rgb = lines.map(parseRgbPadded);
  const lutBuffer = device.createBuffer({
    label: "LUT buffer",
    size: rgb.length * 4 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  console.log(rgb);
};
