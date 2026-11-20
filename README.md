# Anomalous Pool (working title «Аномальный пул»)

**Play in the browser: https://iansilent.github.io/anomalous-pool/**

A personal web prototype of a pool roguelike, built from `docs/design-ru.md`.
In each round you pot coloured balls for points with a limited number of shots.
Between rounds you build a set of artifacts and ball properties that turn one shot into a chain reaction.

## Run

- Double-click `index.html`. It needs no server, no build step and no network.
- To share: `node tools/build.js` writes one self-contained file, `dist/anomalous-pool.html`. Send that file alone.
- Or serve the folder: `python3 -m http.server 8777` → http://localhost:8777.
- Progress is stored in the browser's `localStorage`, separately for the profile and the current run.
  Opening the file by double-click and through the server gives two separate saves.

## Controls

| Action | Mouse / touch | Keys |
|---|---|---|
| Set direction | click / tap the table (a hover previews it; with aim assist the aim snaps to a pot) | ← → fine turn by 0.1°, Shift + ← → by 1° |
| Power | the three buttons | 1 / 2 / 3 |
| Strike | «Удар» | Space |
| Skip the score count-up | click the table | Space |
| Speed up motion and counting | ⏩ | F |
| Pause / close | ≡ Меню | Esc |

## Layout

| File | Contents |
|---|---|
| `src/config.js` | every number: targets, prices, multipliers, physics, wave radius and impulse |
| `src/rng.js` | seeded streams derived from the run code |
| `src/physics.js` | table, 6 pockets, fixed-step simulation, prediction with the same step |
| `src/layouts.js` | 6 prepared loose racks in 3 families |
| `src/content.js` | artifacts, achievements, base pool |
| `src/rules.js` | shot resolution and scoring (§13.1 order) |
| `src/run.js` | run state machine: rounds, rewards, shop, victory, endless, save |
| `src/profile.js` | storage: profile, run, diagnostics |
| `src/render.js`, `src/ui.js`, `src/audio.js`, `src/main.js` | drawing, DOM screens, procedural sound, input and loop |
| `tools/check.js` | headless checks and a greedy bot |

## Checks

```bash
node tools/check.js
```

```bash
node tools/check.js --bot 10
```

The first runs every check plus 3 bot runs. The second runs only the bot, here 10 runs.
