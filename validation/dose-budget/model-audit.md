# Dose-budget validation — model audit (DB-06 to DB-15, DB-38, DB-39)

Track B of `validation/backlog.md`. Every finding here is about the model at commit
`0605893`. **No constant, label, threshold or equation was changed** (AGENT_PLAYBOOK §4).
Where a change is warranted it is filed as a request to the file's owner in
`README.md` and, if it touches claims wording, routed to the human gate.

Executable companion: `node test/dose-budget.mjs` (add `--print` for the per-vector
warnings). All checks pass at the baseline revision.

---

## DB-06 — Independent derivation, compared term by term

Derived from the physics, then compared with the code.

Mean residence time in any closed flow system is volume over flow:

    τ = V / Q = π r² L / Q

Total optical power reaching the chamber, spread uniformly over the cylindrical wall:

    P_c = N · p · η · ρ
    E   = P_c / (2 π r L)

Fluence delivered to a parcel that spends τ in that field:

    H = E · τ = N p η ρ · π r² L / (2 π r L · Q) = N p η ρ r / (2 Q)

First-order (single-hit) inactivation:

    N/N₀ = e^(−k H)      ⇒      LRV = k H / ln 10

| Term | Code (`mask-geometry.js`) | Derivation | Agree? |
| --- | --- | --- | --- |
| r | `P.canR * 0.86` | design value, geometry | ✓ |
| Q | `P.flowLpm / 60000` | 1 L/min = 1e-3 m³ / 60 s = 1/60000 m³/s | ✓ |
| v̄ | `Q / (π rIn²)` | Q / A | ✓ |
| τ | `reactorLen / vAir` | L / v̄ = V / Q | ✓ |
| S | `2π (rIn·100)(reactorLen·100)` | 2π r L, in cm² | ✓ |
| P_c | `ledCount · ledPower · 0.55 · reflectance` | N p η ρ, in mW | ✓ |
| E | `P_c / wallCm2` | P_c / S, mW/cm² | ✓ |
| H | `irr · dwell` | E τ, mW/cm² · s = mJ/cm² | ✓ |
| LRV | `dose · kUV / 2.303` | k H / ln 10 | ✓ (2.303 ≈ 2.302585) |

The chain and the closed form agree to 1e-12 on every valid vector, and the engine
agrees with the independent implementation to 1e-9. The arithmetic is right. The
findings are about what the arithmetic means.

**Findings**

- **6.1 `reflectance` is a gain, not a reflectance.** Its range is 1–6 and it
  multiplies power. A reflectance is a fraction in [0, 1]. If the intent is the
  fluence gain of a diffuse cavity with wall reflectance R, the relation is
  gain ≈ 1/(1−R), so 2.6 corresponds to R ≈ 0.62. The name misleads any reader who
  checks the number against a material datasheet. Terminology only; value untouched.
  Owner: GEO (ADR, since it is a `build()` param name) + DOC.
- **6.2 E is a bookkeeping mean, not the fluence rate a particle sees.** Dividing
  coupled power by wall area gives the mean irradiance *on the wall*. An airborne
  particle in the volume is exposed to the fluence rate from all directions, which for a
  reflective cavity is neither equal to nor simply proportional to the wall irradiance.
  Without a ray-trace or a measured map (DB-20, DB-31) the sign of the error is
  unknown; do not assume it is conservative.
- **6.3 The coupling wording is inverted relative to the code.** The code multiplies by
  0.55, i.e. 55% of LED output *reaches* the chamber and 45% is lost. `index.html:504`
  and `mission.html:561` say "55% LED-to-chamber coupling loss". One of the two is
  wrong; the code is the model of record, so the text should read "45% coupling loss
  (55% coupled)". Claims wording → human gate. Owner: APP, DOC.
- **6.4 The published 3.0 mJ/cm² target and the published k are not consistent with
  each other.** With k = 1.2 cm²/mJ, LRV at 3.0 mJ/cm² is 3.0 × 1.2 / ln 10 = **1.56**,
  not 2. A 2-log reduction at that k needs 2 ln 10 / 1.2 = **3.84 mJ/cm²**. Every
  "3.0 for 2-log" statement in the DB-03 inventory (CLI, metrics card, mission page,
  README, CITATION.cff, HANDOFF, playbook) therefore quotes a target that the model's
  own kinetics do not reach at that dose. Either k or the target has a different
  provenance from the other. Nothing was changed; per playbook §4 the fix is an issue
  with a citation (DB-44 / DB-45 will source it). Until resolved, "7% of target" is
  itself an unvalidated figure.
- **6.5 `2.303` should be `Math.LN10`.** The approximation makes LRV 0.018% high.
  Immaterial to any conclusion; worth a one-token fix so the constant is exact.
  Owner: GEO.
