import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { step, stepOffsets, popCount, hashGrid, gridsEqual } from './life.js';
import { PRESETS } from './presets.js';

// ---------------------------------------------------------------- constants
const MAX_GEN = 400;
const SPEEDS = [1, 2, 4, 8, 16, 32, 64];
const BASE_GPS = 3; // generations per second at ×1

// ---------------------------------------------------------------- state
let size = 64;
let wrap = false;
let layerGap = 0.5;
let history = [new Uint8Array(size * size)]; // history[g] = grid at generation g
let offHistory = [null]; // per-gen torus winding offsets ({ox, oz} when wrap is on)
let viewGen = 0; // generation the camera/timeline is looking at
let playing = false;
let speedIdx = 2;
let drawMode = true;
let follow = true;
let endReason = null; // set once the sim can never produce anything new
let periodInfo = null; // { period, at } once an oscillation is detected
let seen = new Map(); // hash -> [{ gen, grid }] for cycle detection
let acc = 0;

let painting = false;
let paintValue = 1;

// ---------------------------------------------------------------- dom
const $ = (id) => document.getElementById(id);
const ui = {
  play: $('btn-play'),
  step: $('btn-step'),
  end: $('btn-end'),
  rewind: $('btn-rewind'),
  speed: $('speed'),
  speedLabel: $('speed-label'),
  timeline: $('timeline'),
  genLabel: $('gen-label'),
  status: $('status'),
  chipPop: $('chip-pop'),
  chipPeriod: $('chip-period'),
  presets: $('presets'),
  random: $('btn-random'),
  clear: $('btn-clear'),
  wrap: $('opt-wrap'),
  follow: $('opt-follow'),
  gap: $('opt-gap'),
  gapLabel: $('gap-label'),
  sizeSel: $('opt-size'),
  view: $('btn-view'),
  modeDraw: $('mode-draw'),
  modeOrbit: $('mode-orbit'),
};

// ---------------------------------------------------------------- three setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d14);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 6000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.55;

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x101018, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(1, 2.2, 1.4);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// board objects, rebuilt when grid size changes
let board = null; // { gridHelper, frame, ground, basePlane, cursor, hlMesh }

function buildBoard() {
  if (board) {
    for (const obj of Object.values(board)) {
      scene.remove(obj);
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
  }
  const gridHelper = new THREE.GridHelper(size, size, 0x2a3550, 0x151d2e);
  gridHelper.position.y = 0;

  const half = size / 2;
  const framePts = [
    new THREE.Vector3(-half, 0.02, -half),
    new THREE.Vector3(half, 0.02, -half),
    new THREE.Vector3(half, 0.02, half),
    new THREE.Vector3(-half, 0.02, half),
  ];
  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(framePts),
    new THREE.LineBasicMaterial({ color: 0x3d517b })
  );

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(size * 3.5, 72),
    new THREE.MeshBasicMaterial({ color: 0x0c101a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;

  const basePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  basePlane.rotation.x = -Math.PI / 2;

  const cursor = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)),
    new THREE.LineBasicMaterial({ color: 0x8ab4ff })
  );
  cursor.visible = false;

  const hlMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.08, 1.08, 1.08),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    size * size
  );
  hlMesh.count = 0;
  hlMesh.frustumCulled = false;

  board = { gridHelper, frame, ground, basePlane, cursor, hlMesh };
  for (const obj of Object.values(board)) scene.add(obj);
}

// ---------------------------------------------------------------- instanced cells
const cellGeo = new THREE.BoxGeometry(1, 1, 1);
const cellMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.08 });
let cellMesh = null;
let capacity = 0;
let instanceCount = 0;
let prefix = [0]; // prefix[g+1] = number of instances covering generations 0..g

const _mat4 = new THREE.Matrix4();
const _color = new THREE.Color();

