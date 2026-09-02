/* PulseMask Shader Lab — surface-design roster. Pure data + TSL, no imports.
 *
 * Track 3 landed here: designs used to be GLSL chunks spliced into
 * MeshStandardMaterial via onBeforeCompile. They are now TSL node graphs, which
 * is what lets the Lab run on WebGPURenderer alongside index.html — and, on a
 * machine with no adapter, compile to GLSL through the same renderer's WebGL2
 * fallback. One description, both backends.
 *
 * CONVENTION (matches the studio's tsl-lib, ../tsl-lib/docs/CONVENTIONS.md):
 * this module imports nothing. Every factory takes the TSL namespace as its
 * first argument, so the same file runs against a page's import map without
 * caring how three was loaded.
 *
 * Contract — every design is one function:
 *
 *   design(T, H, C) -> { albedo, glow }
 *
 *     T  TSL namespace (vec3, mix, smoothstep, …)
 *     H  shared helpers — H.hash(vec2) H.noise(vec2) H.fbm(vec2) H.hexCell(vec2)
 *     C  context:
 *          C.p      object-space position, METRES (shell ~0.14 m wide)
 *          C.n      object-space unit normal
 *          C.vN     view-space unit normal
 *          C.vV     unit vector fragment -> camera, view space
 *          C.t      seconds
 *          C.albedo material base colour coming in
 *
 *     returns albedo (required) and glow (optional emissive on top)
 *
 * THE HONESTY CONTRACT IS UNCHANGED and is now structurally stronger: the Lab's
 * source pane prints `design.toString()`, so the text on screen is literally the
 * function being executed. There is no second copy to drift.
 *
 * albedo is applied before lighting, so a design shades like paint; glow feeds
 * emissive. Designs apply only to allowlisted materials (printed shell, bronze
 * galea, canister alloy) — never the seal, bead, visor optics or indicators.
 * Visual layer only: geometry and every export path (STL/OBJ/GLB) carry the
 * base materials unchanged.
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- helpers */
  /* Built once per page against the page's TSL namespace. setLayout gives each
     one a real declared function in the emitted WGSL/GLSL rather than inlining
     the body at every call site — dsFbm alone is 5 octaves x 4 hashes, and
     several designs call it three times. */
  function makeHelpers(T) {
    const { Fn, vec2, vec4, float, floor, fract, sin, dot, mix, max, select } = T;

    /* NOTE ON THE SIGNATURE: when an Fn carries a setLayout with named inputs,
       TSL hands the callback ONE OBJECT keyed by those names — not an array.
       Destructure it (`{ q }`); indexing `args[0]` yields undefined, and TSL
       catches the resulting TypeError, logs it once and caches the broken node,
       so every later caller silently gets wrong output instead of an error. */

    const hash = Fn(function ({ q }) {
      return fract(sin(dot(q, vec2(127.1, 311.7))).mul(43758.5453));
    }).setLayout({ name: 'dsHash', type: 'float', inputs: [{ name: 'q', type: 'vec2' }] });

    const noise = Fn(function ({ q }) {
      const i = floor(q), f = fract(q);
      const u = f.mul(f).mul(float(3).sub(f.mul(2)));           // smoothstep weights
      return mix(
        mix(hash(i), hash(i.add(vec2(1, 0))), u.x),
        mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x),
        u.y
      );
    }).setLayout({ name: 'dsNoise', type: 'float', inputs: [{ name: 'q', type: 'vec2' }] });

    const fbm = Fn(function ({ q }) {
      /* Five octaves. The count is a compile-time constant, so a plain JS loop
         emits straight-line code — no dynamic loop in the shader, and no need
         for TSL Loop()/toVar() machinery. */
      let qi = q, a = 0.5, s = null;
      for (let k = 0; k < 5; k++) {
        const term = noise(qi).mul(a);
        s = s ? s.add(term) : term;
        qi = qi.mul(2.03).add(17.1);
        a *= 0.5;
      }
      return s;
    }).setLayout({ name: 'dsFbm', type: 'float', inputs: [{ name: 'q', type: 'vec2' }] });

    const hexDist = Fn(function ({ q }) {
      const a = q.abs();
      return max(dot(a, vec2(0.5, 0.8660254)), a.x);
    }).setLayout({ name: 'dsHexDist', type: 'float', inputs: [{ name: 'q', type: 'vec2' }] });

    /* hex tiling — vec2(distance to cell edge 0..0.5, per-cell random 0..1) */
    const hexCell = Fn(function ({ q }) {
      const s = vec4(1.0, 1.7320508, 1.0, 1.7320508);
      const h = vec4(q.x, q.y, q.x.sub(0.5), q.y.sub(0.8660254));
      const c = floor(h.div(s).add(0.5));
      const f = h.sub(c.mul(s));
      const near = dot(f.xy, f.xy).lessThan(dot(f.zw, f.zw));
      const g = select(near, f.xy, f.zw);
      const id = select(near, c.xy, c.zw.add(0.5));
      return vec2(float(0.5).sub(hexDist(g)), hash(id));
    }).setLayout({ name: 'dsHexCell', type: 'vec2', inputs: [{ name: 'q', type: 'vec2' }] });

    return { hash, noise, fbm, hexDist, hexCell };
  }

  /* ---------------------------------------------------------------- designs */
  const DESIGNS = [
    {
      id: 'hex-plate',
      name: 'Hex Plate',
      note: 'hexagonal armour tiling with seam underglow',
      design: function (T, H, C) {
        const { vec3, float, mix, smoothstep } = T;
        const q = C.p.xy.add(C.p.z.mul(0.35)).mul(220);   // ~4.5 mm cells; z shear breaks symmetry
        const hc = H.hexCell(q);
        const groove = smoothstep(0.16, 0.05, hc.x);      // dark seams between plates
        const plate = float(0.92).add(hc.y.sub(0.5).mul(0.16));  // per-plate tonal variation
        return {
          albedo: C.albedo.mul(mix(plate, float(0.30), groove)),
          glow: vec3(0.20, 0.75, 0.18).mul(smoothstep(0.10, 0.02, hc.x)).mul(0.25)
        };
      }
    },
    {
      id: 'carbon-weave',
      name: 'Carbon Weave',
      note: 'plain weave — the sheen band turns with the tow',
      design: function (T, H, C) {
        const { vec3, float, mix, floor, fract, cos, mod, pow, select } = T;
        const q = C.p.xy.mul(480);                        // ~2 mm tow
        const cell = floor(q);
        const over = mod(cell.x.add(cell.y), 2).greaterThan(0.5);  // over/under swap
        const f = fract(q).sub(0.5);
        const tow = select(over, f.y, f.x);               // fibre run flips with the weave
        const shade = float(0.55).add(cos(tow.mul(3.14159)).mul(0.45));
        const sheenAng = select(over, C.vN.x, C.vN.y);    // highlight turns 90° with the fibre
        const sheen = pow(float(1).sub(sheenAng.abs()).max(0), 6).mul(0.35);
        return { albedo: mix(C.albedo, vec3(0.10, 0.11, 0.13), 0.85).mul(shade).add(sheen) };
      }
    },
    {
      id: 'fbm-camo',
      name: 'FBM Camo',
      note: 'domain-warped value-noise camouflage',
      design: function (T, H, C) {
        const { vec3, mix, smoothstep } = T;
        const m = H.fbm(C.p.xy.mul(90).add(H.fbm(C.p.yx.mul(45)).mul(1.8)));
        const c1 = vec3(0.13, 0.16, 0.12), c2 = vec3(0.35, 0.38, 0.30), c3 = vec3(0.58, 0.55, 0.44);
        const camo = mix(c1, c2, smoothstep(0.35, 0.50, m));
        return { albedo: mix(camo, c3, smoothstep(0.58, 0.72, m)) };
      }
    },
    {
      id: 'iridescent',
      name: 'Iridescent Film',
      note: 'fresnel-driven thin-film colour sweep',
      design: function (T, H, C) {
        const { vec3, float, mix, cos, dot, pow } = T;
        const fr = pow(float(1).sub(dot(C.vN, C.vV).max(0)), 2);
        const ph = fr.mul(6.2832).add(C.p.y.mul(90));
        const film = cos(vec3(ph, ph.add(2.094), ph.add(4.189))).mul(0.5).add(0.5);
        return {
          albedo: mix(C.albedo, film.mul(0.8), fr.mul(0.35).add(0.55)),
          glow: film.mul(fr).mul(0.08)
        };
      }
    },
    {
      id: 'contour-scan',
      name: 'Contour Scan',
      note: 'structured-light rings with a slow lateral sweep',
      design: function (T, H, C) {
        const { vec3, sin, smoothstep } = T;
        const rings = smoothstep(0.80, 1.0, sin(C.p.y.mul(420).sub(C.t.mul(1.4))).abs());
        const sweep = smoothstep(0.75, 1.0, sin(C.p.x.mul(30).add(C.t.mul(0.7))));
        return {
          albedo: C.albedo.mul(0.55),
          glow: vec3(0.27, 1.0, 0.15).mul(rings.mul(0.5).add(sweep.mul(rings).mul(0.8))).mul(0.55)
        };
      }
    },
    {
      id: 'dragon-scale',
      name: 'Dragon Scale',
      note: 'scalloped bronze plate rows, alternate rows offset',
      design: function (T, H, C) {
        const { vec2, vec3, float, mix, floor, fract, mod, length, smoothstep } = T;
        const q = C.p.xy.mul(240);                        // ~4 mm scale rows
        const row = floor(q.y);
        const qx = q.x.add(mod(row, 2).mul(0.5));         // half-column offset, like the hood
        const f = vec2(fract(qx).sub(0.5), fract(q.y));
        const d = length(vec2(f.x, f.y.mul(0.62)));
        const arc = smoothstep(0.035, 0.015, d.sub(0.46).abs());   // overlap shadow arc
        const shade = mix(float(1), float(0.72), smoothstep(0.0, 0.46, d));
        const bronze = vec3(0.61, 0.47, 0.26);
        return { albedo: mix(C.albedo, bronze.mul(shade), 0.80).mul(float(1).sub(arc.mul(0.55))) };
      }
    },
    {
      id: 'circuit-pulse',
      name: 'Circuit Pulse',
      note: 'PCB trace grid with travelling signal pulses',
      design: function (T, H, C) {
        const { vec3, mix, floor, fract, sin, step, length, smoothstep, select } = T;
        const q = C.p.xy.mul(150);                        // ~6.7 mm trace pitch
        const cell = floor(q), f = fract(q);
        const h = H.hash(cell);
        const tr = select(h.lessThan(0.5), f.y.sub(0.5).abs(), f.x.sub(0.5).abs());  // run flips per cell
        const trace = smoothstep(0.06, 0.03, tr);
        const pad = smoothstep(0.16, 0.10, length(f.sub(0.5))).mul(step(0.82, H.hash(cell.add(7))));
        const pulse = smoothstep(0.85, 1.0,
          sin(h.mul(6.283).add(C.t.mul(2.2)).sub(q.x.add(q.y).mul(0.25))));
        return {
          albedo: mix(C.albedo, vec3(0.05, 0.10, 0.07), 0.85).add(vec3(0.10, 0.35, 0.12).mul(trace)),
          glow: vec3(0.27, 1.0, 0.25).mul(trace.mul(pulse).mul(0.7).add(pad.mul(0.4)))
        };
      }
    },
    {
      id: 'topo-lines',
      name: 'Topo Lines',
      note: 'depth contours off the face plane, major/minor',
      design: function (T, H, C) {
        const { vec3, mix, sin, max, smoothstep } = T;
        const d = C.p.z.mul(900);                         // ~3.5 mm contour spacing
        const major = smoothstep(0.90, 1.0, sin(d).abs());
        const minor = smoothstep(0.96, 1.0, sin(d.mul(5)).abs()).mul(0.5);
        return {
          albedo: mix(C.albedo, C.albedo.mul(0.45), max(major, minor)),
          glow: vec3(0.20, 0.90, 0.30).mul(major).mul(0.12)
        };
      }
    },
    {
      id: 'voronoi-shatter',
      name: 'Voronoi Shatter',
      note: 'stained-glass voronoi cells with dark lead seams',
      design: function (T, H, C) {
        const { vec2, vec3, float, mix, floor, fract, cos, dot, min, sqrt, smoothstep, select } = T;
        const q = C.p.xy.add(C.p.z.mul(0.4)).mul(160);    // ~6 mm shards; z shear breaks symmetry
        const g = floor(q), f = fract(q);
        /* 3x3 search, unrolled. The GLSL kept nearest/second-nearest with an
           if/else chain; branchless it is newF1 = min(f1,d), and f1 only
           becomes f2 when d actually displaces it — all read from the previous
           iteration's values before either is reassigned. */
        let f1 = float(8), f2 = float(8), idc = vec2(0);
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const c = g.add(vec2(i, j));
            const pt = vec2(i, j).add(vec2(H.hash(c), H.hash(c.add(91.7)))).sub(f);
            const d = dot(pt, pt);
            const closer = d.lessThan(f1);
            const nf2 = select(closer, f1, min(f2, d));
            const nf1 = min(f1, d);
            idc = select(closer, c, idc);
            f1 = nf1; f2 = nf2;
          }
        }
        const d1 = sqrt(f1), edge = sqrt(f2).sub(d1);     // 0 exactly on cell borders
        const lead = smoothstep(0.14, 0.04, edge);        // dark lead lines between panes
        const hue = H.hash(idc.add(3.1)).mul(6.2832);
        const pane = cos(vec3(hue, hue.add(2.094), hue.add(4.189))).mul(0.34).add(0.52)
          .mul(float(0.80).add(float(1).sub(d1).mul(0.25)));  // glassy falloff toward centre
        return {
          albedo: mix(pane, vec3(0.06, 0.06, 0.07), lead),
          glow: pane.mul(smoothstep(0.10, 0.02, edge)).mul(0.10)   // faint light leak at seams
        };
      }
    },
    {
      id: 'marble-vein',
      name: 'Marble Vein',
      note: 'fbm-warped thin sin bands carve veins in pale stone',
      design: function (T, H, C) {
        const { vec3, mix, sin, smoothstep } = T;
        const q = C.p.xy.mul(55);                         // slab scale — a few veins across the shell
        const w = H.fbm(q.mul(0.9)).mul(4.5);             // fbm warp drives the vein wander
        const v1 = smoothstep(0.20, 0.0, sin(q.x.mul(2.4).add(q.y.mul(0.9)).add(w)).abs());
        const v2 = smoothstep(0.10, 0.0,
          sin(q.y.mul(1.8).sub(q.x.mul(0.7)).add(w.mul(1.6)).add(2.4)).abs());
        const cloud = H.fbm(q.mul(2.6)).mul(0.10);        // faint mineral cloudiness
        let a = vec3(0.93, 0.92, 0.90).sub(cloud);
        a = mix(a, vec3(0.24, 0.24, 0.28), v1.mul(0.85));
        return { albedo: mix(a, vec3(0.80, 0.63, 0.27), v2.mul(0.55)) };
      }
    },
    {
      id: 'wood-grain',
      name: 'Wood Grain',
      note: 'fbm-wobbled growth rings about an off-axis heart',
      design: function (T, H, C) {
        const { vec2, vec3, float, mix, sin, pow, length } = T;
        const q = C.p.xy.mul(120);                        // plank scale
        const r = length(q.sub(vec2(7.0, -10.0)))         // rings about a heart set off the shell
          .add(H.fbm(q.mul(0.6)).mul(2.0));               // fbm wobble keeps rings hand-cut
        const ring = pow(sin(r.mul(6)).mul(0.5).add(0.5), 3);   // ~9 mm pitch, sharp late wood
        const streak = H.noise(vec2(q.x.mul(8), q.y.mul(0.35))).mul(0.13);
        const early = vec3(0.57, 0.37, 0.19), late = vec3(0.30, 0.17, 0.08);
        return { albedo: mix(early, late, ring).sub(streak) };
      }
    },
    {
      id: 'magma-flow',
      name: 'Magma Flow',
      note: 'glowing melt channels thresholded out of warped fbm',
      design: function (T, H, C) {
        const { vec3, float, mix, sin, smoothstep } = T;
        const q = C.p.xy.mul(100);                        // ~cm crust plates
        const f = H.fbm(q.add(H.fbm(q.mul(0.5)).mul(1.6)));   // cracks live on f = 0.5
        const crack = smoothstep(0.09, 0.01, f.sub(0.5).abs());
        const crust = H.fbm(q.mul(2.4)).mul(0.10);        // charcoal surface rubble
        const throb = float(0.7).add(sin(C.t.mul(0.7).add(f.mul(10))).mul(0.3));
        const basalt = vec3(0.07, 0.055, 0.05).add(crust);
        return {
          albedo: mix(basalt, vec3(1.0, 0.42, 0.06).mul(throb), crack),
          glow: vec3(1.0, 0.30, 0.03).mul(crack).mul(throb).mul(0.45)
        };
      }
    },
    {
      id: 'frost-bloom',
      name: 'Frost Bloom',
      note: 'ridged fbm crystals, fresnel frosts the rim hardest',
      design: function (T, H, C) {
        const { vec3, float, mix, dot, pow, clamp, smoothstep } = T;
        const q = C.p.xy.mul(150).add(C.p.z.mul(60));     // ~1 mm feathering
        const ridge = pow(float(1).sub(H.fbm(q).mul(2).sub(1).abs()), 4);  // fbm folded into spines
        const fr = pow(float(1).sub(dot(C.vN, C.vV).max(0)), 3);
        const cover = clamp(ridge.mul(0.75).add(fr.mul(0.95)), 0, 1);      // grazing edges frost hardest
        const ice = mix(vec3(0.44, 0.62, 0.78), vec3(0.93, 0.97, 1.0), ridge);
        return {
          albedo: mix(C.albedo.mul(vec3(0.60, 0.70, 0.80)), ice, cover),  // cold-cast base shows through
          glow: vec3(0.22, 0.42, 0.65).mul(fr).mul(float(0.4).add(ridge.mul(0.6))).mul(0.20)
        };
      }
    },
    {
      id: 'turing-spots',
      name: 'Turing Spots',
      note: 'multi-scale noise thresholded into dark-rimmed spots',
      design: function (T, H, C) {
        const { vec3, mix, smoothstep } = T;
        const q = C.p.xy.add(C.p.z.mul(0.3)).mul(130);    // ~3 mm spots
        const f = H.noise(q).mul(0.55)                    // multi-scale field merges blobs, RD-style
          .add(H.noise(q.mul(2.3).add(41.7)).mul(0.30))
          .add(H.fbm(q.mul(0.4)).mul(0.30));
        const body = smoothstep(0.62, 0.70, f);           // spot interiors
        const rim = smoothstep(0.54, 0.62, f).sub(body);  // darker ring hugging each spot
        const mottle = H.fbm(q.mul(1.8)).mul(0.08);       // keeps the ground organic
        let a = vec3(0.77, 0.66, 0.47).sub(mottle);       // tan hide
        a = mix(a, vec3(0.46, 0.31, 0.17), body);
        return { albedo: mix(a, vec3(0.23, 0.14, 0.08), rim) };
      }
    },
    {
      id: 'tiger-stripe',
      name: 'Tiger Stripe',
      note: 'fbm-warped thresholded bands with white underside',
      design: function (T, H, C) {
        const { vec3, float, mix, sin, smoothstep } = T;
        const w = H.fbm(C.p.xy.mul(55)).sub(0.5);         // heavy warp bends the bands
        const band = sin(C.p.x.mul(160).add(w.mul(9)).add(C.p.y.mul(30)));
        const ink = smoothstep(0.45, 0.70, band);         // thresholded sin -> bold black stripes
        const belly = smoothstep(0.01, -0.045, C.p.y);    // white underside low on the mask
        const coat = mix(vec3(0.86, 0.40, 0.07), vec3(0.93, 0.90, 0.84), belly)
          .mul(float(0.93).add(H.noise(C.p.xy.mul(380)).mul(0.14)));   // fur grain
        return { albedo: mix(coat, vec3(0.05, 0.04, 0.03), ink) };
      }
    },
    {
      id: 'leopard-rosette',
      name: 'Leopard Rosette',
      note: 'hash-broken rosette rings on a wobbled hex lattice',
      design: function (T, H, C) {
        const { vec3, float, mix, step, smoothstep } = T;
        const q = C.p.xy.add(C.p.z.mul(0.3)).mul(95);     // ~1 cm rosettes; z shear breaks rows
        const hc = H.hexCell(q.add(H.fbm(q.mul(0.9)).sub(0.5).mul(0.7)));   // wobbled lattice
        const ring = smoothstep(0.30, 0.25, hc.x).mul(smoothstep(0.11, 0.16, hc.x))
          .mul(step(0.42, H.noise(q.mul(2.4).add(hc.y.mul(37)))))          // hash-seeded ring breaks
          .mul(step(0.15, hc.y));                                          // a few cells skip it
        const fill = smoothstep(0.14, 0.26, hc.x).mul(step(0.15, hc.y));
        let coat = vec3(0.76, 0.60, 0.37).mul(float(0.90).add(H.noise(q.mul(3.1)).mul(0.20)));
        coat = mix(coat, vec3(0.85, 0.68, 0.40), fill.mul(0.45));          // lighter centre fill
        return { albedo: mix(coat, vec3(0.17, 0.09, 0.04), ring) };
      }
    },
    {
      id: 'snake-diamond',
      name: 'Snake Diamond',
      note: 'folded diamond scales with per-scale tonal hash',
      design: function (T, H, C) {
        const { vec2, vec3, float, mix, floor, fract, step, pow, smoothstep } = T;
        const q = C.p.xy.mul(260);                        // ~3.8 mm scales
        const u = vec2(q.x.add(q.y), q.x.sub(q.y));       // fold the plane into a diamond grid
        const id = floor(u), f = fract(u).sub(0.5);
        const d = f.x.abs().add(f.y.abs());               // L1 metric -> diamond cells
        const h = H.hash(id);
        const scl = mix(vec3(0.30, 0.34, 0.14), vec3(0.06, 0.07, 0.03), step(0.6, h))
          .mul(float(0.80).add(h.mul(0.40)));             // olive -> black tonal jitter
        const edge = smoothstep(0.70, 0.92, d);           // dark inter-scale crease
        const sheen = pow(float(1).sub(C.vN.y.sub(0.2).abs()).max(0), 12);  // glossy sheen stripe
        return { albedo: mix(scl, vec3(0.02, 0.02, 0.01), edge).add(sheen.mul(vec3(0.32, 0.34, 0.24))) };
      }
    },
    {
      id: 'zebra-warp',
      name: 'Zebra Warp',
      note: 'fbm-warped stripes, duty cycle breathing along y',
      design: function (T, H, C) {
        const { vec3, float, mix, sin, smoothstep } = T;
        const w = H.fbm(C.p.yx.mul(70)).sub(0.5).mul(7);  // heavy warp -> wandering stripes
        const duty = float(0.32).add(sin(C.p.y.mul(24)).mul(0.22));   // width breathes along y
        const band = sin(C.p.y.mul(230).add(C.p.x.mul(35)).add(w)).mul(0.5).add(0.5);
        const ink = smoothstep(duty.add(0.05), duty.sub(0.05), band);
        const pelt = mix(vec3(0.94, 0.93, 0.90), vec3(0.03, 0.03, 0.04), ink);
        return { albedo: pelt.mul(float(0.92).add(H.noise(C.p.xy.mul(300)).mul(0.08))) };
      }
    },
    {
      id: 'peacock-eye',
      name: 'Peacock Eye',
      note: 'concentric eye spots on a jittered hex lattice',
      design: function (T, H, C) {
        const { vec3, float, mix, sin, smoothstep } = T;
        const q = C.p.xy.add(C.p.z.mul(0.25)).mul(70);    // ~1.4 cm eye spots
        const hc = H.hexCell(q);
        const r = float(0.5).sub(hc.x).add(hc.y.sub(0.5).mul(0.10));  // radial-ish, sized per cell
        const gold = vec3(0.95, 0.72, 0.20);
        const base = vec3(0.02, 0.13, 0.14).mul(float(0.75).add(H.fbm(q.mul(1.7)).mul(0.50)));
        const rim = smoothstep(0.31, 0.27, r).mul(smoothstep(0.18, 0.22, r));   // gold ring
        const iris = smoothstep(0.19, 0.15, r);
        const pupil = smoothstep(0.085, 0.055, r);
        let eye = mix(base, gold, rim);
        eye = mix(eye, vec3(0.04, 0.34, 0.38), iris);     // bright teal iris
        eye = mix(eye, vec3(0.01, 0.02, 0.05), pupil);    // dark pupil
        return {
          albedo: eye,
          glow: gold.mul(rim).mul(float(0.08).add(sin(C.t.mul(1.3).add(hc.y.mul(6.2832))).mul(0.04)))
        };
      }
    },
    {
      id: 'giraffe-patch',
      name: 'Giraffe Patch',
      note: 'cream channels between wobbled coarse voronoi patches',
      design: function (T, H, C) {
        const { vec3, float, mix, smoothstep } = T;
        const q = C.p.xy.add(C.p.z.mul(0.4)).mul(55);     // ~1.8 cm patches
        const hc = H.hexCell(q.add(H.fbm(q.mul(1.2)).sub(0.5).mul(0.6)));  // irregular polygons
        const channel = smoothstep(0.15, 0.08, hc.x);     // wide cream seams between patches
        const spot = vec3(0.60, 0.38, 0.18).mul(float(0.82).add(hc.y.mul(0.36)))
          .mul(float(0.92).add(H.noise(q.mul(4)).mul(0.16)));   // faint mottle inside each patch
        return { albedo: mix(spot, vec3(0.91, 0.85, 0.69), channel) };
      }
    },
    {
      id: 'bismuth-hopper',
      name: 'Bismuth Hopper',
      note: 'quantised max-metric terraces with anodised oxide tint',
      design: function (T, H, C) {
        const { vec2, vec3, float, floor, fract, sin, cos, dot, max, pow, smoothstep } = T;
        const q = C.p.xy.add(C.p.z.mul(0.5)).mul(90);     // ~11 mm hopper crystals
        const cell = floor(q), f0 = fract(q).sub(0.5);
        const a = H.hash(cell).mul(6.2832);               // each crystal spun randomly
        const ca = cos(a), sa = sin(a);
        const rot = vec2(f0.x.mul(ca).sub(f0.y.mul(sa)), f0.x.mul(sa).add(f0.y.mul(ca)));
        const f = rot.sub(vec2(H.hash(cell.add(3)), H.hash(cell.add(9))).mul(0.4).sub(0.2));
        const cheb = max(f.x.abs(), f.y.abs());           // max metric -> square terraces
        const terr = floor(cheb.mul(10));
        const riser = smoothstep(0.78, 0.97, fract(cheb.mul(10)));   // step edges
        const ph = terr.mul(0.9).add(a);                  // hue steps once per terrace
        const oxide = cos(vec3(ph, ph.add(2.094), ph.add(4.189))).mul(0.45).add(0.5);
        const fr = pow(float(1).sub(dot(C.vN, C.vV).max(0)), 3);
        return {
          albedo: oxide.mul(float(0.58).add(fr.mul(0.38)))          // film brightens toward the rim
            .mul(float(1).sub(riser.mul(0.45))),                    // shadowed step walls
          glow: oxide.mul(riser).mul(0.10)                          // faint glint on each edge
        };
      }
    },
    {
      id: 'anodized-fade',
      name: 'Anodized Fade',
      note: 'thin-film ramp shifted by view angle over brushed metal',
      design: function (T, H, C) {
        const { vec2, vec3, float, cos, dot, pow } = T;
        const ct = dot(C.vN, C.vV).max(0);
        const film = C.p.y.mul(4.5).sub(float(1).sub(ct).mul(0.9)).add(0.3);  // one slow oxide sweep
        const ti = cos(vec3(film.mul(6.2832), film.mul(6.2832).add(2.094), film.mul(6.2832).add(4.189)))
          .mul(0.34).add(0.40);
        const brush = H.noise(vec2(C.p.x.mul(12), C.p.y.mul(2400)));  // ~0.4 mm streaks running x
        return {
          albedo: ti.mul(float(0.84).add(brush.mul(0.28))),
          glow: ti.mul(pow(float(1).sub(ct), 4)).mul(0.05)            // whisper of rim colour
        };
      }
    },
    {
      id: 'verdigris-patina',
      name: 'Verdigris',
      note: 'thresholded fbm patina creeping from off-axis faces',
      design: function (T, H, C) {
        const { vec3, float, mix, smoothstep } = T;
        const m = H.fbm(C.p.xy.mul(65).add(H.fbm(C.p.yx.mul(130)).mul(0.9)));   // ~15 mm patches
        const crevice = float(1).sub(C.n.z.max(0));       // forward faces stay rain-washed
        const pat = smoothstep(0.50, 0.63, m.add(crevice.mul(0.30)));
        const copper = vec3(0.60, 0.33, 0.19).mul(float(0.82).add(H.noise(C.p.xy.mul(420)).mul(0.30)));
        const verd = mix(vec3(0.20, 0.50, 0.42), vec3(0.44, 0.70, 0.56),
          H.noise(C.p.xy.mul(240)));                      // mottled carbonate greens
        const rim = pat.mul(float(1).sub(pat)).mul(4);    // dark tarnish at the tide line
        return { albedo: mix(mix(copper, verd, pat), vec3(0.15, 0.11, 0.08), rim.mul(0.55)) };
      }
    },
    {
      id: 'damascus-fold',
      name: 'Damascus',
      note: 'fbm-folded sin layers with blue temper fresnel',
      design: function (T, H, C) {
        const { vec3, float, mix, sin, dot, pow, smoothstep } = T;
        const q = C.p.xy.mul(55);
        const fold = H.fbm(q).mul(34).add(H.fbm(q.mul(3.3).add(7)).mul(11));   // two fold scales
        const lyr = smoothstep(-0.55, 0.55, sin(C.p.y.mul(1400).add(fold)));   // ~4.5 mm layers
        const steel = mix(vec3(0.13, 0.14, 0.16), vec3(0.55, 0.56, 0.58), lyr)
          .mul(float(0.88).add(H.noise(C.p.xy.mul(640)).mul(0.24)));           // acid-etch grain
        const fr = pow(float(1).sub(dot(C.vN, C.vV).max(0)), 3);
        return {
          albedo: steel.add(vec3(0.07, 0.13, 0.28).mul(fr).mul(float(0.3).add(lyr.mul(0.6))))
        };
      }
    },
    {
      id: 'aurora-veil',
      name: 'Aurora Veil',
      note: 'fbm-warped curtains drifting over sparse stars',
      design: function (T, H, C) {
        const { vec2, vec3, float, mix, floor, sin, step, pow, smoothstep } = T;
        const w = H.fbm(vec2(C.p.x.mul(22).add(C.t.mul(0.12)), C.p.y.mul(5).sub(C.t.mul(0.04))));
        const curt = pow(sin(C.p.x.mul(55).add(w.mul(8)).add(C.t.mul(0.35))).mul(0.5).add(0.5), 3);
        const rays = float(0.55).add(H.noise(vec2(C.p.x.mul(320).add(w.mul(12)), C.p.y.mul(3))).mul(0.45));
        const acol = mix(vec3(0.10, 0.85, 0.30), vec3(0.45, 0.15, 0.80),
          smoothstep(-0.05, 0.06, C.p.y));                // green skirts, violet crowns
        const star = step(0.9965, H.hash(floor(C.p.xy.mul(800))));   // ~1 mm pinpoints
        return {
          albedo: vec3(0.012, 0.018, 0.040),              // moonless-night base
          glow: acol.mul(curt).mul(rays).mul(0.45)
            .add(vec3(0.75, 0.80, 0.90).mul(star).mul(0.30).mul(float(1).sub(curt)))
        };
      }
    },
    {
      id: 'starfield-drift',
      name: 'Starfield',
      note: 'multi-scale hash stars with a soft diagonal band',
      design: function (T, H, C) {
        const { vec2, vec3, float, mix, floor, fract, sin, step, dot, smoothstep } = T;
        const d = dot(C.p.xy, vec2(0.707, 0.707));        // diagonal galactic plane
        const milky = smoothstep(0.055, 0.0, d.add(0.008).abs()).mul(H.fbm(C.p.xy.mul(26).add(4)));
        const dust = step(0.9955, H.hash(floor(C.p.xy.mul(1500)))).mul(0.16);   // faint grains
        const mids = step(0.995, H.hash(floor(C.p.xy.mul(620)).add(2.7))).mul(0.30);
        const bh = H.hash(floor(C.p.xy.mul(260)).add(6.1));  // coarse cells -> the bright few
        const bright = step(0.994, bh);
        const tw = float(0.55).add(sin(C.t.mul(2.6).add(bh.mul(44))).mul(0.45));  // only big ones twinkle
        const tint = mix(vec3(1.0, 0.86, 0.70), vec3(0.72, 0.82, 1.0), fract(bh.mul(9)));
        return {
          albedo: vec3(0.008, 0.010, 0.015)               // deep-space black
            .add(vec3(0.050, 0.055, 0.075).mul(milky)),   // wide soft haze, no hard edge
          glow: vec3(0.08, 0.085, 0.11).mul(milky).mul(0.5)
            .add(vec3(0.85, 0.88, 1.0).mul(dust.add(mids)))
            .add(tint.mul(bright).mul(0.5).mul(tw))
        };
      }
    },
    {
      id: 'plasma-wave',
      name: 'Plasma Wave',
      note: 'summed moving sin fields through a cos rainbow palette',
      design: function (T, H, C) {
        const { vec2, vec3, cos, sin, length } = T;
        const q = C.p.xy.mul(55);                         // broad ~2 cm plasma swirls
        const v = sin(q.x.add(C.t.mul(0.9)))
          .add(sin(q.x.add(q.y).mul(0.5).add(C.t.mul(1.3))))
          .add(sin(length(q.sub(vec2(sin(C.t.mul(0.43)), cos(C.t.mul(0.31))).mul(3))).add(C.t.mul(0.7))))
          .add(sin(q.y.mul(0.8).sub(C.t.mul(0.5))));
        const ph = v.mul(1.35);                           // v in [-4,4] -> ~2 palette laps
        const neon = cos(vec3(ph, ph.add(2.094), ph.add(4.189))).mul(0.5).add(0.5);
        return { albedo: neon.mul(0.8), glow: neon.mul(0.16) };
      }
    },
    {
      id: 'ripple-tank',
      name: 'Ripple Tank',
      note: 'two-source interference with time-independent nodal hyperbolae',
      design: function (T, H, C) {
        const { vec2, vec3, float, mix, cos, length, smoothstep } = T;
        const q = C.p.xy.mul(200);                        // shell half-width ~14 units
        const k = 4.2;                                    // ~7.5 mm ripple wavelength
        const d1 = length(q.sub(vec2(-5.0, 2.0)));        // sources near the cheekbones
        const d2 = length(q.sub(vec2(5.0, 2.0)));
        const env = cos(d1.sub(d2).mul(k * 0.5));         // time-independent phasor envelope
        const wave = env.mul(cos(d1.add(d2).mul(k * 0.5).sub(C.t.mul(2.5))));   // animated carrier
        const node = smoothstep(0.20, 0.03, env.abs());   // lines where waves always cancel
        const deep = vec3(0.02, 0.05, 0.13);
        const cyan = vec3(0.12, 0.70, 0.88);
        const a = mix(deep, cyan.mul(0.85), wave.mul(0.5).add(0.5));
        return {
          albedo: mix(a, deep.mul(0.5), node),            // darken the still nodal lines
          glow: cyan.mul(wave.max(0)).mul(float(1).sub(node)).mul(0.12)
        };
      }
    },
    {
      id: 'moire-rosette',
      name: 'Moire Rosette',
      note: 'two skewed fine gratings; the beat pattern is never drawn',
      design: function (T, H, C) {
        const { vec3, mix, fract, max, smoothstep } = T;
        const q = C.p.xy.mul(700);                        // ~1.4 mm line pitch
        const a = 0.06;                                   // gratings skewed ~3.4 degrees
        const rx = q.x.mul(Math.cos(a)).sub(q.y.mul(Math.sin(a)));   // grating B axis, rotated
        const g1 = smoothstep(0.22, 0.30, fract(q.x).sub(0.5).abs());        // grating A
        const g2 = smoothstep(0.22, 0.30, fract(rx.mul(1.03)).sub(0.5).abs());  // B: +3% pitch
        const ink = max(g1, g2);                          // overlay; the beat emerges free
        return { albedo: mix(vec3(0.87, 0.86, 0.82), vec3(0.13, 0.12, 0.13), ink.mul(0.9)) };
      }
    },
    {
      id: 'gyroid-field',
      name: 'Gyroid Field',
      note: 'gyroid iso-lines in full 3d with slow phase drift',
      design: function (T, H, C) {
        const { vec3, float, sin, cos, smoothstep } = T;
        const g = C.p.mul(700);                           // ~9 mm gyroid period
        const ph = C.t.mul(0.2);                          // slow phase drift
        const v = sin(g.x.add(ph)).mul(cos(g.y))
          .add(sin(g.y.add(ph)).mul(cos(g.z)))
          .add(sin(g.z.add(ph)).mul(cos(g.x)));
        const iso = smoothstep(0.16, 0.03, v.abs());              // v == 0 sheet as thin line
        const iso2 = smoothstep(0.12, 0.03, v.abs().sub(1).abs()); // offset shells, dimmer
        return {
          albedo: vec3(0.03, 0.045, 0.06)                 // near-black slate
            .add(vec3(0.20, 0.80, 0.85).mul(iso))
            .add(vec3(0.50, 0.25, 0.75).mul(iso2).mul(0.35)),
          glow: vec3(0.12, 0.60, 0.70).mul(iso).mul(0.30)
        };
      }
    },
    {
      id: 'glitch-block',
      name: 'Glitch Block',
      note: 'hash-clocked block mosaic with row tears and rgb split',
      design: function (T, H, C) {
        const { vec2, vec3, float, mix, floor, step } = T;
        const frame = floor(C.t.mul(10));                 // 10 fps glitch clock
        const q0 = C.p.xy.mul(140);                       // ~7 mm blocks
        const row = floor(q0.y);
        const slip = step(0.90, H.hash(vec2(row, frame)));  // rare row tear
        const q = vec2(q0.x.add(slip.mul(H.hash(vec2(frame, row.add(5))).sub(0.5)).mul(5)), q0.y);
        const cell = floor(q);
        const h = H.hash(cell);
        const base = vec3(0.05, 0.06, 0.08).mul(float(0.6).add(h.mul(0.8)));   // dark mosaic
        const lit = step(0.93, H.hash(cell.add(11)));                          // sparse neon blocks
        const neon = mix(vec3(0.95, 0.10, 0.55), vec3(0.10, 0.90, 0.95), step(0.5, h));
        const tear = vec3(H.hash(cell.add(1)), h.mul(0.4), H.hash(cell.add(2)));  // rgb-split tint
        return {
          albedo: mix(mix(base, neon, lit), tear, slip.mul(0.8)),
          glow: neon.mul(lit).mul(0.22).add(tear.mul(slip).mul(0.15))
        };
      }
    },
    {
      id: 'halftone-dot',
      name: 'Halftone Dot',
      note: 'dot radius follows dot(vN,vV) so the mask self-shades in print',
      design: function (T, H, C) {
        const { vec2, vec3, float, mix, fract, dot, length, smoothstep } = T;
        const q0 = C.p.xy.mul(420);                       // ~2.4 mm screen pitch
        const a = 0.7854;                                 // 45 degree screen angle
        const q = vec2(q0.x.mul(Math.cos(a)).sub(q0.y.mul(Math.sin(a))),
                       q0.x.mul(Math.sin(a)).add(q0.y.mul(Math.cos(a))));
        const f = fract(q).sub(0.5);
        const shade = float(1).sub(dot(C.vN, C.vV).max(0));  // grazing surfaces print darker
        const r = float(0.18).add(shade.mul(0.36));          // dot radius carries the tone
        const dotk = smoothstep(r, r.sub(0.06), length(f));
        return { albedo: mix(vec3(0.91, 0.87, 0.78), vec3(0.13, 0.11, 0.10), dotk) };
      }
    },
    {
      id: 'blueprint-grid',
      name: 'Blueprint',
      note: 'cyanotype drafting grid, majors every 5 cells, dashed axes',
      design: function (T, H, C) {
        const { vec3, mix, fract, step, min, max, smoothstep } = T;
        const q = C.p.xy.mul(250);                        // ~4 mm minor cell
        const f = fract(q).sub(0.5).abs();
        const minor = smoothstep(0.44, 0.49, max(f.x, f.y));          // fine grid
        const g = fract(q.mul(0.2)).sub(0.5).abs();       // major line every 5 cells
        const major = smoothstep(0.468, 0.492, max(g.x, g.y));
        const dashX = step(0.5, fract(q.y.mul(0.25)));    // 8 mm dashes
        const dashY = step(0.5, fract(q.x.mul(0.25)));
        const centre = smoothstep(0.10, 0.03, q.x.abs()).mul(dashX)
          .add(smoothstep(0.10, 0.03, q.y.abs()).mul(dashY));         // dashed centrelines
        const ink = min(minor.mul(0.35).add(major.mul(0.8)).add(centre), 1);
        return {
          albedo: mix(vec3(0.05, 0.15, 0.38), vec3(0.88, 0.93, 1.0), ink),
          glow: vec3(0.4, 0.6, 1.0).mul(major).mul(0.03)
        };
      }
    },
    {
      id: 'binary-rain',
      name: 'Binary Rain',
      note: 'per-column falling glyph streams, cells rekey at the head',
      design: function (T, H, C) {
        const { vec2, vec3, float, floor, fract, step, pow } = T;
        const q = vec2(C.p.x.mul(300), C.p.y.mul(220));   // ~3 mm columns, squat glyph cells
        const col = floor(q.x);
        const y = q.y.add(C.t.mul(float(6).add(H.hash(vec2(col, 3)).mul(10))));  // per-column speed
        const cellY = floor(y);
        const fade = fract(H.hash(vec2(col, 7)).sub(cellY.mul(0.0625)));   // 16-cell stream
        const rekey = floor(C.t.mul(4)).mul(step(0.85, fade));             // flicker near the head
        const pix = floor(fract(vec2(q.x, y)).mul(vec2(3, 4)));            // 3x4 pseudo-glyph
        const px = step(0.45, H.hash(pix.add(vec2(col.mul(3.1), cellY.mul(7.7))).add(rekey.mul(0.317))))
          .mul(step(0.12, fract(q.x))).mul(step(0.15, fract(y)));          // glyph gutters
        const lit = px.mul(pow(fade, 2.2));
        const head = px.mul(step(0.93, fade));                             // whiter leading glyph
        return {
          albedo: vec3(0.01, 0.03, 0.015)
            .add(vec3(0.08, 0.80, 0.22).mul(lit))
            .add(vec3(0.50, 0.95, 0.55).mul(head).mul(0.7)),
          glow: vec3(0.08, 0.75, 0.18).mul(lit).mul(0.35)
            .add(vec3(0.25, 0.85, 0.30).mul(head).mul(0.15))
        };
      }
    }
  ];

  /* --------------------------------------------------------------- template */
  const TEMPLATE = [
    '/* Custom PulseMask design — TSL (runs on WebGPU and the WebGL2 fallback).',
    ' * C.p is object-space position in METRES: the shell is ~0.14 m wide, so',
    ' * multiply by 100–600 to get millimetre-scale features.',
    ' * Helpers: H.hash(vec2) H.noise(vec2) H.fbm(vec2) H.hexCell(vec2).',
    ' * C.albedo is the material base colour; C.n / C.vN / C.vV are normals and',
    ' * view direction; C.t is seconds. Return { albedo, glow } — glow is',
    ' * optional emissive (keep it small, the stage has no bloom).',
    ' *',
    ' * TSL is method-chained, not infix: a.mul(b).add(c), not a * b + c. */',
    'function design(T, H, C) {',
    '  const { vec3, float, mix, sin, smoothstep } = T;',
    '  const bands = smoothstep(0.85, 1.0, sin(C.p.y.mul(300).add(C.t)).abs());',
    '  return {',
    '    albedo: mix(C.albedo, vec3(0.10, 0.14, 0.10), bands.mul(0.8)),',
    '    glow: vec3(0.27, 1.0, 0.15).mul(bands).mul(0.15)',
    '  };',
    '}'
  ].join('\n');

  function get(id) {
    for (let i = 0; i < DESIGNS.length; i++) if (DESIGNS[i].id === id) return DESIGNS[i];
    return null;
  }
  function list() {
    return DESIGNS.map(function (d) { return { id: d.id, name: d.name, note: d.note }; });
  }
  /* The honesty contract: what the Lab prints is the function it runs. There is
     no separate source string that could drift from the graph. */
  function sourceOf(d) {
    return d && d.design ? d.design.toString() : '';
  }
  /* Light pre-flight for user TSL — real errors surface when the graph is built
     (a JS throw) or when the backend compiles it. */
  function validate(src) {
    if (!/function\s+design\s*\(|=>/.test(src)) {
      return 'body must define function design(T, H, C) — see the template';
    }
    if (!/return\b/.test(src)) return 'design must return { albedo, glow }';
    const open = (src.match(/{/g) || []).length, close = (src.match(/}/g) || []).length;
    if (open !== close) return 'unbalanced braces: ' + open + ' { vs ' + close + ' }';
    return null;
  }

  root.MaskShaderLab = {
    list: list, get: get, validate: validate, sourceOf: sourceOf,
    makeHelpers: makeHelpers, TEMPLATE: TEMPLATE
  };
})(typeof window !== 'undefined' ? window : this);
