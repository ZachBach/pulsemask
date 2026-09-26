# PulseMask validation task backlog

This backlog is a planning document for two separate evidence tracks:

1. **Photo-fit validation** — whether a single-photo reconstruction is
   geometrically repeatable and useful as a *design visualization*.
2. **Dose-budget validation** — whether the modeled UV-C reactor dose agrees
   with independently measured optical and flow data under explicitly bounded
   laboratory conditions.

There are 100 tasks total: PF-01–PF-50 and DB-01–DB-50. Complete them in order
within each track unless an owner records a dependency-based reason to reorder.
The IDs are stable references for issues, experiments, and review notes.

Saved to the repository 2026-09-25. Track A is worked by a separate agent
instance; Track B by the biomedical R&D instance. Track B artifacts live in
`validation/dose-budget/` and `test/dose-budget*.{mjs,json}`.

## Scope, ownership, and safety boundaries

- This file is an isolated backlog. Before implementing an item, coordinate
  ownership with the people working on the active branch and avoid their files
  or experiments unless they explicitly hand them off.
- The current project is a **wearable-art design study**, not a respirator, PPE,
  medical device, or source of medical advice. Neither track can establish
  protective performance by itself.
- Photo-fit output, including the existing heatmap, is a model visualization;
  it is not evidence of a seal, fit, comfort, safety, or suitability for use.
- Dose and inactivation figures are modeled, not measured. A nominal dose
  target is not universal: any biological target depends on the organism,
  wavelength, matrix, test method, and conditions.
- Do not install or energize UV-C emitters in a wearable prototype. No human
  exposure, face-worn UV-C experiment, pathogen challenge, or protective-use
  test is authorized by this backlog. UV-C optical work belongs in an
  appropriately equipped and reviewed laboratory with engineered containment,
  interlocks, leakage checks, and qualified personnel.
- Face images and derived scans are sensitive biometric data. Obtain explicit
  consent, minimize collection, restrict access, define deletion dates, and do
  not commit identifiable images, scans, or measurements to Git.
- Do not publish pass/fail claims until the protocol, analysis, uncertainty,
  limitations, and independent review have been completed and approved.

## Track A — Photo-fit validation (PF-01–PF-50)

### Protocol and claims

- [ ] **PF-01** — Name an accountable validation owner and an independent
  reviewer; record their roles and conflict-of-interest declarations.
- [ ] **PF-02** — Write the intended-use statement as geometry visualization
  only, excluding fit, seal, comfort, respiratory, or protective claims.
- [ ] **PF-03** — Inventory every current UI label, metric, export, and document
  that could be mistaken for a measured fit or seal result.
- [ ] **PF-04** — Define the questions this track can answer and explicitly list
  out-of-scope questions, including respirator fit and clinical suitability.
- [ ] **PF-05** — Freeze and version the generator code, settings, browser,
  geometry parameters, and renderer used by the baseline.
- [ ] **PF-06** — Draft a test protocol describing inputs, operators, equipment,
  steps, measurements, exclusions, and deviations before collecting data.
- [ ] **PF-07** — Have an independent reviewer approve the protocol and
  pre-register its primary outcomes before the first validation run.
- [ ] **PF-08** — Define separate acceptance criteria for landmark placement,
  scale recovery, geometric agreement, and repeatability.
- [ ] **PF-09** — Label each criterion as exploratory or release-blocking and
  justify its numeric tolerance from the intended design use.
- [ ] **PF-10** — Establish a change-control rule requiring a new protocol
  version when capture methods, geometry, or acceptance criteria change.

### Privacy, sample design, and capture

- [ ] **PF-11** — Produce a face-image consent form covering purpose, storage,
  access, retention, withdrawal, and deletion.
- [ ] **PF-12** — Decide whether synthetic faces and non-human fixtures can
  answer each planned question before collecting any real face image.
- [ ] **PF-13** — Define a data-minimization plan; do not retain source photos
  when derived measurements suffice for an approved analysis.
- [ ] **PF-14** — Store approved face data outside the repository in access-
  controlled storage with encryption and an auditable deletion process.
- [ ] **PF-15** — Define a de-identification and metadata-scrubbing checklist
  for images, exports, logs, screenshots, and study notes.
