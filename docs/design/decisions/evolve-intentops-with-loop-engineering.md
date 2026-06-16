---
tags:
  - decision
  - project/intentops-harness
  - project/hfe
  - project/thought-packet
  - concept/loop-engineering
  - denno-shoko/core
---

# Decision: Evolve IntentOps Harness via Loop Engineering (ATP + HFE + RAG)

Date: 2026-06-16
Status: Proposed

## Context

[[intentops-harness]] is already an auditable AI DevOps agent with the pipeline
`Observe -> Packetize -> Plan -> Evaluate -> Gate -> Act -> Verify -> Log`.
It already contains, in prototype form: a Thought Packet, an HFE-style planner,
a Consent Gate (risk gating), an Action Ledger (hash chain), and a **bounded
Quality Gate loop** (target 80%, max 2 refinement passes).

The proposal: turn its **within-session** refinement loop into a
**cross-session, persistent** loop, by wiring in the real [[axis-hfe]] library
and the [[axis-thought-packet]] schema, with the vault as the memory store.

## What "Loop Engineering" actually is (verified)

Loop engineering (2026 term) = designing agent behaviour as **feedback-driven
iterative cycles**, not fixed chains (A->B->C). A loop has a trigger and a
*verifiable goal*, and repeats until the goal is met. Documented failure modes:
**infinite loops, goal drift, and token-cost explosion** (~4x tokens single-agent,
up to ~15x multi-agent). Required guardrails: **cost ceiling + observability**
(trace every step).

## Feasibility Verdict: YES, low-risk, mostly incremental

IntentOps already satisfies the hard parts of loop engineering:

| Loop-engineering requirement | IntentOps status |
| --- | --- |
| Verifiable goal | Quality Gate 80% target — present |
| Bounded iteration (anti-runaway) | max 2 passes — present |
| Observability | Action Ledger hash chain — present |
| Safety guardrail | Consent Gate risk tiers — present |
| Setpoint / ideal | HFE ideal vector — available in [[axis-hfe]] |
| Error signal | weighted distance from ideal — in [[axis-hfe]] |

So this is **not a from-scratch build**. ~80% exists. The work is two wires.

## The two wires

1. **Replace the in-app JS "HFE Planner" with the real `axis-hfe` library.**
   IntentOps currently normalizes/scores proposals in JavaScript. Swap that for
   a call to `pip install axis-hfe` (6-axis vector, evolution loop). HFE is used
   as a **logic-organizer / filter when stuck**, not as an autonomous answer engine.
2. **Persist evaluated output as ATP packets in the vault.**
   IntentOps writes throwaway `generated-artifacts/<hash>/`. Instead, write the
   evaluated result as an [[axis-thought-packet]] into `.raw/packets/`, so the next
   session reads "evaluated meaning" as input. RAG over `02_wiki/` note bodies adds
   qualitative context.

## Control-loop framing

A stable loop needs: setpoint (HFE ideal), measured output (HFE score), error
(distance), controller (Fusion / Self-correct / Jump), stop condition (bounded
iterations). IntentOps' `max 2 / 80%` is the damping that prevents oscillation.

**Key constraint to avoid runaway:** make re-evaluation **event-driven, not
timer-driven** — only re-run HFE on a packet when new linked evidence arrives.
Keep the cost ceiling and the ledger as the observability spine.

## Decision

Adopt the two-wire evolution path. Build the smallest closed loop first
(single note -> HFE score -> gate -> ATP packet), measure whether HFE scores
match perceived quality, then integrate into [[intentops-harness]].

## Rejected / Deferred

- Building a new agent system from scratch — rejected; duplicates existing harness.
- Timer-driven continuous re-looping — deferred; high runaway/cost risk.
- Treating HFE fusion output as ground truth without verification — rejected.

## Next Actions

- Stand up the minimal one-note retention loop (see [[hfe-as-logic-organizer-template]]).
- Validate HFE score vs. human judgement on ~5 real notes.
- If validated, fork an `intentops-harness` branch wiring `axis-hfe` + ATP persistence.

## Related

- [[ai-ready-data-three-layer-mapping]]
- [[hfe-network-amplification]]
- [[save-hfe-runs-as-network-assets]]
- [[axis-hfe]]
- [[axis-thought-packet]]
