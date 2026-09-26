#!/usr/bin/env node
/* Track B — dose-budget validation (validation/backlog.md, DB-06..DB-10, DB-38, DB-39).
 *
 *   node test/dose-budget.mjs            # exit 1 on any disagreement
 *   node test/dose-budget.mjs --print    # also dump the independent numbers per vector
 *
 * What this is: an INDEPENDENT re-implementation of the eight-line UV-C dose chain in
 * mask-geometry.js (the "engineering metrics" block), written from the physics rather than
 * by copying the code, and run against a versioned vector set (test/dose-budget-vectors.json)
 * whose expected values were derived by hand in validation/dose-budget/model-audit.md.
 *
 * Three things it checks that the golden snapshot cannot:
 *
 *   1. Dimensional consistency (DB-08). Every intermediate carries SI base-dimension
 *      exponents {m, s, J}. A unit slip (L/min read as m^3/s, cm^2 vs m^2, mW vs W) shows
 *      up as the wrong exponent vector on `dose`, not as a plausible-looking number.
 *   2. Domain (DB-09) and numerical (DB-39) behaviour. The independent calculator REJECTS
 *      non-finite, non-positive or out-of-domain inputs. The engine does not; what it emits
 *      for those inputs is recorded per vector as `engineObserved` and re-checked here, so
 *      a change in engine behaviour fails loudly and the DB-39 finding gets updated.
 *   3. Agreement between two implementations on shared vectors (DB-38), plus agreement of
 *      both with the hand-derived closed form  H = N*p*eta*rho*r / (2Q)  (DB-06).
 *
 * Honesty rules (AGENT_PLAYBOOK section 4): this file changes no constant, no label and no
 * threshold. If it disagrees with the engine, the disagreement is the finding.
 *
 * Ownership: new file under test/ (VALID territory). mask-geometry.js is read, never edited.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PRINT = process.argv.includes('--print');

/* ---------- load the engine exactly the way cli.mjs does ---------- */
const scope = {};
new Function('window', readFileSync(join(root, 'mask-geometry.js'), 'utf8'))(scope);
const { MaskGeometry } = scope;
const DEFAULTS = MaskGeometry.build({}).params;

/* ---------- dimensional quantities ----------
 * A quantity is a value plus SI base-dimension exponents. Only m, s and J are needed for the
 * dose chain. Prefix and non-SI units (L/min, cm, mW, mJ) are converted ONCE, at the input
 * boundary, so every line of the chain below is pure SI. */
const DIMS = ['m', 's', 'J'];
const q = (v, d = {}) => ({ v, d: Object.fromEntries(DIMS.map((k) => [k, d[k] || 0])) });
const mul = (a, b) => ({ v: a.v * b.v, d: Object.fromEntries(DIMS.map((k) => [k, a.d[k] + b.d[k]])) });
const div = (a, b) => ({ v: a.v / b.v, d: Object.fromEntries(DIMS.map((k) => [k, a.d[k] - b.d[k]])) });
const dimsOf = (x) => DIMS.map((k) => `${k}^${x.d[k]}`).join(' ');
function assertDims(x, expected, label) {
  for (const k of DIMS) {
    if (x.d[k] !== (expected[k] || 0)) {
      throw new Error(`DIMENSION ERROR in ${label}: got ${dimsOf(x)}, expected ${dimsOf(q(0, expected))}`);
    }
  }
}

/* ---------- input-boundary conversions (DB-07) ---------- */
const LPM_TO_M3S = 1e-3 / 60;     // 1 L/min = 1e-3 m^3 / 60 s
const MW_TO_W = 1e-3;
const CM2_PER_MJ_TO_M2_PER_J = 1e-4 / 1e-3; // cm^2/mJ -> m^2/J  (= 0.1)
const W_PER_M2_TO_MW_PER_CM2 = 1e3 / 1e4;   // = 0.1
const J_PER_M2_TO_MJ_PER_CM2 = 1e3 / 1e4;   // = 0.1

/* Constants the engine hard-codes. Named here, NOT changed (playbook section 4). */
const LED_COUPLING = 0.55;       // fraction of LED optical output that reaches the chamber
const RIN_FACTOR = 0.86;         // reactor inner radius as a fraction of canR
const ENGINE_LN10 = 2.303;       // the engine's constant; Math.LN10 = 2.302585...

/* Air at ~20 C, 1 atm — used only for the Reynolds-number warning (DB-14), not for dose. */
const AIR_RHO = 1.204;           // kg/m^3
const AIR_MU = 1.825e-5;         // Pa s