- [ ] **PF-16** — Select a sample design that covers the intended geometry
  range without treating demographic groups as interchangeable proxies.
- [ ] **PF-17** — Define inclusion, exclusion, and image-quality rules before
  recruiting or selecting samples.
- [ ] **PF-18** — Specify a capture setup for frontal pose, camera distance,
  focal length, lighting, expression, and image resolution.
- [ ] **PF-19** — Test the capture setup with a calibration target and document
  how perspective distortion is detected or bounded.
- [ ] **PF-20** — Define how glasses, hair, masks, facial hair, shadows, and
  occlusions are recorded and handled without silently guessing hidden shape.
- [ ] **PF-21** — Record the source and measurement method for interpupillary
  distance (IPD); do not infer its ground truth from the same photo being
  evaluated.
- [ ] **PF-22** — Document allowed landmark-placement instructions and provide
  a repeatable annotation guide for both pupils, nose tip, mouth, and menton.
- [ ] **PF-23** — Have at least two blinded annotators independently place
  landmarks on the same approved sample subset.
- [ ] **PF-24** — Quantify inter-annotator and intra-annotator landmark
  variability in pixels and converted millimetres.
- [ ] **PF-25** — Define an image rejection or uncertainty outcome for pose,
  occlusion, blur, or calibration quality that falls outside the protocol.

### Geometry and measurement

- [ ] **PF-26** — Document the photo-to-model reconstruction pipeline,
  including anthropometric assumptions and high-pass luminance relief.
- [ ] **PF-27** — Enumerate all generator inputs that alter face, shell, rim,
  visor, cup, and bead geometry, with units and valid ranges.
- [ ] **PF-28** — Define a neutral synthetic-face fixture with known dimensions
  for deterministic scale and landmark regression tests.
- [ ] **PF-29** — Define an independent 3D reference method for non-human
  geometry comparisons, including calibration, resolution, and uncertainty.
- [ ] **PF-30** — Verify reference-method repeatability on a fixed non-human
  phantom before comparing it with generated geometry.
- [ ] **PF-31** — Align generated and reference surfaces using a predeclared
  registration method that does not optimize away scale error.
- [ ] **PF-32** — Report point-to-surface and landmark errors with units,
  distribution summaries, and uncertainty intervals.
- [ ] **PF-33** — Separate scale error, landmark error, surface-shape error,
  and between-run variation rather than combining them into one score.
- [ ] **PF-34** — Measure sensitivity to small landmark perturbations using
  repeatable scripted offsets in both axes.
- [ ] **PF-35** — Measure sensitivity to IPD entry error independently of
  landmark-placement error.
- [ ] **PF-36** — Test plausible changes in crop, camera perspective, lighting,
  expression, and head rotation while holding other inputs fixed.
- [ ] **PF-37** — Test whether image texture relief changes generated contact
  surfaces; document cases where photometric detail is not geometric evidence.
- [ ] **PF-38** — Compare repeated generations from identical inputs and check
  vertex, bounds, and exported-mesh determinism.
- [ ] **PF-39** — Compare browser and headless CLI geometry for identical
  inputs and document any reproducible differences.
- [ ] **PF-40** — Add regression fixtures for invalid, ambiguous, or
  out-of-range landmark and IPD inputs, with explicit user-facing errors.

### Repeatability, interpretation, and release

- [ ] **PF-41** — Test the same input across supported browsers and record
  geometry hashes, parameter values, and runtime versions.
- [ ] **PF-42** — Test operator repeatability by having operators capture and
  annotate the same approved non-identifiable fixture independently.
- [ ] **PF-43** — Produce a per-sample error budget that includes capture,
  annotation, scale, reference scan, registration, and meshing uncertainty.
- [ ] **PF-44** — Use a held-out evaluation set that was not used to tune
  anthropometric assumptions or tolerances.
- [ ] **PF-45** — Report subgroup coverage and missingness without using
  incomplete coverage to imply broad population validity.
- [ ] **PF-46** — Review the existing fit heatmap semantics and ensure it cannot
  be read as measured pressure, contact, or seal performance.
