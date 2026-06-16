---
tags:
  - concept/data-foundation
  - concept/three-layer-architecture
  - concept/ontology
  - concept/semantic-layer
  - project/hfe
  - project/thought-packet
  - denno-shoko/core
---

# AI-Ready Data: Three-Layer Architecture mapped to the Vault

Created: 2026-06-16
Status: Draft

## Core Idea

The "AI-ready data foundation" pattern inserts a **meaning layer** between raw data and the AI, so the agent answers in business context instead of returning plausible-but-wrong numbers. It has three layers. This vault already implements a rough version of all three; the value is in making the mapping explicit and wiring in [[axis-thought-packet]] and [[axis-hfe]].

## The Three Layers (industry pattern)

1. **Layer 1 — Accurate data base (Medallion).** Bronze (raw) -> Silver (typed, de-duplicated, cleansed) -> Gold (aggregated, star-schema / view-ready).
2. **Layer 2 — Meaning layer (the core).**
   - **Semantic layer**: fixes metric *definitions* ("sales = tax-excluded, returns excluded"). Answers "how much / how many?" Output = a consistent number.
   - **Ontology**: defines *relationships* between concepts (class / relation / property). Answers "what connects to what?" Output = related data traversed across edges.
3. **Layer 3 — Unified access layer.** MCP (Model Context Protocol) hands the agent *tools*, not raw SQL — a safe gateway that delivers "correct-meaning" data.

RAG sits alongside, handling **qualitative / unstructured** documents (the "why"), while Layer 1-2 handle **quantitative / structured** data (the "what").

## Mapping onto Axis Knowledge Vault

| Layer | Industry term | Vault equivalent |
| --- | --- | --- |
| L1 Bronze | raw ingest | `.raw/sources/` |
| L1 Silver | cleansed | `02_wiki/sources/` (processed summaries) |
| L1 Gold | aggregated | `02_wiki/concepts/`, `02_wiki/entities/` |
| L2 Semantic | fixed definitions | concept notes (one canonical definition per concept) |
| L2 Ontology | relationship edges | Obsidian wikilinks between notes |
| L3 Access | MCP gateway | the agent / MCP reading the vault |
| RAG | qualitative context | note bodies as retrieval corpus |
| Packet | meaning capsule | [[axis-thought-packet]] in `.raw/packets/` |
| Quality gate | which data is good enough to keep | [[axis-hfe]] 6-axis scoring |

## Why ATP and HFE strengthen Layer 2-3

- **[[axis-thought-packet]]** is the *container* that carries an evaluated unit of meaning across sessions — it lives in Layer 2 (meaning) and is delivered through Layer 3 (access). It does not run; it is a format.
- **[[axis-hfe]]** is the *quality gate*: it scores a candidate note on 6 axes and decides what is worth persisting. Use it primarily as a **filter** (reject `risk > 0.40`, `consistency < 0.70`), and only secondarily as a generator — fusion output must be verified before it becomes durable memory.

These map directly onto [[hfe-network-amplification]]: information links + intent links + hypothesis links + evaluation links.

## Verdict on the source material

The three-layer source is accurate but generic industry knowledge (grade: solid reference, not novel). Its value to the vault is the **mapping above**, not the raw transcript. Stored as this concept note rather than a chat log, per the CLAUDE.md rule against burying ideas in transcripts.

## Next Actions

- See decision: [[evolve-intentops-with-loop-engineering]]
- Use template: [[hfe-as-logic-organizer-template]]
- Consider one minimal end-to-end retention loop on a single real note before building the full stack.

## Related

- [[axis-thought-packet]]
- [[axis-hfe]]
- [[hfe-network-amplification]]
- [[intent-aware-ai-second-brain]]
- [[da-p-research-system]]