function makeCellMesh(cap) {
  const m = new THREE.InstancedMesh(cellGeo, cellMat, cap);
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

function colorForGen(gen, out) {
  const hue = (0.52 + gen * 0.007) % 1;
  return out.setHSL(hue, 0.72, 0.56);
}

function layerY(gen) {
  const h = Math.min(layerGap, 1) * 0.92;
  return gen * layerGap + h / 2 + 0.02;
}

function appendLayerRaw(grid, gen) {
  const h = Math.min(layerGap, 1) * 0.92;
  const y = layerY(gen);
  const off = offHistory[gen];
  colorForGen(gen, _color);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      if (!grid[i]) continue;
      const ux = off ? x + off.ox[i] * size : x;
      const uz = off ? z + off.oz[i] * size : z;
      _mat4.makeScale(0.92, h, 0.92);
      _mat4.setPosition(ux - size / 2 + 0.5, y, uz - size / 2 + 0.5);
      cellMesh.setMatrixAt(instanceCount, _mat4);
      cellMesh.setColorAt(instanceCount, _color);
      instanceCount++;
    }
  }
  prefix.push(instanceCount);
  cellMesh.instanceMatrix.needsUpdate = true;
  if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
}

function ensureCapacity(n) {
  if (n <= capacity) return;
  let cap = Math.max(capacity, 65536);
  while (cap < n) cap *= 2;
  if (cellMesh) {
    scene.remove(cellMesh);
    cellMesh.dispose();
  }
  cellMesh = makeCellMesh(cap);
  capacity = cap;
  const gens = prefix.length - 1;
  instanceCount = 0;
  prefix = [0];
  for (let g = 0; g < gens; g++) appendLayerRaw(history[g], g);
}

function appendLayer(grid, gen) {
  ensureCapacity(instanceCount + popCount(grid));
  appendLayerRaw(grid, gen);
}

function rebuildAllLayers() {
  instanceCount = 0;
  prefix = [0];
  if (!cellMesh) ensureCapacity(1);
  for (let g = 0; g < history.length; g++) appendLayer(history[g], g);
  applyViewCount();
}

function applyViewCount() {
  cellMesh.count = prefix[Math.min(viewGen + 1, prefix.length - 1)];
  updateHighlight();
}

function updateHighlight() {
  const grid = history[viewGen];
  const hl = board.hlMesh;
  const h = Math.min(layerGap, 1);
  const y = layerY(viewGen);
  const off = offHistory[viewGen];
  let n = 0;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      if (!grid[i]) continue;
      const ux = off ? x + off.ox[i] * size : x;
      const uz = off ? z + off.oz[i] * size : z;
      _mat4.makeScale(1, h, 1);
      _mat4.setPosition(ux - size / 2 + 0.5, y, uz - size / 2 + 0.5);
      hl.setMatrixAt(n++, _mat4);
    }
  }
  hl.count = n;
  hl.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- simulation
function recordSeen(grid, gen) {
  const h = hashGrid(grid);
  const arr = seen.get(h);
  if (arr) arr.push({ gen, grid });
  else seen.set(h, [{ gen, grid }]);
}

function findSeen(grid) {
  const arr = seen.get(hashGrid(grid));
  if (!arr) return -1;
  for (const e of arr) if (gridsEqual(e.grid, grid)) return e.gen;
  return -1;
}

function zeroOffsets() {
  return wrap ? { ox: new Int8Array(size * size), oz: new Int8Array(size * size) } : null;
}

function resetWorld(grid0) {
  history = [grid0];
  offHistory = [zeroOffsets()];
  viewGen = 0;
  endReason = null;
  periodInfo = null;
  playing = false;
  acc = 0;
  seen = new Map();
  recordSeen(grid0, 0);
  rebuildAllLayers();
  updateAllUI();
}