- [ ] **PF-47** — Replace or qualify any heatmap text that implies conformance
  is independently observed rather than constructed by the model.
- [ ] **PF-48** — Publish a limitations note stating that photo-derived
  geometry cannot validate real-world contact, comfort, or protective fit.
- [ ] **PF-49** — Have an independent reviewer reproduce the primary analysis
  from a de-identified, versioned dataset and frozen code revision.
- [ ] **PF-50** — Close the track with a signed report, reproducible artifacts,
  unresolved-risk list, data-retention confirmation, and explicit no-claim
  release decision.

## Track B — Dose-budget validation (DB-01–DB-50)

Status 2026-09-25: DB-02 to DB-15 done at commit `0605893`; DB-38 and DB-39 done
out of order (reason: computational only, share the test file with DB-10). DB-01
drafted as a template and needs human names. Record: `validation/dose-budget/`.

### Model definition and accounting

- [ ] **DB-01** — Name a qualified optical/fluids validation owner and an
  independent reviewer; record who may authorize laboratory work.
  _Template in `validation/dose-budget/baseline.md`; names are a human-gate item._
- [x] **DB-02** — State that current dose, dwell, and log-reduction figures are
  exploratory model outputs, not measurements or validated performance.
  _Canonical statement in `baseline.md`; page wording changes filed to human gate._
- [x] **DB-03** — Inventory every page, metric, formula, and export that
  presents UV dose, irradiance, dwell time, or inactivation.
- [x] **DB-04** — Freeze the current dose equations, geometry, parameters,
  units, source revision, and default configuration as a baseline.
- [x] **DB-05** — Draw a variable and unit map from optical power and flow
  through irradiance, residence time, fluence, and modeled response.
- [x] **DB-06** — Independently derive each implemented equation and compare
  it term-by-term with the source rationale and code.
  _Arithmetic agrees; seven findings in `model-audit.md`, incl. 3.0 mJ/cm² target vs k = 1.2 inconsistency._
- [x] **DB-07** — Audit all unit conversions, including L/min, mL, cm, seconds,
  mW, mJ, and mJ/cm², using hand-checkable test cases.
- [x] **DB-08** — Check dimensional consistency for every intermediate and
  final quantity; fail validation on incompatible or missing units.
- [x] **DB-09** — Define sign, range, and domain checks for flow, optical
  output, reactor size, reflectance, and organism-response parameters.
  _Defined and enforced in the independent calculator; engine/CLI adoption filed as requests._
- [x] **DB-10** — Add independent golden calculations for nominal, zero-flow,
  maximum-flow, and invalid-input cases.
- [x] **DB-11** — Identify every assumption that turns average values into a
  claimed delivered dose, and document its evidence source.
- [x] **DB-12** — Separate incident irradiance, local fluence rate, exposure
  time, and accumulated fluence in terminology and output labels.
  _Defined; relabels on claim-bearing surfaces filed to human gate._
- [x] **DB-13** — Define whether reported dose is a mean, minimum, percentile,
  or single-path estimate; never leave the statistic implicit.
- [x] **DB-14** — Determine whether the current single dwell-time estimate
  represents a realistic residence-time distribution under flow.
  _It does not; quantified with Re, entry length and the laminar-limit bound._
- [x] **DB-15** — Add explicit model warnings where a required variable has
  no measured input or its uncertainty is unknown.
  _Emitted by the independent calculator; product-surface wording filed to APP/CLI + human gate._

### Optical and flow characterization

- [ ] **DB-16** — Specify a radiometry setup with wavelength response,
  detector range, geometry, calibration traceability, and uncertainty.
- [ ] **DB-17** — Verify calibration status of every radiometer, spectrometer,
  flow meter, and temperature/humidity instrument before testing.
- [ ] **DB-18** — Measure source spectral output across the stated operating
  range; do not treat electrical input power as optical power.
- [ ] **DB-19** — Measure source-to-source optical variability and record
  part, bin, drive, warm-up, and aging conditions.
- [ ] **DB-20** — Measure irradiance at a documented three-dimensional grid
  inside a non-wearable, fully contained test fixture.
- [ ] **DB-21** — Repeat irradiance mapping with the final optical materials,
  windows, reflectors, coatings, seams, and assembly tolerances represented.
