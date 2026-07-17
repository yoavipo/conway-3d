// Preset patterns. ASCII art: 'O' = alive, '.' = dead. Row = z axis, column = x axis.

function fromAscii(rows) {
  const cells = [];
  let w = 0;
  rows.forEach((row, y) => {
    w = Math.max(w, row.length);
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'O' || row[x] === 'o' || row[x] === '*') cells.push([x, y]);
    }
  });
  return { cells, w, h: rows.length };
}

function translate(cells, dx, dy) {
  return cells.map(([x, y]) => [x + dx, y + dy]);
}

function combine(...groups) {
  const cells = groups.flat();
  let w = 0;
  let h = 0;
  for (const [x, y] of cells) {
    w = Math.max(w, x + 1);
    h = Math.max(h, y + 1);
  }
  return { cells, w, h };
}

// Moves south-east (down-right).
const GLIDER_SE = fromAscii([
  '.O.',
  '..O',
  'OOO',
]);

// 180° rotation of the glider: moves north-west (up-left).
const GLIDER_NW = fromAscii([
  'OOO',
  'O..',
  '.O.',
]);

const LWSS = fromAscii([
  '.O..O',
  'O....',
  'O...O',
  'OOOO.',
]);

const PULSAR = fromAscii([
  '..OOO...OOO..',
  '.............',
  'O....O.O....O',
  'O....O.O....O',
  'O....O.O....O',
  '..OOO...OOO..',
  '.............',
  '..OOO...OOO..',
  'O....O.O....O',
  'O....O.O....O',
  'O....O.O....O',
  '.............',
  '..OOO...OOO..',
]);

// A 1x10 row evolves into the period-15 pentadecathlon oscillator.
const PENTADECATHLON_SEED = fromAscii(['OOOOOOOOOO']);

const GOSPER_GUN = fromAscii([
  '........................O...........',
  '......................O.O...........',
  '............OO......OO............OO',
  '...........O...O....OO............OO',
  'OO........O.....O...OO..............',
  'OO........O...O.OO....O.O...........',
  '..........O.....O.......O...........',
  '...........O...O....................',
  '............OO......................',
]);

const R_PENTOMINO = fromAscii([
  '.OO',
  'OO.',
  '.O.',
]);

const ACORN = fromAscii([
  '.O.....',
  '...O...',
  'OO..OOO',
]);

const DIEHARD = fromAscii([
  '......O.',
  'OO......',
  '.O...OOO',
]);

const GLIDER_FLEET = combine(
  GLIDER_SE.cells,
  translate(GLIDER_SE.cells, 9, 0),
  translate(GLIDER_SE.cells, 18, 0),
  translate(GLIDER_SE.cells, 0, 9),
  translate(GLIDER_SE.cells, 9, 9),
  translate(GLIDER_SE.cells, 18, 9),
);

// Head-on glider collision; offset tuned (see notes) so the pair annihilates.
const COLLISION_D = 14;
const HEAD_ON = combine(
  GLIDER_SE.cells,
  translate(GLIDER_NW.cells, COLLISION_D, COLLISION_D),
);

export const PRESETS = [
  {
    name: 'Glider',
    desc: 'The classic spaceship — a diagonal helix in time',
    pattern: GLIDER_SE,
    place: 'topleft',
  },
  {
    name: 'Glider Fleet',
    desc: 'Six gliders flying in formation — parallel helices',
    pattern: GLIDER_FLEET,
    place: 'topleft',
  },
  {
    name: 'Gosper Gun',
    desc: 'Fires a glider every 30 generations, forever',
    pattern: GOSPER_GUN,
    place: 'topleft',
  },
  {
    name: 'Pulsar',
    desc: 'Period-3 oscillator — builds a crystalline tower',
    pattern: PULSAR,
    place: 'center',
  },
  {
    name: 'Pentadecathlon',
    desc: 'A 10-cell row that becomes a period-15 oscillator',
    pattern: PENTADECATHLON_SEED,
    place: 'center',
  },
  {
    name: 'R-pentomino',
    desc: 'Five cells of pure chaos — runs for ages',
    pattern: R_PENTOMINO,
    place: 'center',
  },
  {
    name: 'Acorn',
    desc: 'Seven cells that erupt into a forest',
    pattern: ACORN,
    place: 'center',
  },
  {
    name: 'Diehard',
    desc: 'Vanishes completely after ~130 generations',
    pattern: DIEHARD,
    place: 'center',
  },
  {
    name: 'Head-on Crash',
    desc: 'Two gliders collide and annihilate',
    pattern: HEAD_ON,
    place: 'center',
  },
];
