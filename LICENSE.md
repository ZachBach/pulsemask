# Licensing — PulseMask / pulseMask_Tech

Copyright © 2026 Zach Auerbach, trading as **Aurelius Dynamic**. All rights reserved.

Contact: [build@aureliusdynamic.com](mailto:build@aureliusdynamic.com)
ORCID: [0009-0001-3046-9104](https://orcid.org/0009-0001-3046-9104)

> **Draft for review.** These terms were drafted to match what
> [`pricing.html`](pricing.html) already promises customers. They are a starting point
> written by the author, not legal advice, and have not been reviewed by a lawyer.

---

## 1. What this covers

Three different things live in this repository and they are **not** licensed alike:

| Thing | What it is | Terms |
|---|---|---|
| **This source code** | `mask-geometry.js`, `three-d-stage.js`, `shader-designs.js`, `cli.mjs`, the pages | §2 — proprietary, all rights reserved |
| **Generated STL / OBJ / GLB output** | The files a customer buys or exports with a valid unlock code | §3 — personal license, §4 — commercial print license |
| **Individual shader modules** | GLSL modules sold from the Shader Lab | §5 — single-project license |

Third-party components this project *uses* carry their own licenses — see §7.

---

## 2. Source code — all rights reserved

The source in this repository is proprietary. No permission is granted to copy, modify,
redistribute, sublicense or create derivative works from it, and publishing it in any form
does not place it in the public domain or grant an implied licence.

Reading it, learning from it, and running it locally for evaluation is fine. Shipping it, or
anything derived from it, is not — ask first.

---

## 3. Generated geometry — personal license

Granted automatically with any purchased file tier, and with any export unlocked by a valid
`PMK-` code. Perpetual, worldwide, non-exclusive, non-transferable.

**You may:**

- Print the geometry as many times as you like, for yourself.
- Modify, remix and remodel it for your own use.
- Give a **printed physical piece** to another person as a gift.
- Photograph, film and post your build anywhere, commercially included — the images are
  yours. Credit is appreciated, never required.

**You may not:**

- Redistribute, resell, share or publish the files themselves, modified or not, including
  on model-sharing sites, in asset packs, or in a Discord.
- Sell printed pieces made from the geometry. That needs §4.
- Use the geometry to train a generative model.
- Present anything made from it as protective equipment. See §6 — this one is not
  negotiable at any price.

The license is per person. If a print farm or a friend prints it for you, that is fine; the
license stays with you and does not transfer to them.

---

## 4. Commercial print license

Required to sell printed pieces. Flat **5× the list tier price** — the list price, not a
sale price — per design, one time, perpetual. Arrange by email.

Grants everything in §3 plus the right to manufacture and sell physical pieces made from
that design, in unlimited quantity. Still does **not** grant redistribution of the files
themselves, and still carries §6 in full: every piece you sell must be sold as decorative
art, in writing, with the not-PPE statement attached.

---

## 5. Shader modules — single-project license

Each purchased GLSL module may be used in **one** shipping project, commercial or not, with
source-level modification allowed. A second project needs a second license. Modules may not
be resold, redistributed or published as a shader pack, and may not be used to train a
generative model.

---

## 6. Scope of what is sold — binding on every tier

**PulseMask is a design study sold as wearable art.** Everything licensed here produces a
decorative prop, costume or display piece.

It is **not a respirator, not PPE and not a medical device**. It is untested to NIOSH
42 CFR 84, EN 136, EN 143 and ISO 16900 — no protocol has been run against it at all. It
provides **no respiratory protection whatsoever** and must never be relied on, worn,
resold, gifted or presented as protective equipment.

Germicidal, log-reduction, capsid-disruption, coalescence, solar and runtime figures
published anywhere in this project are **modelled, never measured**.

No electronics are included or supported. **Never install a UV-C emitter** — UV-C is a
serious eye and skin hazard, and the enclosed reactor geometry has no interlock, no
shielding survey and no line-of-sight verification behind it.

Files and any physical pieces are provided **as is**, without warranty of any kind. The
author is not liable for any loss, injury or damage arising from printing, assembling,
finishing, wearing, modifying or selling anything derived from them. You are responsible for
your material choices, your print quality, your workshop safety and how a finished piece is
used.

Nothing in this section may be waived by agreement, and no other document, invoice or
conversation overrides it.

---

## 7. Third-party components

This project loads, but does not redistribute, the following. Each remains under its own
license and its own copyright:

| Component | Version | License | Notes |
|---|---|---|---|
| [three.js](https://threejs.org) | r0.184.0 | MIT — © 2010–2025 three.js authors | Loaded from unpkg via an integrity-pinned import map. Not vendored into this repo. |
| [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) | — | SIL Open Font License 1.1 | Loaded from Google Fonts. Not vendored. |
| [IBM Plex Sans / Mono](https://www.ibm.com/plex/) | — | SIL Open Font License 1.1 | Loaded from Google Fonts. Not vendored. |

**If any of these is ever inlined or vendored** rather than linked — as the parent Aurelius
Dynamic landing page does with its embedded three.js builds — the corresponding license text
must travel with it. MIT requires the copyright notice and permission notice to accompany
redistributed copies; the OFL requires its license to accompany redistributed font files and
forbids selling the fonts on their own. Linking to a CDN, which is what happens today, does
not trigger either obligation.

---

## 8. Attribution

Not required for anything you build or photograph. If you want to credit it anyway:

> PulseMask — Aurelius Dynamic · aureliusdynamic.com
