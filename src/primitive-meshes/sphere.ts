/**
 * Create 16-byte aligned Float32Array of sphere vertices
 * @param radius - radius of the sphere
 * @param bands - number of bands
 */
export const getSphereVertices = (radius: number, bands = 16): Float32Array => {
  const vertices: number[] = [];

  for (let i = 0; i < bands; i++) {
    for (let j = 0; j < bands; j++) {
      const theta = (i * Math.PI) / bands;
      const thetaNext = ((i + 1) * Math.PI) / bands;
      const phi = (j * 2 * Math.PI) / bands;
      const phiNext = ((j + 1) * 2 * Math.PI) / bands;

      const pushVertex = (theta: number, phi: number) => {
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        vertices.push(radius * x, radius * y, radius * z, 1);
      };

      // Push vertices for the first triangle (bottom-left half of the quad)
      pushVertex(theta, phi);
      pushVertex(thetaNext, phi);
      pushVertex(thetaNext, phiNext);

      // Push vertices for the second triangle (top-right half of the quad)
      pushVertex(theta, phi);
      pushVertex(thetaNext, phiNext);
      pushVertex(theta, phiNext);
    }
  }

  return new Float32Array(vertices);
};