/* ---------- domain checks (DB-09) ---------- */
function validateInputs(P, range) {
  const errors = [];
  const warnings = [];
  const finite = (k) => Number.isFinite(P[k]);
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(finite('flowLpm') && P.flowLpm > 0, 'flowLpm must be > 0');
  need(finite('ledPower') && P.ledPower > 0, 'ledPower must be finite');
  need(Number.isInteger(P.ledCount) && P.ledCount >= 1, 'ledCount must be an integer >= 1');
  need(finite('reactorLen') && P.reactorLen > 0, 'reactorLen must be > 0');
  need(finite('canR') && P.canR > 0, 'canR must be > 0');
  need(finite('reflectance') && P.reflectance >= 1, 'reflectance (cavity gain) must be >= 1');
  need(finite('kUV') && P.kUV > 0, 'kUV must be > 0');

  for (const [k, [lo, hi]] of Object.entries(range)) {
    if (k in P && Number.isFinite(P[k]) && (P[k] < lo || P[k] > hi)) {
      warnings.push(`OUT_OF_DECLARED_RANGE: ${k}=${P[k]} outside [${lo}, ${hi}]`);
    }
  }
  return { errors, warnings };
}

/* ---------- the independent chain (DB-06) ---------- */
function independentDose(P, range) {
  const { errors, warnings } = validateInputs(P, range);
  if (errors.length) return { rejected: errors, warnings };

  const r = q(P.canR * RIN_FACTOR, { m: 1 });                       // inner radius
  const L = q(P.reactorLen, { m: 1 });                                // irradiated length
  const Q = q(P.flowLpm * LPM_TO_M3S, { m: 3, s: -1 });               // volumetric flow
  const N = q(P.ledCount);                                            // emitter count
  const p = q(P.ledPower * MW_TO_W, { J: 1, s: -1 });                 // optical power per LED
  const eta = q(LED_COUPLING);                                        // coupling fraction
  const rho = q(P.reflectance);                                       // cavity gain (dimensionless)
  const k = q(P.kUV * CM2_PER_MJ_TO_M2_PER_J, { m: 2, J: -1 });       // inactivation constant

  const A = mul(q(Math.PI), mul(r, r));            assertDims(A, { m: 2 }, 'cross-section');
  const v = div(Q, A);                             assertDims(v, { m: 1, s: -1 }, 'mean velocity');
  const tau = div(L, v);                           assertDims(tau, { s: 1 }, 'mean residence time');
  const wall = mul(q(2 * Math.PI), mul(r, L));     assertDims(wall, { m: 2 }, 'wall area');
  const Pc = mul(mul(N, p), mul(eta, rho));        assertDims(Pc, { J: 1, s: -1 }, 'coupled power');
  const E = div(Pc, wall);                         assertDims(E, { J: 1, s: -1, m: -2 }, 'wall irradiance');
  const H = mul(E, tau);                           assertDims(H, { J: 1, m: -2 }, 'fluence (dose)');
  const lrvExact = div(mul(H, k), q(Math.LN10));   assertDims(lrvExact, {}, 'log reduction');
  const lrvEngineConst = div(mul(H, k), q(ENGINE_LN10));

  /* Closed form, derived independently in model-audit.md section DB-06:
     H = N p eta rho r / (2 Q). Length cancels. */
  const closed = div(mul(Pc, r), mul(q(2), Q));    assertDims(closed, { J: 1, m: -2 }, 'closed form');

  /* DB-14: flow regime and the laminar-limit lower tail. Mean residence time is V/Q for any
     closed system, so the plug-flow dose IS the mean. What plug flow hides is the spread:
     in fully developed laminar pipe flow the centreline moves at 2x the mean, so the
     fastest path sees ~half the mean dose. */
  const D = 2 * r.v;
  const Re = (AIR_RHO * v.v * D) / AIR_MU;
  const regime = Re < 2300 ? 'laminar' : Re < 4000 ? 'transitional' : 'turbulent';
  const entryLengthM = 0.05 * Re * D;

  warnings.push(
    'MEAN_STATISTIC: dose is a volume-mean under plug flow and uniform wall irradiance; no lower-tail statistic is computed',
    `PLUG_FLOW_ASSUMED: Re=${Re.toFixed(0)} (${regime}); laminar entry length ${entryLengthM.toFixed(2)} m vs reactor ${L.v.toFixed(3)} m; laminar-limit fastest-path dose ~ ${(H.v * J_PER_M2_TO_MJ_PER_CM2 / 2).toFixed(4)} mJ/cm2`,
    'WALL_IRRADIANCE_AS_FLUENCE_RATE: E is mean irradiance on the wall; the in-volume fluence rate seen by an airborne particle is not computed',
    `GAIN_UNMEASURED: reflectance=${P.reflectance} is a cavity gain multiplier with no measured basis`,
    `K_UNSPECIFIED_ORGANISM: kUV=${P.kUV} cm2/mJ carries no organism, wavelength, matrix or assay reference in source`,
    `OPTICAL_POWER_NAMEPLATE: ledPower=${P.ledPower} mW is nameplate optical output, not measured`
  );

  return {
    dwellMS: tau.v * 1000,
    irradiance: E.v * W_PER_M2_TO_MW_PER_CM2,
    uvDose: H.v * J_PER_M2_TO_MJ_PER_CM2,
    uvDoseClosedForm: closed.v * J_PER_M2_TO_MJ_PER_CM2,
    lrv: lrvEngineConst.v,
    lrvExactLn10: lrvExact.v,
    reynolds: Re,
    regime,
    laminarFastestPathDose: (H.v * J_PER_M2_TO_MJ_PER_CM2) / 2,
    warnings
  };
}