- **6.6 `index.html:1069` re-implements the kinetics with a literal `1.2`** in
  `1 − exp(−uvDose·1.2)` instead of reading `params.kUV`. Today the two agree because
  `kUV` is not exposed in the UI; the moment it is, the "% single-pass inactivation"
  note and the LRV card diverge silently. Owner: APP.
- **6.7 Length invariance confirmed.** Vector `length-invariance-120mm-16-leds` gives
  the same 0.204176 mJ/cm² at 120 mm as at 28 mm. `HANDOFF.md §8.1` is right that
  length alone buys nothing; the UI's density slider is the correct control.

## DB-07 — Unit conversion audit

Each conversion the chain performs, with a hand-checkable case (nominal, 16 LEDs):

| Conversion | Factor | Hand check |
| --- | --- | --- |
| L/min → m³/s | × 1e-3 / 60 | 85 → 1.416667e-3 m³/s |
| m → cm (radius) | × 100 | 0.0245 × 0.86 = 0.02107 m → 2.107 cm |
| m → cm (length) | × 100 | 0.028 m → 2.8 cm |
| wall area | 2π r L | 2π × 2.107 × 2.8 = 37.068 cm² |
| cross-section | π r² | π × 0.02107² = 1.394695e-3 m² |
| velocity | Q / A | 1.416667e-3 / 1.394695e-3 = 1.015753 m/s |
| residence time, s → ms | × 1000 | 0.028 / 1.015753 = 0.0275657 s → 27.5657 ms |
| coupled power | N p η ρ | 16 × 12 × 0.55 × 2.6 = 274.56 mW |
| irradiance | mW / cm² | 274.56 / 37.068 = 7.4069 mW/cm² |
| fluence | mW/cm² × s = mJ/cm² | 7.4069 × 0.0275657 = 0.20418 mJ/cm² |
| closed form | N p η ρ r / 2Q, cgs | 274.56 × 2.107 / (2 × 1416.67 cm³/s) = 0.20418 mJ/cm² |
| LRV | cm²/mJ × mJ/cm² / ln 10 | 0.20418 × 1.2 / 2.303 = 0.10639 |

All twelve match the engine to the printed precision. In `test/dose-budget.mjs` every
non-SI unit is converted once at the input boundary and the chain runs in pure SI, so
none of these factors appears mid-chain.

## DB-08 — Dimensional consistency

The independent calculator carries base-dimension exponents {m, s, J} on every quantity
and asserts them at each step:

| Quantity | Required dimensions | Result |
| --- | --- | --- |
| cross-section | m² | ✓ |
| mean velocity | m s⁻¹ | ✓ |
| residence time | s | ✓ |
| wall area | m² | ✓ |
| coupled power | J s⁻¹ | ✓ |
| wall irradiance | J s⁻¹ m⁻² | ✓ |
| fluence | J m⁻² | ✓ |
| log reduction | dimensionless | ✓ |
| closed form | J m⁻² | ✓ |

A self-test confirms that a deliberate m × s slip throws `DIMENSION ERROR` rather than
producing a number. The engine itself performs no such check and mixes m and cm inside
the block (`rIn * 100`, `reactorLen * 100`), which is where a future slip would hide.

## DB-09 — Sign, range and domain checks

| Parameter | Reject (independent calc) | Warn if outside declared range | Engine today | UI today | CLI today |
| --- | --- | --- | --- | --- | --- |
| `flowLpm` | not finite, ≤ 0 | 30–120 | no check | slider clamps 30–120 | `parseFloat`, accepts 0 and negatives |
| `ledPower` | not finite, ≤ 0 | 4–30 | no check | clamps 4–30 | accepts anything |
| `ledCount` | non-integer, < 1 | density 2–14 per 10 mm | no check | derived, floor 4 | derived, floor 4 |
| `reactorLen` | not finite, ≤ 0 | 0.018–0.120 m | no check | clamps 18–120 mm | accepts 0 |
| `canR` | not finite, ≤ 0 | fixed | no check | not exposed | not exposed |
| `reflectance` | not finite, < 1 | 1–6 | no check | clamps 1–6 | accepts anything |
| `kUV` | not finite, ≤ 0 | not exposed | no check | not exposed | not exposed |

The gain floor of 1 encodes "direct illumination only"; below 1 the cavity would be
absorbing more than it receives. Rejection means the calculator returns a reason instead
of a number. Requests: GEO to guard or document engine behaviour; CLI to validate flags.

## DB-10 — Golden calculations

`test/dose-budget-vectors.json` version 1. "Hand" values are derived above (nominal in
full; the others by the exact scaling relations of the closed form). Run result at
`0605893`: **all pass**.

