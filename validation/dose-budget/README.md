# Track B — dose-budget validation

Whether the modelled UV-C reactor dose agrees with independently measured optical and
flow data under bounded laboratory conditions. Backlog: `validation/backlog.md`,
items DB-01 to DB-50.

**Nothing in this folder is a performance claim.** It records what the model computes,
what it assumes, and what would have to be measured. No emitter is energized, no
wearable is tested and no organism is challenged by anything here (backlog scope
section; DB-48).

## Files

| File | Covers | Status |
| --- | --- | --- |
| `baseline.md` | DB-01 roles (template, unfilled), DB-02 status statement, DB-03 surface inventory, DB-04 frozen equations and outputs, DB-05 variable and unit map | written 2026-09-25 |
| `model-audit.md` | DB-06 derivation and findings, DB-07 unit audit, DB-08 dimensional check, DB-09 domain checks, DB-10 golden cases, DB-11 assumptions, DB-12 terminology, DB-13 statistic, DB-14 residence-time analysis, DB-15 warnings, DB-38 implementation comparison, DB-39 extremes | written 2026-09-25 |
| `../../test/dose-budget.mjs` | independent implementation, dimensional tracking, domain checks, vector runner | passes at `0605893` |
| `../../test/dose-budget-vectors.json` | versioned hand-derived vector set (v1) | frozen |

Run:

```bash
node test/dose-budget.mjs           # exit 1 on any disagreement
node test/dose-budget.mjs --print   # plus Reynolds number, regime, warnings per vector
```

## What is blocked and why

DB-16 to DB-37 are laboratory measurements (radiometry, spectral output, irradiance
mapping, calibrated flow, tracer residence-time distribution) or depend on them. They
need instruments, a contained non-wearable fixture, DB-48 sign-off and the DB-01 roles.
DB-40 to DB-50 depend on those results or on the human reviewer. DB-44/45/47 (organism,
citation, wording) can proceed at a desk and are next in this track.

## Findings that need an owner's action

Filed here rather than edited, per AGENT_PLAYBOOK §2. Details and line numbers in
`model-audit.md`.

| # | Finding | Owner | Human gate? |
| --- | --- | --- | --- |
| 6.4 | 3.0 mJ/cm² "2-log target" is inconsistent with k = 1.2 (gives 1.56 log; 2-log needs 3.84) | DOC + whoever sources the citation (DB-44/45) | yes, claims |
| 6.3 | "55% coupling loss" text vs code's 0.55 retained fraction | APP, DOC | yes, claims |
| 6.6 | `index.html:1069` hard-codes k = 1.2 instead of `params.kUV` | APP | no |
| 6.1 | `reflectance` is a cavity gain; rename via ADR | GEO, DOC | no |
| 6.5 | `2.303` → `Math.LN10` | GEO | no |
| 13 | "treat the figure as an upper bound" is wrong for the mean | APP | yes, claims |
| 12, 15 | qualify dose/LRV labels as modelled mean, plug flow; surface the six warnings | APP, CLI | yes, claims |
| 39 | engine returns ∞/NaN/negative dose on invalid input; CLI flags unguarded | GEO, CLI | no |

## Not verified

- No page was loaded in a browser for this track; the metrics-card findings come from
  reading `index.html`, not from rendering it.
- The independent calculator reproduces the engine's *model*; it does not and cannot
  say whether the model matches a physical reactor. That is DB-16 onward.
- Air properties used for the Reynolds numbers (1.204 kg/m³, 1.825e-5 Pa·s) are
  textbook values at 20 °C, not measured.