function computeNext() {
  if (endReason) return false;
  const cur = history[history.length - 1];
  const next = step(cur, size, wrap);
  const gen = history.length;
  history.push(next);
  if (wrap) {
    const prev = offHistory[gen - 1];
    offHistory.push(stepOffsets(cur, next, size, prev.ox, prev.oz));
  } else {
    offHistory.push(null);
  }
  appendLayer(next, gen);
  if (popCount(next) === 0) {
    endReason = `💀 Died out at gen ${gen}`;
  } else if (!periodInfo) {
    const prev = findSeen(next);
    if (prev >= 0) {
      const period = gen - prev;
      if (period === 1) endReason = `🧊 Froze into a still life at gen ${prev}`;
      else periodInfo = { period, at: gen };
    } else {
      recordSeen(next, gen);
    }
  }
  if (!endReason && gen >= MAX_GEN) endReason = `⏱ Reached the ${MAX_GEN}-generation cap`;
  return true;
}

function advance() {
  if (viewGen < history.length - 1) {
    setViewGen(viewGen + 1);
    return true;
  }
  if (endReason || !computeNext()) {
    setPlaying(false);
    return false;
  }
  setViewGen(viewGen + 1);
  return true;
}

function runToEnd() {
  if (drawMode) setDrawMode(false);
  let guard = 0;
  while (!endReason && history.length - 1 < MAX_GEN && guard++ <= MAX_GEN + 2) computeNext();
  setPlaying(false);
  setViewGen(history.length - 1);
  frameTower();
}

function setViewGen(g) {
  viewGen = Math.max(0, Math.min(g, history.length - 1));
  applyViewCount();
  updateAllUI();
}

function setPlaying(on) {
  if (on) {
    if (history.length === 1 && popCount(history[0]) === 0) {
      ui.status.textContent = 'The grid is empty — draw something or pick a preset first.';
      return;
    }
    if (drawMode) setDrawMode(false);
    if (endReason && viewGen >= history.length - 1) setViewGen(0); // replay from the start
    acc = 0;
  }
  playing = on;
  updateAllUI();
}

function truncateToBase() {
  const grid0 = history[0];
  if (history.length === 1 && !endReason) return;
  playing = false;
  history = [grid0];
  offHistory = [zeroOffsets()];
  viewGen = 0;
  endReason = null;
  periodInfo = null;
  seen = new Map();
  recordSeen(grid0, 0);
  rebuildAllLayers();
}

// ---------------------------------------------------------------- editing
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

function cellFromEvent(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointerNdc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObject(board.basePlane, false)[0];
  if (!hit) return null;
  const x = Math.floor(hit.point.x + size / 2);
  const z = Math.floor(hit.point.z + size / 2);
  if (x < 0 || z < 0 || x >= size || z >= size) return null;
  return { x, z };
}

function setCell(x, z, v) {
  const grid0 = history[0];
  const i = z * size + x;
  if (grid0[i] === v) return;
  grid0[i] = v;
  rebuildAllLayers();
  updateAllUI();
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!drawMode || e.button !== 0) return;
  const cell = cellFromEvent(e);
  if (!cell) return;
  truncateToBase();
  paintValue = history[0][cell.z * size + cell.x] ? 0 : 1;
  setCell(cell.x, cell.z, paintValue);
  painting = true;
  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!drawMode) return;
  const cell = cellFromEvent(e);
  if (cell) {
    board.cursor.visible = true;
    board.cursor.scale.set(1, Math.min(layerGap, 1), 1);
    board.cursor.position.set(cell.x - size / 2 + 0.5, layerY(0), cell.z - size / 2 + 0.5);
    if (painting) setCell(cell.x, cell.z, paintValue);
  } else {
    board.cursor.visible = false;
  }
});

renderer.domElement.addEventListener('pointerup', () => {
  painting = false;
});

function setDrawMode(on) {
  drawMode = on;
  if (on) playing = false;
  controls.mouseButtons.LEFT = on ? null : THREE.MOUSE.ROTATE;
  controls.touches.ONE = on ? null : THREE.TOUCH.ROTATE;
  board.cursor.visible = false;
  ui.modeDraw.classList.toggle('active', on);
  ui.modeOrbit.classList.toggle('active', !on);
  updateAllUI();
}

// ---------------------------------------------------------------- camera
// Pull further back on narrow (portrait) viewports so the board still fits.
function aspectZoom() {
  return Math.max(1, 1.15 / camera.aspect);
}