| Vector | Params | Hand dose (mJ/cm²) | Engine | Note |
| --- | --- | --- | --- | --- |
| nominal-engine-defaults | {} | 0.20418 | 0.204176 | |
| nominal-cli-17-leds | ledCount 17 | 0.21694 | 0.216937 | × 17/16 |
| max-flow-120 | flowLpm 120 | 0.14462 | 0.144624 | × 85/120 |
| min-flow-30 | flowLpm 30 | 0.57850 | 0.578498 | × 85/30 |
| length-invariance | reactorLen 0.120, ledCount 16 | 0.20418 | 0.204176 | L cancels |
| max-length-at-default-density | reactorLen 0.120, ledCount 72 | 0.91879 | 0.918791 | × 72/16 |
| zero-flow | flowLpm 0 | reject | Infinity | DB-39 |
| negative-flow | flowLpm −85 | reject | −0.204176 | DB-39 |
| nan-led-power | ledPower NaN | reject | NaN | DB-39 |
| zero-leds | ledCount 0 | reject | 0 | DB-39 |
| sub-unity-gain | reflectance 0.5 | reject | 0.039265 | DB-39 |
| zero-reactor-length | reactorLen 0 | reject | NaN (irradiance ∞ × dwell 0) | DB-39 |

## DB-11 — Assumptions that turn averages into a "delivered dose"

| # | Assumption | Where it lives | Evidence in repo | Closes with |
| --- | --- | --- | --- | --- |
| A1 | Plug flow: every parcel spends exactly τ = V/Q | `index.html:504` | none | DB-25, DB-26 |
| A2 | Wall irradiance uniform along length and around circumference | implicit in `P_c / S` | none | DB-20 |
| A3 | Wall irradiance equals the fluence rate experienced in the volume | implicit | none | DB-20, DB-31 |
| A4 | η = 0.55 of LED optical output enters the chamber | `mask-geometry.js:1144` | listed as "empirical or conventional", no citation | DB-18, DB-23 |
| A5 | ρ = 2.6 cavity gain | `mask-geometry.js:470` | none | DB-21, DB-22 |
| A6 | p = 12 mW optical per LED | `HANDOFF.md:98` | nameplate, not measured | DB-18, DB-19 |
| A7 | k = 1.2 cm²/mJ, "enveloped RNA virus at 265–280 nm" | `index.html:503` | no citation, no organism, no assay | DB-44, DB-45 |
| A8 | Single-hit exponential kinetics, no shoulder, no tailing | `index.html:502` | conventional | DB-44 |
| A9 | 3.0 mJ/cm² delivers 2-log | CLI, cards, mission, README, CITATION | inconsistent with A7 (finding 6.4) | DB-45 |
| A10 | Inner radius = 0.86 · canR matches the printed part | `mask-geometry.js:1139` | design value | DB-21 |
| A11 | No optical losses: window, filter media, contamination, ageing, temperature | not modelled | none | DB-23, DB-28 |
| A12 | Steady flow at the 85 L/min design peak; breathing is oscillatory and the blower copy (`index.html:1187`) claims the device sets dwell | `flowLpm` | none | DB-24, DB-29 (fixture only, never a wearer) |
| A13 | Single pass, no recirculation credit | implicit | conservative direction | — |
| A14 | 35% wall-plug efficiency in `loadW` (RF territory, not dose) | `mask-geometry.js:1148` | none; optimistic for 265–280 nm LEDs | flagged to RF only |

## DB-12 — Terminology

Definitions the track uses from here on (IUVA / radiometry convention):

| Term | Symbol | Unit | Meaning |
| --- | --- | --- | --- |
| Incident irradiance | E | mW/cm² | radiant power per unit area arriving *on a surface* |
| Fluence rate | E₀ | mW/cm² | radiant power per unit area from *all directions* at a point in the volume — what a suspended particle experiences |
| Exposure time | t | s | time a parcel spends in the field |
| Fluence ("UV dose") | H | mJ/cm² | E₀ integrated over the exposure, H = ∫E₀ dt |

Current labels against those definitions:

| Surface label | What the number actually is | Verdict |
| --- | --- | --- |
| `irradiance`, "mean wall irradiance" (`index.html:1072`) | mean incident irradiance on the wall | correct |
| `uvDose`, "UV-C dose" | plug-flow *mean* fluence, computed from wall irradiance as if it were the fluence rate | needs the qualifier "modelled mean, plug flow" |
| `dwellMS`, "Reactor dwell" | mean residence time V/Q | correct; "mean" should be explicit |
| "Log reduction", "single-pass inactivation" | first-order kinetics at an unreferenced k | needs "modelled" and the organism qualifier |

Proposed relabels are wording changes on claim-bearing surfaces → human gate.

## DB-13 — Which statistic the reported dose is

The reported dose is the **volume mean under plug flow and uniform irradiance**: one
number, one path, mean residence time × mean wall irradiance. It is not a minimum, not
a percentile, and not a distribution.

