#!/usr/bin/env node
/* PulseMask headless generator.
 *
 *   node cli.mjs --ipd 63 -o export/mask.stl
 *   node cli.mjs --ipd 68 --reactor 96 --leds 12 --flow 45 --metrics-only
 *
 * Proves the seam: mask-geometry.js has no DOM and no three.js dependency, so
 * the exact geometry the browser shows is reproducible from a terminal. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/* mask-geometry.js is a plain IIFE that attaches to whatever global it is
   handed. Give it a bare object and take MaskGeometry back out. */
const scope = {};
new Function('window', readFileSync(join(here, 'mask-geometry.js'), 'utf8'))(scope);
const { MaskGeometry } = scope;

const FLAGS = {
  ipd:      { key: null,          help: 'interpupillary distance, mm (drives face scale)' },
  width:    { key: 'faceWidth',   help: 'bizygomatic width, mm' },
  height:   { key: 'faceHeight',  help: 'nasion to menton, mm' },
  reactor:  { key: 'reactorLen',  help: 'UV-C chamber length, mm' },
  leds:     { key: null,          help: 'LED density per 10 mm of reactor' },
  power:    { key: 'ledPower',    help: 'optical mW per LED' },
  flow:     { key: 'flowLpm',     help: 'design peak flow, L/min' },
  refl:     { key: 'reflectance', help: 'labyrinth fluence gain' },
  wall:     { key: 'wall',        help: 'shell wall, mm' },
  plenum:   { key: 'plenum',      help: 'breathing plenum, mm' },
};
const MM = new Set(['faceWidth', 'faceHeight', 'reactorLen', 'wall', 'plenum']);

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) {
  console.log('\nPulseMask headless generator\n');
  console.log('  -o, --out <path>     output .stl (default export/mask.stl)');
  console.log('      --metrics-only   print the engineering readout, write nothing');
  console.log('      --no-face        omit the reconstructed face form (default: omitted)');
  console.log('      --with-face      include the face form in the STL');
  for (const [f, d] of Object.entries(FLAGS)) console.log(`      --${f.padEnd(15)}${d.help}`);
  console.log('');
  process.exit(0);
}

const arg = (name, dflt) => {
  /* single-letter names also accept the documented short form (-o) */
  for (const t of name.length === 1 ? ['--' + name, '-' + name] : ['--' + name]) {
    const i = argv.indexOf(t);
    if (i >= 0 && argv[i + 1]) return argv[i + 1];
  }
  return dflt;
};
const has = (name) => argv.includes('--' + name);

const opts = {};
for (const [flag, def] of Object.entries(FLAGS)) {
  const v = arg(flag, null);
  if (v === null || !def.key) continue;
  opts[def.key] = MM.has(def.key) ? parseFloat(v) / 1000 : parseFloat(v);
}

/* IPD is the one real-world measurement; derive face scale from it the same
   way the browser landmark step does. Explicit --width/--height still win. */
const ipd = parseFloat(arg('ipd', '0'));
if (ipd > 0) {
  if (opts.faceWidth === undefined) {
    opts.faceWidth = Math.min(0.168, Math.max(0.118, (ipd * 2.22) / 1000));
  }
}

/* LED density -> absolute count, matching the UI. */
const density = parseFloat(arg('leds', '6'));
const reactorMM = (opts.reactorLen !== undefined ? opts.reactorLen * 1000 : 28);
opts.ledCount = Math.max(4, Math.round(density * reactorMM / 10));

const res = MaskGeometry.build(opts);
const m = res.metrics;

const row = (k, v) => console.log('  ' + k.padEnd(22) + v);
console.log('\nPulseMask · generated geometry');
row('face', `${m.faceWidthMM.toFixed(0)} × ${m.faceHeightMM.toFixed(0)} mm · rim ${m.rimLengthMM.toFixed(0)} mm`);
row('shell', `${m.shellMassG.toFixed(0)} g · ${m.shellVolumeCM3.toFixed(1)} cm³ PA12`);
row('dead space', `${m.deadSpaceML.toFixed(0)} mL`);
row('bead compression', `${m.beadCompMM.toFixed(2)} mm`);
row('UV-C dose', `${m.uvDose.toFixed(2)} mJ/cm² (${(m.uvDose / 3 * 100).toFixed(0)}% of 3.0 target)`);
row('log reduction', `${m.lrv.toFixed(2)} LRV · ${m.ledTotal} LEDs · dwell ${m.dwellMS.toFixed(1)} ms`);
row('solar', `${m.pvWatts.toFixed(2)} W peak vs ${m.loadW.toFixed(2)} W load`);
row('runtime', `${m.runtimeH.toFixed(1)} h · ${m.runtimeSolarH.toFixed(1)} h solar · ${m.runtimeDutyH.toFixed(1)} h gated`);
row('mesh', `${res.parts.length} parts · ${(m.triangles / 1000).toFixed(1)}k triangles`);

if (m.uvDose < 3) {
  console.log('\n  ⚠ dose is below the 2-log target. Length alone will not fix this —');
  console.log('    dose ≈ P·η·ρ·r / 2Q, so raise --leds, --power, --refl, or drop --flow.');
}

if (has('metrics-only')) { console.log(''); process.exit(0); }

const keep = has('with-face') && !has('no-face')
  ? res.parts
  : res.parts.filter((p) => p.name !== 'face_form');
const out = resolve(here, arg('out', arg('o', 'export/mask.stl')));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(MaskGeometry.toSTL(keep)));

const tris = keep.reduce((a, p) => a + p.indices.length / 3, 0);
console.log(`\n  → ${out}`);
console.log(`    ${keep.length} parts · ${tris.toLocaleString()} triangles · millimetres\n`);
