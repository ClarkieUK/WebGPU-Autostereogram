function createCircleVertices({
  radius = 1,
  numSubdivisions = 24,
  innerRadius = 0,
  startAngle = 0,
  endAngle = Math.PI * 2,
} = {}) {
  // 2 triangles per subdivision, 3 verts per tri, 2 values (xy) each.
  const numVertices = numSubdivisions * 3 * 2;
  const vertexData = new Float32Array(numSubdivisions * 2 * 3 * 2);
 
  let offset = 0;
  const addVertex = (x, y) => {
    vertexData[offset++] = x;
    vertexData[offset++] = y;
  };
 
  // 2 triangles per subdivision
  //
  // 0--1 4
  // | / /|
  // |/ / |
  // 2 3--5
  for (let i = 0; i < numSubdivisions; ++i) {
    const angle1 = startAngle + (i + 0) * (endAngle - startAngle) / numSubdivisions;
    const angle2 = startAngle + (i + 1) * (endAngle - startAngle) / numSubdivisions;
 
    const c1 = Math.cos(angle1);
    const s1 = Math.sin(angle1);
    const c2 = Math.cos(angle2);
    const s2 = Math.sin(angle2);
 
    // first triangle
    addVertex(c1 * radius, s1 * radius);
    addVertex(c2 * radius, s2 * radius);
    addVertex(c1 * innerRadius, s1 * innerRadius);
 
    // second triangle
    addVertex(c1 * innerRadius, s1 * innerRadius);
    addVertex(c2 * radius, s2 * radius);
    addVertex(c2 * innerRadius, s2 * innerRadius);
  }
 
  return {
    vertexData,
    numVertices,
  };
}

function createColoredCircleVertices({
  radius = 1,
  numSubdivisions = 24,
  innerRadius = 0,
  startAngle = 0,
  endAngle = Math.PI * 2,
} = {}) {
  // 2 triangles per subdivision, 3 verts per tri, 5 values (xyrgb) each.
  const numVertices = numSubdivisions * 3 * 2;
  const vertexData = new Float32Array(numVertices * (2 + 3));
 
  let offset = 0;
  const addVertex = (x, y, r, g, b) => {
    vertexData[offset++] = x;
    vertexData[offset++] = y;
    vertexData[offset++] = r;
    vertexData[offset++] = g;
    vertexData[offset++] = b;
  };
 
  const innerColor = [1, 1, 1];
  const outerColor = [0.1, 0.1, 0.1];
 
  // 2 triangles per subdivision
  //
  // 0--1 4
  // | / /|
  // |/ / |
  // 2 3--5
  for (let i = 0; i < numSubdivisions; ++i) {
    const angle1 = startAngle + (i + 0) * (endAngle - startAngle) / numSubdivisions;
    const angle2 = startAngle + (i + 1) * (endAngle - startAngle) / numSubdivisions;
 
    const c1 = Math.cos(angle1);
    const s1 = Math.sin(angle1);
    const c2 = Math.cos(angle2);
    const s2 = Math.sin(angle2);
 
    // first triangle
    addVertex(c1 * radius, s1 * radius, ...outerColor);
    addVertex(c2 * radius, s2 * radius, ...outerColor);
    addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
 
    // second triangle
    addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
    addVertex(c2 * radius, s2 * radius, ...outerColor);
    addVertex(c2 * innerRadius, s2 * innerRadius, ...innerColor);
  }
 
  return {
    vertexData,
    numVertices,
  };
}

function createNormalisedCircleVertices({
  radius = 1,
  numSubdivisions = 24,
  innerRadius = 0,
  startAngle = 0,
  endAngle = Math.PI * 2,
} = {}) {
  // 2 triangles per subdivision, 3 verts per tri
  const numVertices = numSubdivisions * 3 * 2;
  // 2 32-bit values for position (xy) and 1 32-bit value for color (rgb_)
  // The 32-bit color value will be written/read as 4 8-bit values
  const vertexData = new Float32Array(numVertices * (2 + 1));
  const colorData = new Uint8Array(vertexData.buffer);
 
  let offset = 0;
  let colorOffset = 8;
  const addVertex = (x, y, r, g, b) => {
    vertexData[offset++] = x;
    vertexData[offset++] = y;
    offset += 1;  // skip the color
    colorData[colorOffset++] = r * 255;
    colorData[colorOffset++] = g * 255;
    colorData[colorOffset++] = b * 255;
    colorOffset += 9;  // skip extra byte and the position
  };
 
  const innerColor = [1, 1, 1];
  const outerColor = [0.1, 0.1, 0.1];
 
  // 2 triangles per subdivision
  //
  // 0--1 4
  // | / /|
  // |/ / |
  // 2 3--5
  for (let i = 0; i < numSubdivisions; ++i) {
    const angle1 = startAngle + (i + 0) * (endAngle - startAngle) / numSubdivisions;
    const angle2 = startAngle + (i + 1) * (endAngle - startAngle) / numSubdivisions;
 
    const c1 = Math.cos(angle1);
    const s1 = Math.sin(angle1);
    const c2 = Math.cos(angle2);
    const s2 = Math.sin(angle2);
 
    // first triangle
    addVertex(c1 * radius, s1 * radius, ...outerColor);
    addVertex(c2 * radius, s2 * radius, ...outerColor);
    addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
 
    // second triangle
    addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
    addVertex(c2 * radius, s2 * radius, ...outerColor);
    addVertex(c2 * innerRadius, s2 * innerRadius, ...innerColor);
  }
 
  return {
    vertexData,
    numVertices,
  };
}

export { createCircleVertices, createColoredCircleVertices, createNormalisedCircleVertices}