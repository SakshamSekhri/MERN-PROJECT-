import { validateProject } from './models/projectValidation.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

export function frozenProject(project) {
  if (!validateProject(project)) fail(400, 'Invalid canvas version');
  return { v: 2, gridSize: project.gridSize, activeFrame: project.activeFrame,
    frames: project.frames.map(({ id, g }) => ({ id, g: { s: g.s, p: [...g.p], r: [...g.r] } })) };
}

export function projectThumbnail(project, frameId) {
  const grid = project.frames.find(frame => frame.id === frameId)?.g;
  if (!grid) fail(400, 'Cover frame not found');
  const size = grid.s;
  const outputSize = Math.min(size, 64);
  const cells = new Int16Array(size * size);
  let cursor = 0;
  for (let i = 0; i < grid.r.length; i += 2) { cells.fill(grid.r[i + 1], cursor, cursor + grid.r[i]); cursor += grid.r[i]; }
  const rectangles = [];
  for (let y = 0; y < outputSize; y++) {
    let x = 0;
    while (x < outputSize) {
      const index = cells[Math.floor(y * size / outputSize) * size + Math.floor(x * size / outputSize)];
      let width = 1;
      while (x + width < outputSize && cells[Math.floor(y * size / outputSize) * size + Math.floor((x + width) * size / outputSize)] === index) width++;
      if (index >= 0) rectangles.push(`<rect x="${x}" y="${y}" width="${width}" height="1" fill="${grid.p[index]}"/>`);
      x += width;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outputSize} ${outputSize}" shape-rendering="crispEdges"><rect width="${outputSize}" height="${outputSize}" fill="#19172c"/>${rectangles.join('')}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
