---
tags:
  - hfe/template
  - project/hfe
  - project/thought-packet
  - concept/loop-engineering
  - denno-shoko/core
---

# HFE Evaluation Template — Logic Organizer & Quality Gate

Created: 2026-06-16
Status: Template

## How to use this

HFE is treated here as a **logic-organizer for when reasoning is stuck**, and as a
**quality gate** that decides whether a note enters durable memory — *not* as an
autonomous answer engine. Copy this file, rename to
`YYYY-MM-DD-<topic>-hfe.md`, fill in, and link it from the source note.

- Use `safe` preset when you need to converge / de-risk.
- Use `creative` preset when you are stuck and need divergence.
- Persist only if the result passes the gate (see Gate section).

---

## Source Links

- Source: [[ ]]
- Thought Packet: [[axis-thought-packet]]
- Related concepts: [[ai-ready-data-three-layer-mapping]], [[hfe-network-amplification]]
- Related project: [[axis-hfe]]

## Input Focus

> One sentence: what decision or stuck-point is this run resolving?

## Intent

- Why this matters:
- What it will be used for:

## Constraints

- No secrets / customer data (per CLAUDE.md safety rules).
- Keep concise enough to be reused.
- Hard gates: `risk <= 0.40`, `consistency >= 0.70`, `accuracy >= 0.80`.

## Hypotheses (6-axis scoring)

Ideal (default): accuracy 0.95 · consistency 0.90 · risk 0.20 · novelty 0.60 · feasibility 0.90 · divergence 0.45

| Hypothesis | Accuracy | Consistency | Risk | Novelty | Feasibility | Divergence | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A. | | | | | | | |
| B. | | | | | | | |
| C. | | | | | | | |

## Gate Decision

- [ ] Passes hard gates (risk/consistency/accuracy)? If no -> do **not** persist; refine or reject.
- [ ] If a fused/synthesized hypothesis ranks best -> **verify independently** before trusting it.
- Selected hypothesis:
- Reason:

## Fused / Selected Strategy

> The chosen path, in 2-4 sentences.

## Rejected or Deferred Paths

> Keep the ones useful for future reasoning edges.

## Next Actions

- [ ] Extract task(s) into `02_wiki/tasks/`
- [ ] If a direction change, log in `02_wiki/decisions/`
- [ ] If persisted, write packet to `.raw/packets/`

## Related

- [[evolve-intentops-with-loop-engineering]]
- [[ai-ready-data-three-layer-mapping]]
- [[save-hfe-runs-as-network-assets]]
