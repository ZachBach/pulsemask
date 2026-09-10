#!/usr/bin/env node
/* Golden-snapshot regression test for the geometry engine and the CLI seam.
 *
 *   node test/golden-metrics.mjs            # compare current output to the committed
 *                                            # snapshots, exit 1 on any drift
 *   node test/golden-metrics.mjs --update    # regenerate both snapshot files
 *
 * AGENT_PLAYBOOK.md §5/§10 day 1: this is the safety net that has to exist before any
 * agent refactors mask-geometry.js or cli.mjs. Without it, a change that silently
 * shifts the mesh or the engineering numbers (dose, dead space, runtime, ...) ships
 * quietly. With it, the same change fails loudly and has to be explained in the PR body
 * before the snapshot is allowed to move (§7's golden-metrics gate).
 *
 * Two layers, deliberately kept separate along the §2 ownership line:
 *
 *   1. golden-cli-output.txt — the verbatim stdout of `node cli.mjs --metrics-only`,
 *      zero flags. This is literally what the playbook names. It is a black-box check:
 *      this file never re-implements cli.mjs's flag parsing or its ipd->faceWidth /
 *      led-density->count derivation, so it can never drift out of sync with cli.mjs
 *      the way a re-implementation could. It also happens to protect the report
 *      formatting cli.mjs prints, which the other layer can't see at all.
 *
 *   2. golden-metrics.json — MaskGeometry.build({}) called directly against the engine's
 *      own DEFAULTS (mask-geometry.js's "default params", not cli.mjs's derived ones —
 *      cli.mjs's zero-arg run actually asks for 17 LEDs via its density flag, not
 *      DEFAULTS.ledCount's 16). This is the structural net: exact triangle count and
 *      vertex count per part, the whole-mesh bounding box, every metric field
 *      unrounded-but-for-float-noise, and the Track 4 manifold verdict. None of this is
 *      visible in the CLI's rounded printed report, and it's squarely mask-geometry.js —
 *      VALID's own territory per §2 — so it stays independent of whatever CLI does with
 *      its flags.
 *
 * Both load MaskGeometry the way cli.mjs does — a plain IIFE handed a bare object via
 * new Function — so layer 2 stays honest about the "imports nothing, touches no DOM"
 * invariant instead of reaching for a require/import shortcut that would only work here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const jsonSnapshotPath = join(here, 'golden-metrics.json');
const cliSnapshotPath = join(here, 'golden-cli-output.txt');
const UPDATE = process.argv.includes('--update');

const round = (n, d = 6) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/* ---------- layer 1: cli.mjs --metrics-only, verbatim ---------- */

function runCLIMetricsOnly() {
  return execFileSync(process.execPath, [join(root, 'cli.mjs'), '--metrics-only'], {
    encoding: 'utf8', cwd: root
  }).replace(/\r\n/g, '\n');
}

/* ---------- layer 2: the engine's own defaults ---------- */

const scope = {};
new Function('window', readFileSync(join(root, 'mask-geometry.js'), 'utf8'))(scope);
const { MaskGeometry } = scope;

function buildEngineSnapshot() {
  const res = MaskGeometry.build({});
  const v = MaskGeometry.validate(res.parts);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of res.parts) {
    const pos = part.positions;
    for (let i = 0; i < pos.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const c = pos[i + a];
        if (c < min[a]) min[a] = c;
        if (c > max[a]) max[a] = c;
      }
    }
  }

  const metrics = {};
  for (const [k, val] of Object.entries(res.metrics)) {
    metrics[k] = typeof val === 'number' && !Number.isInteger(val) ? round(val, 6) : val;
  }

  const parts = res.parts.map((p) => ({
    name: p.name,
    triangles: p.indices.length / 3,
    vertices: p.positions.length / 3
  }));

  return {
    metrics,
    bboxMeters: { min: min.map((n) => round(n, 8)), max: max.map((n) => round(n, 8)) },
    parts,
    validate: { ok: v.ok, failed: v.failed }
  };
}

/* ---------- run both ---------- */

const cliOutput = runCLIMetricsOnly();
const engineSnapshot = buildEngineSnapshot();

if (UPDATE) {
  writeFileSync(cliSnapshotPath, cliOutput);
  writeFileSync(jsonSnapshotPath, JSON.stringify(engineSnapshot, null, 2) + '\n');
  console.log(`wrote ${cliSnapshotPath}`);
  console.log(`wrote ${jsonSnapshotPath}`);
  process.exit(0);
}

let ok = true;

/* --- compare layer 1, line by line --- */
let goldenCLI;
try {
  goldenCLI = readFileSync(cliSnapshotPath, 'utf8').replace(/\r\n/g, '\n');
} catch {
  console.error(`\n✗ no golden CLI snapshot at ${cliSnapshotPath}`);
  console.error(`  run: node test/golden-metrics.mjs --update\n`);
  process.exit(1);
}
if (goldenCLI !== cliOutput) {
  ok = false;
  const a = goldenCLI.split('\n'), b = cliOutput.split('\n');
  console.error(`\n✗ \`node cli.mjs --metrics-only\` output drifted from ${cliSnapshotPath}\n`);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      console.error(`  line ${i + 1}:`);
      console.error(`    was: ${a[i] ?? '(missing)'}`);
      console.error(`    now: ${b[i] ?? '(missing)'}`);
    }
  }
}

/* --- compare layer 2, dotted-path diff --- */
let goldenEngine;
try {
  goldenEngine = JSON.parse(readFileSync(jsonSnapshotPath, 'utf8'));
} catch {
  console.error(`\n✗ no golden engine snapshot at ${jsonSnapshotPath}`);
  console.error(`  run: node test/golden-metrics.mjs --update\n`);
  process.exit(1);
}

function diff(a, b, path, out) {
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diff(a[k], b[k], path ? `${path}.${k}` : k, out);
    return;
  }
  if (a !== b) out.push({ path, was: a, now: b });
}

const changes = [];
diff(goldenEngine, engineSnapshot, '', changes);
if (changes.length > 0) {
  ok = false;
  console.error(`\n✗ ${changes.length} drift(s) from ${jsonSnapshotPath}\n`);
  for (const c of changes) {
    const pct = typeof c.was === 'number' && typeof c.now === 'number' && c.was !== 0
      ? `  (${(((c.now - c.was) / Math.abs(c.was)) * 100).toFixed(1)}%)`
      : '';
    console.error(`  ${c.path}: ${JSON.stringify(c.was)} -> ${JSON.stringify(c.now)}${pct}`);
  }
}

if (!ok) {
  console.error(`\n  If this is an intended change, explain it in the PR body (AGENT_PLAYBOOK.md §7`);
  console.error(`  golden-metrics gate) and then run:`);
  console.error(`    node test/golden-metrics.mjs --update\n`);
  process.exit(1);
}

console.log(`✓ golden CLI output matches (${cliOutput.trim().split('\n').length} lines)`);
console.log(`✓ golden engine metrics match (${engineSnapshot.parts.length} parts, ${engineSnapshot.metrics.triangles} triangles)`);