/* ---------- run the vectors ---------- */
const vectorFile = JSON.parse(readFileSync(join(here, 'dose-budget-vectors.json'), 'utf8'));
const decode = (x) => (x === 'NaN' ? NaN : x === 'Infinity' ? Infinity : x === '-Infinity' ? -Infinity : x);
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || a === b;
const relClose = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);

let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };
const pass = (msg) => console.log('  ✓ ' + msg);

console.log('\nDose-budget validation · ' + vectorFile.vectors.length + ' vectors (schema ' + vectorFile.$schema + ')');

for (const vec of vectorFile.vectors) {
  const params = Object.fromEntries(Object.entries(vec.params).map(([k, v]) => [k, decode(v)]));
  const P = { ...DEFAULTS, ...params };
  console.log(`\n[${vec.id}] ${vec.case}`);

  const engine = MaskGeometry.build(params).metrics;
  const ind = independentDose(P, vectorFile.operatingRange);

  if (vec.case === 'invalid') {
    if (!ind.rejected) fail(`independent calculator ACCEPTED invalid input ${JSON.stringify(vec.params)}`);
    else if (!ind.rejected.includes(vec.reject)) fail(`rejected for the wrong reason: ${ind.rejected.join('; ')} (expected "${vec.reject}")`);
    else pass(`independent rejects: ${vec.reject}`);

    for (const [k, expected] of Object.entries(vec.engineObserved)) {
      const exp = decode(expected);
      const got = engine[k];
      const ok = typeof exp === 'number' && Number.isFinite(exp) ? relClose(got, exp, 1e-4) : same(got, exp);
      if (ok) pass(`engine still emits ${k}=${got} for this input (DB-39 finding unchanged)`);
      else fail(`engine behaviour CHANGED: ${k}=${got}, finding recorded ${exp} — update DB-39 in model-audit.md`);
    }
    continue;
  }

  if (ind.rejected) { fail(`independent calculator rejected a valid vector: ${ind.rejected.join('; ')}`); continue; }

  for (const k of ['dwellMS', 'irradiance', 'uvDose', 'lrv']) {
    if (relClose(ind[k], engine[k], 1e-9)) pass(`${k}: independent ${ind[k].toFixed(6)} = engine ${engine[k].toFixed(6)}`);
    else fail(`${k}: independent ${ind[k]} vs engine ${engine[k]} (DB-38 disagreement)`);
    if (!relClose(ind[k], vec.hand[k], 1e-3)) fail(`${k}: independent ${ind[k]} vs HAND ${vec.hand[k]} (DB-10 hand derivation disagrees)`);
  }
  if (relClose(ind.uvDose, ind.uvDoseClosedForm, 1e-12)) pass(`closed form N p eta rho r / 2Q agrees: ${ind.uvDoseClosedForm.toFixed(6)}`);
  else fail(`closed form ${ind.uvDoseClosedForm} != chain ${ind.uvDose}`);

  if (PRINT) {
    console.log('    Re=' + ind.reynolds.toFixed(0) + ' (' + ind.regime + '), lrv with exact ln10=' + ind.lrvExactLn10.toFixed(6) +
      ', laminar fastest-path dose=' + ind.laminarFastestPathDose.toFixed(6));
    for (const w of ind.warnings) console.log('    ! ' + w);
  }
}

/* ---------- DB-06 consistency of the published target with the published k ---------- */
console.log('\n[target-vs-k] 3.0 mJ/cm2 "2-log target" against kUV=' + DEFAULTS.kUV);
const lrvAtTarget = (3.0 * DEFAULTS.kUV) / Math.LN10;
const doseForTwoLog = (2 * Math.LN10) / DEFAULTS.kUV;
console.log(`  LRV at 3.0 mJ/cm2 = ${lrvAtTarget.toFixed(3)}; dose for 2-log at k=${DEFAULTS.kUV} = ${doseForTwoLog.toFixed(3)} mJ/cm2`);
if (lrvAtTarget < 2) console.log('  ! published target and published k are not mutually consistent (finding DB-06.4; no constant changed)');

/* ---------- a dimension slip must be caught, not produce a number ---------- */
try {
  const bad = mul(q(1, { m: 1 }), q(1, { s: 1 }));
  assertDims(bad, { m: 1 }, 'self-test');
  fail('dimension checker did not catch a deliberate slip');
} catch (e) {
  if (/DIMENSION ERROR/.test(e.message)) pass('dimension checker catches a deliberate m*s slip'); else throw e;
}

console.log(failures ? `\n✗ ${failures} failure(s)\n` : '\n✓ all dose-budget checks pass\n');
process.exit(failures ? 1 : 0);
