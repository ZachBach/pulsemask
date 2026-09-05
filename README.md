# pulseMask_Tech

**PulseMask** — a photo-fitted full-face respirator study with an enclosed UV-C reactor and a
PZT (piezoelectric) array. Aurelius Dynamic, research prototype.

> **Status: PROTOTYPE / WORK IN PROGRESS.**
> Not a certified respirator. Not a medical device. Not tested to NIOSH 42 CFR 84, EN 136/143 or
> ISO 16900, and not cleared by any regulator. Germicidal and capsid-disruption performance is
> modelled, not measured.

---

## What it does

Open `index.html` in any modern browser. No build step, no server, no dependencies to install.

1. **Portrait in.** Drop a front-facing photo and drag five landmarks (pupils, nose tip, mouth,
   menton). One real-world measurement — interpupillary distance in mm — sets absolute scale.
2. **Face reconstruction.** Landmarks scale an anthropometric relief model; a high-pass of the
   photograph's luminance adds surface detail with the lighting gradient removed.
3. **Shell generation.** A sealing shell is grown onto the reconstructed face: wraparound visor
   aperture, inner oronasal cup, chin canister port, cheek exhaust ports, perimeter seal bead.
4. **Live engineering readout.** UV-C dose, log reduction, reactor dwell, dead space, seal
   compression error, printed mass — all recomputed on every parameter change.
5. **Export.** Binary STL in millimetres, OBJ + MTL, or GLB. Only visible parts are written.

## Files

| File | Role |
|---|---|
| `index.html` | The site: generator UI, live 3D stage, operation walkthrough, roadmap, case study |
| `mask-geometry.js` | Dependency-free parametric geometry engine. Emits named parts and binary STL |
| `three-d-stage.js` | 3D viewer shell: studio lighting, orbit controls, STL / OBJ / GLB export |
| `cli.mjs` | Headless generator — `node cli.mjs --ipd 63 -o export/mask.stl` |
| `shader-designs.js` | Shader Lab roster — 34 TSL surface designs, single source of truth for the Lab |
| `mission.html` | Mission, scope, readiness status and the seven-phase roadmap |
| `guide.html` · `assembly.html` | Print &amp; fit guide, and the eleven-stage build walkthrough |
| `shader-lab.html` · `pricing.html` | Finish designer, and ordering |
| `LICENSE.md` | Copyright, licence tiers, scope of what is sold, third-party attributions |

Design reference (`HANDOFF.md`), environment notes (`VSCODE.md`) and the agent process guide
(`AGENT_PLAYBOOK.md`) are kept out of this repo — they are internal working documents. Ask if
you need them.

`mask-geometry.js` has no browser dependencies and no three.js import — it runs headless in Node
to batch-generate STLs from a set of measurements.

## Quick start

```bash
python3 -m http.server 5501     # open http://127.0.0.1:5501/index.html
node cli.mjs --metrics-only     # engineering readout, no browser
node cli.mjs --ipd 63 -o export/mask.stl
```

## Rendering

three.js `WebGPURenderer` with TSL node materials. Two custom per-vertex attributes drive the
generator's visual readouts:

- `aBase` — per-vertex origin for the scan-line build morph, applied through `positionNode`
- `aFit` — per-vertex seal deviation, drives the fit heatmap through `outputNode`
- Airflow, LIDAR and radar point systems are `Sprite` + `instancedBufferAttribute`, not
  `THREE.Points` — on a WebGPU backend `Points` is capped at one pixel and ignores `sizeNode`

`three.webgpu.js` does not export `WebGLRenderer`, so there is no separate WebGL build. On a
machine with no WebGPU adapter the renderer falls back to WebGPURenderer's own WebGL2 backend
automatically. Read `stage.api` for which path is actually live — `webgpu` | `webgl2-fallback`
— and note the page footer prints it, because claiming WebGPU on a machine that quietly fell
back would be the rendering equivalent of rounding a metric in our favour.

three.js is pinned at **r0.184.0** and vendored under `vendor/`, so the site makes no external
runtime request, fonts included. Both viewer pages map `three` **and** `three/webgpu` to the
same `vendor/three.webgpu.js` — one URL means one module instance, and a second copy of three
in a single page is the thing never to do. The import map carries **no `integrity` block and
should not gain one**: these files are same-origin, which is not the threat SRI defends
against. `vendor/INTEGRITY.txt` records the sha384 of every vendored file along with the
command to re-verify them.

## Architecture

- **Shell** — SLS nylon PA12, 2.6 mm wall. Tough rather than brittle, and prints without supports
  so no support scars land on the sealing face.
- **Visor** — one wraparound lens, gasketed into the aperture. Polycarbonate, not printed.
- **Inner oronasal cup** — isolates the breathing circuit from the visor cavity. Keeps dead space
  low and the lens clear.
- **Chin canister** — intake grille → PZT coalescer → pleated filter → enclosed UV-C reactor with
  two LED rings and a mid-chamber PZT capsid ring → piezo blower → cup.
- **Cheek exhale valves** — diaphragm valves with piezo benders harvesting the breath pulse.
- **PZT roles** — capsid disruption, aerosol coalescence, seal-contact fit telemetry, blower
  assist, energy harvesting.

## The open problem

At 85 L/min peak inspiratory flow, air crosses a 28 mm reactor in ~27 ms, which yields
0.22 mJ/cm² against a ~3 mJ/cm² target for 2-log inactivation — 7% of it. The generator exposes
reactor length, LED count, optical power, labyrinth reflectance and design flow so the boundary
can be explored directly. Closing that gap needs a folded labyrinth, blower-decoupled flow, or a shift to
treating UV-C as a between-breath filter-media steriliser. This is Phase 2.

## Safety

UV-C is a serious eye and skin hazard. The reactor is drawn fully enclosed with no line of sight
to the wearer; the violet band on the canister is a status indicator, not a window. Any physical
build needs a hard interlock and a leakage survey before power-on.

## Repository

Public at [github.com/ZachBach/pulsemask](https://github.com/ZachBach/pulsemask), served by
GitHub Pages at <https://zachbach.github.io/pulsemask/>.
