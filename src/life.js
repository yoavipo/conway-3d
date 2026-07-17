// Core Conway's Game of Life simulation on a flat Uint8Array grid.

export function step(src, size, wrap = false) {
  const dst = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          let nx = x + dx;
          let ny = y + dy;
          if (wrap) {
            nx = (nx + size) % size;
            ny = (ny + size) % size;
          } else if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
            continue;
          }
          n += src[ny * size + nx];
        }
      }
      const alive = src[y * size + x];
      dst[y * size + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
    }
  }
  return dst;
}

export function popCount(grid) {
  let s = 0;
  for (let i = 0; i < grid.length; i++) s += grid[i];
  return s;
}

// FNV-1a over the raw bytes; callers must confirm with gridsEqual on a hit.
export function hashGrid(grid) {
  let h = 0x811c9dc5;
  for (let i = 0; i < grid.length; i++) {
    h ^= grid[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function gridsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
