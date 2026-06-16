---
human_quality: 0.85
human_note: "Solid, actionable, low-risk. Event-driven re-eval is the right call."
---
Cache HFE evaluations across sessions and re-score a packet only when new linked
evidence arrives, never on a timer. This keeps token cost bounded (~4x single-agent
blowup avoided) while preserving continuity through persisted ATPs.
