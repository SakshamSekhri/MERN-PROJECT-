const HEX = /^#[0-9a-f]{6}$/i;

export function validateProject(project) {
  if (!project || project.v !== 2 || ![16, 32, 64, 128].includes(project.gridSize)) return false;
  if (!Array.isArray(project.frames) || project.frames.length < 1 || project.frames.length > 100) return false;
  const ids = new Set();
  for (const frame of project.frames) {
    if (!Number.isSafeInteger(frame?.id) || frame.id < 1 || ids.has(frame.id)) return false;
    ids.add(frame.id);
    const grid = frame.g;
    if (grid?.s !== project.gridSize || !Array.isArray(grid.p) || !Array.isArray(grid.r) || grid.r.length % 2 !== 0) return false;
    if (grid.p.length > 4096 || !grid.p.every(color => typeof color === 'string' && HEX.test(color))) return false;
    let cells = 0;
    for (let i = 0; i < grid.r.length; i += 2) {
      const count = grid.r[i], index = grid.r[i + 1];
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(index) || index < -1 || index >= grid.p.length) return false;
      cells += count;
    }
    if (cells !== project.gridSize ** 2) return false;
  }
  if (!Number.isSafeInteger(project.activeFrame) || project.activeFrame < 0 || project.activeFrame >= project.frames.length) return false;
  return true;
}
