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

// Tracks how many times each live cell's lineage has wound around the torus, so
// the renderer can draw cells at unwrapped positions and trajectories cross the
// seam seamlessly. Survivors inherit their own offset; births take a majority
// vote over the implied offsets of their live parent neighbors.
export function stepOffsets(src, next, size, prevOx, prevOz) {
  const ox = new Int8Array(size * size);
  const oz = new Int8Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      if (!next[i]) continue;
      if (src[i]) {
        ox[i] = prevOx[i];
        oz[i] = prevOz[i];
        continue;
      }
      let bestCount = 0;
      let bestOx = 0;
      let bestOz = 0;
      const counts = new Map();
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const tx = x + dx;
          const tz = z + dz;
          const wx = tx < 0 ? -1 : tx >= size ? 1 : 0;
          const wz = tz < 0 ? -1 : tz >= size ? 1 : 0;
          const ni = (tz - wz * size) * size + (tx - wx * size);
          if (!src[ni]) continue;
          const cox = prevOx[ni] - wx;
          const coz = prevOz[ni] - wz;
          const key = (cox + 16) * 64 + (coz + 16);
          const c = (counts.get(key) || 0) + 1;
          counts.set(key, c);
          if (c > bestCount) {
            bestCount = c;
            bestOx = cox;
            bestOz = coz;
          }
        }
      }
      ox[i] = bestOx;
      oz[i] = bestOz;
    }
  }
  return { ox, oz };
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
