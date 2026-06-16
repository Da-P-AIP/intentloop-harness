---
tags:
  - concept/agent-memory
  - concept/loop-engineering
  - project/intentloop-harness
  - project/hfe
  - project/thought-packet
  - denno-shoko/core
---

# Agent Memory Taxonomy for IntentLoop Harness

Created: 2026-06-16
Status: Draft

## Core Idea

An agent's memory is not one bucket. Borrowing the cognitive-science split (where
declarative, procedural, and episodic memory are even stored in different brain
regions), [[intentloop-harness]] keeps **three memory systems that stay orthogonal**,
plus a carrier and an access bus. Mixing them degrades retrieval and makes the
system brittle.

## The Three Memory Systems

| Memory type | Knowing... | Contents | Vault region | Retrieved by | Evaluated by |
| --- | --- | --- | --- | --- | --- |
| **Declarative** | ...*that* | facts, knowledge, the 3-layer data + RAG | `02_wiki/`, `.raw/` | content relevance (RAG / links) | HFE 6-axis (correctness) |
| **Procedural** | ...*how* | skills, harness configs, loop policies (thresholds, iteration caps, preset choice) | **`reactor/`** (prompts / schemas / templates) | task / capability match | reproducibility, safety, cost |
| **Episodic** | ...*what happened* | run records, decisions-in-time | Action Ledger, `02_wiki/sessions/`, HFE logs | time / causal chain | integrity (hash chain) |

## Why keep them separate (three reasons)

1. **Different lifecycles.** Knowledge updates continuously; skills/harnesses should be
   version-pinned and stable. Mixed, every knowledge edit risks shaking function.
2. **Different retrieval triggers.** Declarative is pulled by *content relevance* (RAG);
   procedural by *capability match* ("which skill for this task?"). Different access
   patterns in one shelf lowers precision.
3. **Different evaluation criteria.** Knowledge is judged by HFE's 6 axes (correctness);
   procedures by reproducibility, safety, and cost. Different yardsticks.

## The carrier and the bus (not memory layers)

- **[[axis-thought-packet]] (ATP) = the carrier.** A cross-cutting *continuity capsule*
  that bundles a knowledge snapshot (declarative) + the thought state at that moment
  (episodic) + intent, and hands it off between sessions. It belongs to no single shelf;
  it is the courier.
- **MCP = the access bus / nervous system.** A *protocol*, not a data layer. The earlier
  "three-layer" framing placed MCP as "Layer 3," but strictly it is the gateway the agent
  uses to reach all three memories — an interface, not a memory. Standard-equip it, but do
  not count it as a data layer. See [[ai-ready-data-three-layer-mapping]].

## Picture in one line

Declarative (3-layer + RAG) / Procedural (`reactor/`) / Episodic (ledger + sessions)
— **ATP carries between them, MCP is the common access port, HFE gates what enters.**

## Next Actions

- Formalize `reactor/` as the function registry (skills, harness configs, loop policies).
- Reflect this split in the [[intentloop-harness]] README (MCP = access, reactor = procedural).

## Related

- [[ai-ready-data-three-layer-mapping]]
- [[evolve-intentops-with-loop-engineering]]
- [[hfe-as-logic-organizer-template]]
- [[axis-thought-packet]]
- [[axis-hfe]]
