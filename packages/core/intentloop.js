"use strict";
// Orchestrator (evolution of intentops.js). Runs the inherited pipeline:
//   Observe -> Packetize -> Plan -> Evaluate(HFE) -> Gate -> Act -> Verify -> Persist -> Log
// with a BOUNDED loop (max_iterations from loop-policy.json). Every step is
// appended to the hash-chained ledger (observability).

const crypto = require("crypto");
const ledger = require("./ledger");
const hfe = require("./hfe");
const gate = require("./gate");
const packetize = require("./packetize");

// opts: { note, intent?, provider?, sessionId?, quiet? }
async function runLoop(opts) {
  const policy = gate.loadPolicy();
  const sessionId = opts.sessionId || `sess_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`;
  const intent = opts.intent || "retain evaluated insight from source note";
  const provider = opts.provider || (policy.hfe.provider_dev === "mock" ? "mock" : policy.hfe.provider_dev);
  const log = (...a) => { if (!opts.quiet) console.log(...a); };

  // --- Observe: load recent ATPs for cross-session continuity ---
  const recent = packetize.loadRecent(3);
  ledger.append("observe", { session_id: sessionId, recent_packets: recent.map((p) => p.id) });
  log(`\n[observe] loaded ${recent.length} prior packet(s): ${recent.map((p) => p.id).join(", ") || "(none — first session)"}`);

  // --- Packetize/Plan: frame the problem, threading prior context as continuity ---
  const continuity = recent.length
    ? `\n\nPrior evaluated context (continuity):\n` + recent.map((p) => `- ${p.content.slice(0, 120)}`).join("\n")
    : "";
  const problem = `${opts.note}${continuity}`;
  ledger.append("plan", { intent, has_continuity: recent.length > 0 });

  // --- Bounded loop: Evaluate(HFE) -> Gate, refine up to max_iterations ---
  const maxIter = policy.loop.max_iterations;
  let hfeResult = null;
  let gateResult = null;
  let attempt = 0;

  while (attempt < maxIter) {
    attempt += 1;
    log(`\n[evaluate] HFE pass ${attempt}/${maxIter} (provider=${provider}, preset=${policy.hfe.ideal_preset})...`);
    const res = await hfe.score({
      problem,
      ideal_preset: policy.hfe.ideal_preset,
      iterations: policy.hfe.iterations,
      count: policy.hfe.count,
      provider,
      model: (policy.hfe.models && policy.hfe.models[provider]) || undefined,
    });
    if (!res.ok) {
      ledger.append("evaluate_error", { attempt, error: res.error });
      throw new Error(`HFE failed: ${res.error}`);
    }
    hfeResult = res;
    const v = res.best.vector;
    ledger.append("evaluate", { attempt, score: res.best.score, vector: v, source: res.best.source });
    log(`  score=${res.best.score.toFixed(3)} source=${res.best.source}`);
    log(`  vector: acc=${v.accuracy.toFixed(3)} cons=${v.consistency.toFixed(3)} risk=${v.risk.toFixed(3)} nov=${v.novelty.toFixed(3)} feas=${v.feasibility.toFixed(3)} div=${v.divergence.toFixed(3)}`);

    gateResult = gate.evaluate(v, policy);
    ledger.append("gate", { attempt, passed: gateResult.passed, reasons: gateResult.reasons });
    log(`[gate] ${gateResult.passed ? "PASS" : "FAIL"}`);
    gateResult.reasons.forEach((r) => log(`  ${r}`));

    if (gateResult.passed) break;
    if (attempt < maxIter) {
      ledger.append("refine", { attempt, note: "gate failed, re-evaluating (bounded)" });
      log(`[refine] gate failed — retrying (bounded, ${maxIter - attempt} left)`);
    }
  }

  // --- Act / Verify / Persist ---
  if (!gateResult.passed) {
    ledger.append("reject", { session_id: sessionId, attempts: attempt });
    log(`\n[reject] gate not passed after ${attempt} attempt(s) — nothing persisted.`);
    return { persisted: false, sessionId, gate: gateResult, hfe: hfeResult, attempts: attempt };
  }

  const packet = packetize.build({
    sessionId,
    intent,
    sourceNote: opts.note,
    hfeResult,
    gateResult,
    policy,
    prevPacketIds: recent.map((p) => p.id),
  });
  ledger.append("verify", { packet_id: packet.id, needs_verification: packet.needs_verification });
  log(`\n[verify] needs_verification=${packet.needs_verification} (source=${packet.hfe.source})`);

  const file = packetize.persist(packet); // validates against schema, throws if invalid
  ledger.append("persist", { packet_id: packet.id, file });
  log(`[persist] ATP written + schema-validated -> ${file}`);

  const chain = ledger.verifyChain();
  log(`[log] ledger chain ${chain.ok ? "intact" : "BROKEN"} (${chain.count} entries)`);

  return { persisted: true, sessionId, packet, file, gate: gateResult, hfe: hfeResult, attempts: attempt };
}

module.exports = { runLoop };
