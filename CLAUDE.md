# intentloop-harness — Project Rules

You are building **intentloop-harness**: the cross-session, persistent-loop evolution of
[intentops-harness](https://github.com/Da-P-AIP/intentops-harness). Read
`docs/BUILD_BRIEF.md` first — it is the authoritative spec. Design background lives in
`docs/design/`.

## Prime directive

**Do not build everything at once.** Ship the smallest closed loop first (Milestone 1),
measure it, then expand. This is loop engineering: small closed loop → measure → grow.

## What this project is

An auditable AI agent whose reasoning loop closes **across** sessions, not just within one.
It inherits the intentops governance (consent gate, hash-chained ledger, bounded loop) and
changes three things: real HFE scoring, ATP persistence, and a 3-system memory model.

## The 2 wires (the actual work)

1. **JS HFE-style scoring → real `axis-hfe`** (PyPI: `axis-hfe`). 6-axis vector
   (accuracy / consistency / risk / novelty / feasibility / divergence). Call Python from
   Node via a subprocess CLI, JSON in/out. Use HFE as a **quality gate / logic-organizer**,
   NOT as an autonomous answer engine.
2. **Throwaway artifacts → ATP persistence.** After the gate passes, write an
   `axis-thought-packet`-schema-valid packet to `packets/`. Next session's Observe step
   loads recent packets for continuity.

## Inherit, don't reinvent

Consent Gate (low/medium/high), Action Ledger (hash chain), bounded loop (max 2 / target 80%),
and the `Observe → Packetize → Plan → Evaluate → Gate → Act → Verify → Persist → Log` skeleton
come from intentops-harness. Reuse them.

## Quality gate thresholds (hard)

Persist only if `risk <= 0.40` AND `consistency >= 0.70` AND `accuracy >= 0.80`.
Read thresholds from `reactor/loop-policy.json` (procedural memory), never hard-code them.

## Guardrails (non-negotiable)

- **Bounded iterations** — never an unbounded loop.
- **Event-driven re-evaluation** — re-score a packet only when new linked evidence arrives.
  Never timer-driven (prevents token-cost blowup ~4x/~15x).
- **Observability** — append every loop step to the hash-chained ledger.
- **Verify-before-trust** — flag HFE fusion/jump output `needs_verification: true` until checked.
- **Safety** — no secrets in packets; no auto-deploy / no auto-push; consent gate stays.

## Memory model (keep orthogonal)

- Declarative (knowing *that*) — 3-layer data + RAG.
- Procedural (knowing *how*) — skills, harness config, loop policy → `reactor/`.
- Episodic (what *happened*) — ledger, session logs, HFE logs.
- ATP carries between them; MCP is the access bus (a protocol, not a data layer).

## Tech / dev

- Orchestration: Node (inherit). Reasoning: Python `axis-hfe` via subprocess CLI.
- Dev/offline: use `mock_llm=True` or `ollama` (no API cost). Real runs: `anthropic`.
- Keep code repo and the knowledge vault decoupled — design notes live in the Vault; this
  repo holds code + `docs/`.

## Milestone 1 — Definition of Done

1. CLI takes one source note → produces an HFE 6-axis score.
2. Gate correctly rejects below-threshold, persists above.
3. A schema-valid ATP appears in `packets/<id>.json`.
4. A second run reads the prior packet as context (continuity demonstrated).
5. A ledger entry (prev/curr hash) is written per run.
6. Calibration log of HFE score vs. human judgement over ~5 real notes.

## Commits

git init + connect remote `Da-P-AIP/intentloop-harness`, then commit per logical step.
Small, reviewable commits. Do not push secrets or `packets/` runtime output (.gitignore them).