- [ ] **DB-22** — Characterize wavelength-dependent reflectance and absorption
  for each relevant internal material and surface finish.
- [ ] **DB-23** — Measure optical losses from windows, contamination, ageing,
  and manufacturing variation under a written protocol.
- [ ] **DB-24** — Measure test-fixture flow over the full declared range using
  a calibrated flow instrument and record pressure drop.
- [ ] **DB-25** — Measure residence-time distribution with a safe tracer
  method selected and reviewed by qualified laboratory personnel.
- [ ] **DB-26** — Compare measured residence-time distributions against the
  current nominal reactor-dwell calculation.
- [ ] **DB-27** — Evaluate flow maldistribution, bypass, recirculation, and
  stagnant regions using measurement or independently validated simulation.
- [ ] **DB-28** — Measure temperature and humidity effects on the optical
  source, materials, and measured output without using a human wearer.
- [ ] **DB-29** — Characterize filter loading and pressure-driven flow changes
  with a safe, non-biological test medium and documented containment.
- [ ] **DB-30** — Repeat measurements across builds or fixtures to quantify
  between-assembly variability.

### Model validation and uncertainty

- [ ] **DB-31** — Compare predicted and measured irradiance maps at matched
  coordinates, with residual plots and uncertainty bars.
- [ ] **DB-32** — Compare predicted and measured flow and residence-time
  distributions using predeclared error metrics.
- [ ] **DB-33** — Calculate accumulated fluence from the measured spatial and
  temporal fields using a documented numerical integration method.
- [ ] **DB-34** — Report the lower-tail exposure statistic relevant to the
  chosen design question instead of relying only on a chamber average.
- [ ] **DB-35** — Propagate measurement and model uncertainty through dose
  estimates; list dominant contributors and covariance assumptions.
- [ ] **DB-36** — Perform sensitivity analysis for flow, source output,
  reflectance, path length, residence time, and ageing.
- [ ] **DB-37** — Test worst-case tolerance combinations selected before
  reviewing the results, not only nominal or favorable configurations.
- [x] **DB-38** — Compare independent implementations of the dose calculation
  on a shared, versioned test vector set.
  _Done out of order (computational only). `test/dose-budget.mjs` vs engine, vectors v1._
- [x] **DB-39** — Validate numerical behavior at extremes and reject NaN,
  infinity, overflow, and physically impossible results.
  _Done out of order. Independent calc rejects; engine behaviour recorded and pinned; guard requests filed._
- [ ] **DB-40** — Reserve an independent measurement set for final validation
  rather than tuning and evaluating on the same measurements.
- [ ] **DB-41** — Establish a model acceptance rule from intended use and
  measurement uncertainty before validation measurements are unblinded.
- [ ] **DB-42** — Document model discrepancy when predictions fall outside
  acceptance; do not tune constants solely to fit the held-out data.
- [ ] **DB-43** — Version all raw measurements, calibration certificates,
  analysis scripts, exclusions, and deviations in controlled storage.

### Biological interpretation, safety, and release

- [ ] **DB-44** — Identify the exact organism or surrogate and evidence base
   before using any dose-response or log-reduction coefficient.
- [ ] **DB-45** — Verify that any cited dose target applies to the specified
  wavelength, organism, matrix, humidity, and assay conditions.
- [ ] **DB-46** — Treat each log-reduction value as a hypothesis until an
  approved independent laboratory validates the relevant assay; no pathogen
  challenge is authorized by this task list.
- [ ] **DB-47** — Remove any wording that presents a generic dose target or
  modeled log reduction as universal, demonstrated, or protective efficacy.
- [ ] **DB-48** — Require documented engineered containment, interlocks,
  leakage measurement, emergency procedures, and qualified approval before
  any UV-C optical bench test.
- [ ] **DB-49** — Have an independent reviewer audit calculations, raw-data
  traceability, safety controls, uncertainty, and all public-facing claims.
- [ ] **DB-50** — Close the track with a reproducible validation report,
  explicit limitations, unresolved risks, and a no-protective-claim release
  decision unless separate regulatory and safety approvals authorize otherwise.
