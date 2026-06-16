#!/usr/bin/env node
"use strict";
// Focused checks for the parts mock-HFE can't exercise on its own.
// Proves DoD #2 (gate rejects below-threshold) and schema rejection, without
// depending on the mock engine producing a failing vector.

const assert = require("assert");
const gate = require("../packages/core/gate");
const { validate } = require("../packages/core/schema-validate");
const packetize = require("../packages/core/packetize");
const ledger = require("../packages/core/ledger");

let pass = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok  - ${name}`); pass++; }
  catch (e) { console.log(`  FAIL- ${name}: ${e.message}`); process.exitCode = 1; }
}

const policy = gate.loadPolicy();

console.log("gate thresholds (from reactor/loop-policy.json):", policy.gate);

check("gate PASSES a clearly-good vector", () => {
  const r = gate.evaluate({ accuracy: 0.9, consistency: 0.85, risk: 0.1 }, policy);
  assert.strictEqual(r.passed, true);
});

check("gate REJECTS high risk", () => {
  const r = gate.evaluate({ accuracy: 0.9, consistency: 0.85, risk: 0.7 }, policy);
  assert.strictEqual(r.passed, false);
});

check("gate REJECTS low accuracy", () => {
  const r = gate.evaluate({ accuracy: 0.5, consistency: 0.85, risk: 0.1 }, policy);
  assert.strictEqual(r.passed, false);
});

check("gate REJECTS low consistency", () => {
  const r = gate.evaluate({ accuracy: 0.9, consistency: 0.4, risk: 0.1 }, policy);
  assert.strictEqual(r.passed, false);
});

check("gate is exactly at boundary -> pass (>= / <=)", () => {
  const g = policy.gate;
  const r = gate.evaluate({ accuracy: g.accuracy_min, consistency: g.consistency_min, risk: g.risk_max }, policy);
  assert.strictEqual(r.passed, true);
});

check("schema REJECTS a packet missing required fields", () => {
  const r = validate({ id: "x" }, packetize.loadSchema());
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.length > 0);
});

check("schema REJECTS out-of-range vector axis", () => {
  const schema = packetize.loadSchema();
  const bad = {
    id: "a", schema_version: "0.1.0", created_at: "t", session_id: "s",
    intent: "i", content: "c",
    hfe: { score: 1, vector: { accuracy: 1.5, consistency: 0.9, risk: 0.1, novelty: 0.5, feasibility: 0.9, divergence: 0.4 }, source: "x", iterations_run: 1, preset: "default" },
    gate: { passed: true, thresholds: {}, reasons: [] },
    needs_verification: false, lineage: { prev_packet_ids: [] },
  };
  const r = validate(bad, schema);
  assert.strictEqual(r.valid, false);
});

check("ledger chain verifies intact", () => {
  const c = ledger.verifyChain();
  assert.ok(c.ok, "chain reported broken");
});

console.log(`\n${pass} checks passed.`);