function resetCamera() {
  const f = aspectZoom();
  camera.position.set(size * 0.85 * f, size * 0.7 * f, size * 1.05 * f);
  controls.target.set(0, size * 0.08, 0);
  controls.update();
}

// Instantly reposition the camera so the whole tower fits in view.
function frameTower() {
  const top = viewGen * layerGap;
  const dy = top * 0.5 - controls.target.y;
  controls.target.y += dy;
  camera.position.y += dy;
  const need = (size * 0.9 + top * 0.72) * aspectZoom();
  const off = camera.position.clone().sub(controls.target);
  if (off.length() < need) {
    off.setLength(need);
    camera.position.copy(controls.target).add(off);
  }
  controls.update();
}

function followCamera() {
  const top = viewGen * layerGap;
  const dy = (top * 0.5 - controls.target.y) * 0.05;
  controls.target.y += dy;
  camera.position.y += dy;
  const need = size * 0.9 + top * 0.72;
  const off = camera.position.clone().sub(controls.target);
  const dist = off.length();
  if (dist < need) {
    off.multiplyScalar(1 + Math.min((need - dist) / dist, 0.05));
    camera.position.copy(controls.target).add(off);
  }
}

// ---------------------------------------------------------------- ui
function statusText() {
  const last = history.length - 1;
  if (playing) return `Running ×${SPEEDS[speedIdx]}`;
  if (drawMode) return 'Draw on the base grid, then press ▶';
  if (endReason && viewGen === last) return `${endReason} — press ▶ to replay`;
  return 'Paused — drag to orbit, scrub the timeline';
}

function updateAllUI() {
  const last = history.length - 1;
  ui.play.textContent = playing ? '⏸' : '▶';
  ui.speedLabel.textContent = `×${SPEEDS[speedIdx]}`;
  ui.timeline.max = String(last);
  ui.timeline.value = String(viewGen);
  ui.genLabel.textContent = `${viewGen} / ${last}`;
  ui.status.textContent = statusText();
  ui.chipPop.textContent = `pop ${popCount(history[viewGen])}`;
  ui.chipPeriod.classList.toggle('hidden', !periodInfo);
  if (periodInfo) ui.chipPeriod.textContent = `oscillating · period ${periodInfo.period}`;
}

function loadPreset(p) {
  const grid0 = new Uint8Array(size * size);
  const { cells, w, h } = p.pattern;
  const ox = p.place === 'topleft' ? 2 : Math.floor((size - w) / 2);
  const oz = p.place === 'topleft' ? 2 : Math.floor((size - h) / 2);
  for (const [x, y] of cells) {
    const gx = ox + x;
    const gz = oz + y;
    if (gx >= 0 && gz >= 0 && gx < size && gz < size) grid0[gz * size + gx] = 1;
  }
  resetWorld(grid0);
  setDrawMode(false);
  setPlaying(true);
  closePanelOnMobile();
}

function drawThumb(canvas, pattern) {
  const ctx = canvas.getContext('2d');
  const W = (canvas.width = 108);
  const H = (canvas.height = 52);
  ctx.fillStyle = '#0a0e18';
  ctx.fillRect(0, 0, W, H);
  const px = Math.max(1, Math.floor(Math.min((W - 8) / pattern.w, (H - 8) / pattern.h)));
  const ox = Math.floor((W - pattern.w * px) / 2);
  const oy = Math.floor((H - pattern.h * px) / 2);
  ctx.fillStyle = '#6ea8ff';
  for (const [x, y] of pattern.cells) {
    ctx.fillRect(ox + x * px, oy + y * px, Math.max(px - 1, 1), Math.max(px - 1, 1));
  }
}

function buildPresetButtons() {
  ui.presets.innerHTML = '';
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset';
    btn.title = p.desc;
    const cv = document.createElement('canvas');
    drawThumb(cv, p.pattern);
    const label = document.createElement('span');
    label.textContent = p.name;
    btn.append(cv, label);
    btn.addEventListener('click', () => loadPreset(p));
    ui.presets.appendChild(btn);
  }
}

