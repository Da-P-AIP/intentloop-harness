# IntentLoop Harness

> The persistent-loop evolution of IntentOps Harness — an auditable AI agent that
> closes its reasoning loop *across* sessions, not just within one.

**GitHub description (one-liner):**
Auditable AI agent that turns intent into evaluated, persistent thought packets — a cross-session feedback loop with HFE quality gating and a tamper-evident ledger.

---

## What it is

IntentLoop Harness extends [intentops-harness](https://github.com/Da-P-AIP/intentops-harness)
from a within-session refinement agent into a **loop-engineered** agent whose
evaluated reasoning persists and compounds across sessions.

It wires together three existing pieces:

- **[axis-thought-packet](https://github.com/Da-P-AIP/axis-thought-packet)** — the
  packet format that carries an evaluated unit of meaning across sessions (continuity).
- **[axis-hfe](https://github.com/Da-P-AIP/axis-hfe)** — the 6-axis Hypothesis Field
  Engine, used as a **quality gate / logic-organizer when stuck**, not as an
  autonomous answer engine.
- **RAG + the knowledge vault** — qualitative context retrieval over durable notes.

## Data foundation & memory

The agent sits on an **AI-ready three-layer data foundation** plus RAG, and keeps
**three orthogonal memory systems** (cognitive-science split: declarative / procedural
/ episodic).

**Three-layer data foundation (the "what")**

| Layer | Role | Where |
| --- | --- | --- |
| L1 Medallion | Bronze (raw) → Silver (cleansed) → Gold (aggregated) | `.raw/sources` → `wiki/sources` → `concepts`/`entities` |
| L2 Meaning | Semantic (fixed metric definitions) + Ontology (relationship edges) | concept notes + links |
| RAG | qualitative / unstructured context | note bodies |

**Three memory systems**

- **Declarative** (knowing *that*) — the three layers + RAG.
- **Procedural** (knowing *how*) — skills, harness configs, loop policies, in `reactor/`.
- **Episodic** (what *happened*) — the action ledger, session logs, HFE run logs.

**Carrier & access (not layers)**

- **ATP** is the cross-session *continuity carrier* — it belongs to no single shelf.
- **MCP** is the *access bus / gateway*, a protocol — standard-equipped, but not counted
  as a data layer.

## Pipeline

```
Observe -> Packetize -> Plan -> Evaluate(HFE) -> Gate -> Act -> Verify -> Persist(ATP) -> Loop
```

The loop is **bounded and observable** by design (the core requirements of loop
engineering): a verifiable goal, capped iterations to prevent runaway, a hash-chained
ledger for traceability, and a consent gate for risk.

## What makes it different from intentops-harness

| intentops-harness | intentloop-harness |
| --- | --- |
| Loop closes within one session | Loop closes across sessions |
| Throwaway `generated-artifacts/` | Evaluated packets persisted as ATP |
| In-app JS HFE-style scoring | Real `axis-hfe` 6-axis vector |
| Per-run quality refinement | Compounding quality over time |

## Design guardrails (loop engineering)

- **Bounded iteration** — capped passes; no infinite loops.
- **Event-driven re-evaluation** — re-score a packet only when new linked evidence
  arrives, never on a timer. Prevents token-cost explosion (~4x single-agent, ~15x
  multi-agent).
- **Observability** — every step recorded in the hash-chained action ledger.
- **Verify-before-trust** — fused/synthesized HFE hypotheses are verified before
  becoming durable memory.

## Status

Design stage. First milestone: a single-note retention loop
(`note -> HFE score -> gate -> ATP packet`) to validate that HFE scores track
perceived quality before full integration.

## Lineage

Part of the Axis / Cogito ecosystem:
`axis-hfe` (reasoning core) · `axis-thought-packet` (continuity format) ·
`intentops-harness` (governed execution) -> **`intentloop-harness`** (persistent loop).

## License

TBD (intentops-harness lineage; axis-hfe is MIT, axis-thought-packet is CC-BY-4.0).