`index.html:505` says "treat the figure as an upper bound". As stated that is not right
for the mean: mean residence time is V/Q for *any* residence-time distribution, so the
plug-flow figure *is* the mean dose. It is an upper bound only for the fastest path
through the reactor, which is the statistic that matters for a protective claim and is
not computed. Recommended label: "modelled mean (plug flow)", with a lower-tail line
added once DB-25 / DB-34 produce one. Until then, the laminar-limit estimate in DB-14
is the only bound available, and it is a bound, not a measurement.

## DB-14 — Does a single dwell time represent the residence-time distribution?

No. Quantified at the baseline geometry (r = 21.07 mm, D = 42.1 mm, air at 20 °C):

| Flow (L/min) | v̄ (m/s) | Re | Regime | Laminar entry length (0.05·Re·D) | Fastest-path dose, laminar limit |
| --- | --- | --- | --- | --- | --- |
| 30 | 0.359 | 997 | laminar | 2.1 m | 0.289 mJ/cm² (½ of mean 0.578) |
| 85 | 1.016 | 2824 | transitional | 5.95 m | 0.102 mJ/cm² (½ of mean 0.204) |
| 120 | 1.434 | 3987 | transitional | 8.4 m | 0.072 mJ/cm² (½ of mean 0.145) |

- The reactor (28–120 mm) is far shorter than the entry length, so the profile never
  develops: the core moves as a plug with thin boundary layers and the distribution is
  set by the inlet, the filter cartridge and the blower, none of which the model sees.
- In the fully developed laminar limit the centreline runs at 2 × v̄, so the fastest
  parcel receives half the mean dose. That is the only analytic bound available and it
  is optimistic: jets, bypass and recirculation (DB-27) can be worse.
- At 85 L/min the flow sits in the transitional band where the RTD is least
  predictable and most sensitive to inlet geometry.

Conclusion: the single dwell estimate is a defensible *mean* and a poor stand-in for
the distribution. It cannot bound the minimum dose from the model alone; DB-25
(tracer RTD) is required before any lower-tail statistic is quoted.

## DB-15 — Explicit model warnings

Implemented in the independent calculator (`test/dose-budget.mjs --print`), emitted
with every result:

| Code | Text |
| --- | --- |
| `MEAN_STATISTIC` | dose is a volume-mean under plug flow and uniform wall irradiance; no lower-tail statistic is computed |
| `PLUG_FLOW_ASSUMED` | Re and regime, entry length vs reactor length, laminar-limit fastest-path dose |
| `WALL_IRRADIANCE_AS_FLUENCE_RATE` | E is mean irradiance on the wall; the in-volume fluence rate is not computed |
| `GAIN_UNMEASURED` | reflectance gain has no measured basis |
| `K_UNSPECIFIED_ORGANISM` | kUV carries no organism, wavelength, matrix or assay reference |
| `OPTICAL_POWER_NAMEPLATE` | ledPower is nameplate optical output, not measured |
| `OUT_OF_DECLARED_RANGE:<param>` | input outside the HANDOFF / slider range |

Requested for the product surfaces (owners CLI and APP; wording → human gate): print
the same six lines under the CLI readout, and add one line under the three metrics
cards: "Modelled mean under plug flow; inputs are nameplate and assumed, none measured."

## DB-38 — Independent implementations on a shared vector set

Done ahead of DB-16..37 (reorder reason: purely computational, shares the test file
with DB-10; no laboratory dependency). Two implementations — the engine and
`test/dose-budget.mjs` — agree on all six valid vectors to 1e-9 relative, and both agree
with the closed form to 1e-12 and the hand values to 1e-3. Vector set: version 1,
frozen against `0605893`.

## DB-39 — Numerical behaviour at extremes

Done ahead of order for the same reason. The engine emits, without error:

| Input | `dwellMS` | `irradiance` | `uvDose` | `lrv` |
| --- | --- | --- | --- | --- |
| `flowLpm: 0` | ∞ | 7.41 | ∞ | ∞ |
| `flowLpm: −85` | −27.6 | 7.41 | −0.204 | −0.106 |
| `ledPower: NaN` | 27.6 | NaN | NaN | NaN |
| `ledCount: 0` | 27.6 | 0 | 0 | 0 |
| `reflectance: 0.5` | 27.6 | 1.42 | 0.039 | 0.020 |
| `reactorLen: 0` | 0 | ∞ | NaN | NaN |

The UI's sliders and the CLI's density floor prevent most of these in practice, but the
CLI accepts `--flow 0`, `--flow -85`, `--power abc` and `--reactor 0` unguarded. The
independent calculator rejects every row. The test pins the engine's current behaviour
so that a guard added later changes this table deliberately rather than silently.
Request: GEO to reject or clamp in `build()` (or document that callers must), CLI to
validate flags.