function randomSoup() {
  const grid0 = new Uint8Array(size * size);
  const margin = Math.floor(size * 0.2);
  for (let z = margin; z < size - margin; z++) {
    for (let x = margin; x < size - margin; x++) {
      if (Math.random() < 0.22) grid0[z * size + x] = 1;
    }
  }
  resetWorld(grid0);
  setDrawMode(false);
  setPlaying(true);
  closePanelOnMobile();
}

function setGridSize(n) {
  size = n;
  buildBoard();
  resetCamera();
  resetWorld(new Uint8Array(size * size));
  setDrawMode(true);
}

// ---------------------------------------------------------------- wiring
ui.play.addEventListener('click', () => {
  const starting = !playing;
  setPlaying(starting);
  if (starting && playing) closePanelOnMobile();
});
ui.step.addEventListener('click', () => {
  if (drawMode) setDrawMode(false);
  setPlaying(false);
  advance();
});
ui.end.addEventListener('click', runToEnd);
ui.rewind.addEventListener('click', () => setViewGen(0));
ui.speed.addEventListener('input', () => {
  speedIdx = parseInt(ui.speed.value, 10);
  updateAllUI();
});
ui.timeline.addEventListener('input', () => setViewGen(parseInt(ui.timeline.value, 10)));
ui.random.addEventListener('click', randomSoup);
ui.clear.addEventListener('click', () => {
  resetWorld(new Uint8Array(size * size));
  setDrawMode(true);
});
ui.wrap.addEventListener('change', () => {
  wrap = ui.wrap.checked;
  truncateToBase();
  offHistory[0] = zeroOffsets();
  updateAllUI();
});
ui.follow.addEventListener('change', () => (follow = ui.follow.checked));
ui.gap.addEventListener('input', () => {
  layerGap = parseFloat(ui.gap.value);
  ui.gapLabel.textContent = layerGap.toFixed(1);
  rebuildAllLayers();
});
ui.sizeSel.addEventListener('change', () => setGridSize(parseInt(ui.sizeSel.value, 10)));
ui.view.addEventListener('click', resetCamera);
ui.modeDraw.addEventListener('click', () => setDrawMode(true));
ui.modeOrbit.addEventListener('click', () => setDrawMode(false));

const panelEl = $('panel');
const isMobile = () => window.matchMedia('(max-width: 700px)').matches;
$('btn-panel').addEventListener('click', () => panelEl.classList.toggle('closed'));
function closePanelOnMobile() {
  if (isMobile()) panelEl.classList.add('closed');
}

const infoModal = $('info-modal');
$('btn-info').addEventListener('click', () => infoModal.classList.remove('hidden'));
$('info-close').addEventListener('click', () => infoModal.classList.add('hidden'));
infoModal.addEventListener('click', (e) => {
  if (e.target === infoModal) infoModal.classList.add('hidden');
});

window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === 'Escape') {
    infoModal.classList.add('hidden');
    return;
  }
  if (!infoModal.classList.contains('hidden')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    setPlaying(!playing);
  } else if (e.key === 'd' || e.key === 'D') {
    setDrawMode(!drawMode);
  } else if (e.key === 'ArrowLeft') {
    setPlaying(false);
    setViewGen(viewGen - 1);
  } else if (e.key === 'ArrowRight') {
    setPlaying(false);
    if (viewGen === history.length - 1 && !endReason) computeNext();
    setViewGen(viewGen + 1);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- boot + loop
buildBoard();
resetCamera();
buildPresetButtons();
rebuildAllLayers();
setDrawMode(true);
updateAllUI();

let lastT = performance.now();
renderer.setAnimationLoop((t) => {
  const dt = Math.min((t - lastT) / 1000, 0.1);
  lastT = t;
  if (playing) {
    acc += dt * BASE_GPS * SPEEDS[speedIdx];
    let steps = 0;
    while (acc >= 1 && steps < 16) {
      acc -= 1;
      if (!advance()) break;
      steps++;
    }
    if (follow) followCamera();
  }
  controls.update();
  renderer.render(scene, camera);
});
