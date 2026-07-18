# Conway 3D — Time Tower

Interactive 3D Conway's Game of Life where **time is the third dimension**: you draw a
starting pattern on a 2D base grid, and each generation stacks upward as a layer of
cubes, building a tower you can orbit, scrub, and replay.

## Run it

```sh
npm install
npm run dev   # http://localhost:5173
```

## How it works

- **Draw mode** — paint cells directly on the base plane (click/drag toggles). Editing
  truncates any computed tower back to generation 0.
- **Orbit mode** — left-drag rotates, wheel zooms, right-drag pans.
- **Play** — runs the simulation at ×1–×64 speed (speed slider). The camera gently
  follows the growing tower (toggle in Options).
- **Timeline** — scrub freely between generations; the bright layer marks where you are.
- **Auto-stop** — playback ends when the pattern dies out or freezes into a still life;
  oscillations are detected (via state hashing) and shown as a "period N" chip.
  Simulation caps at 400 generations.
- **⏩ Run to end** — computes the whole tower instantly and frames it.

## Presets

Glider, Glider Fleet, Gosper Glider Gun, Pulsar, Pentadecathlon (grown from a 10-cell
row), R-pentomino, Acorn, Diehard (dies at exactly gen 130), and Head-on Crash (two
gliders that annihilate at gen 32) — plus a random-soup button.

## Stack

Vanilla JS + [Three.js](https://threejs.org) (InstancedMesh rendering, instances ordered
by generation so scrubbing is just a draw-count change) + Vite. Simulation logic lives
dependency-free in `src/life.js`; patterns in `src/presets.js`.

## Keyboard

`space` play/pause · `d` draw/orbit · `←`/`→` step through generations

## Analytics

Umami receives an anonymous browser ID so repeat visits from the same browser can be
grouped under one Distinct ID. The ID contains no personal information and remains only
in that browser's local storage.

To exclude the current browser from analytics for 24 hours, run this on the live site's
developer console:

```js
conwayAnalytics.disableFor24Hours();
```

Tracking resumes automatically after 24 hours. To resume it immediately, run
`conwayAnalytics.enable()`.
