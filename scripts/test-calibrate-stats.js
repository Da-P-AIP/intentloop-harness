#!/usr/bin/env node
"use strict";
// Minimal unit tests for the stats utilities exported by calibrate.js.
// Run: node scripts/test-calibrate-stats.js

const assert = require("assert");
const { mean, stdDev, axisStats } = require("./calibrate");
const gate = require("../packages/core/gate");

let pass = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok  - ${name}`); pass++; }
  catch (e) { console.log(`  FAIL- ${name}: ${e.message}`); process.exitCode = 1; }
}

const EPS = 1e-10;

// ── mean ──────────────────────────────────────────────────────────────────────
check("mean([1, 2, 3]) = 2", () => {
  assert.ok(Math.abs(mean([1, 2, 3]) - 2) < EPS);
});

check("mean([]) = NaN", () => {
  assert.ok(Number.isNaN(mean([])));
});

check("mean([5]) = 5", () => {
  assert.ok(Math.abs(mean([5]) - 5) < EPS);
});

// ── stdDev ────────────────────────────────────────────────────────────────────
check("stdDev([x]) = 0 (single element)", () => {
  assert.strictEqual(stdDev([42]), 0);
});

check("stdDev([0, 0, 0]) = 0", () => {
  assert.ok(Math.abs(stdDev([0, 0, 0])) < EPS);
});

check("stdDev([0, 1]) = 0.5 (population std)", () => {
  // population std: sqrt(((0-0.5)^2 + (1-0.5)^2) / 2) = sqrt(0.25) = 0.5
  assert.ok(Math.abs(stdDev([0, 1]) - 0.5) < EPS);
});

check("stdDev([2, 4, 4, 4, 5, 5, 7, 9]) = 2 (textbook example)", () => {
  // Wikipedia population std example
  assert.ok(Math.abs(stdDev([2, 4, 4, 4, 5, 5, 7, 9]) - 2) < EPS);
});

// ── axisStats ─────────────────────────────────────────────────────────────────
check("axisStats: mean/std/min/max over 3 vectors", () => {
  const vecs = [
    { accuracy: 0.80 },
    { accuracy: 0.90 },
    { accuracy: 0.85 },
  ];
  const st = axisStats(vecs, "accuracy");
  assert.ok(Math.abs(st.mean - mean([0.80, 0.90, 0.85])) < EPS);
  assert.ok(Math.abs(st.std  - stdDev([0.80, 0.90, 0.85])) < EPS);
  assert.ok(Math.abs(st.min  - 0.80) < EPS);
  assert.ok(Math.abs(st.max  - 0.90) < EPS);
});

check("axisStats: axis missing from all vectors → all NaN", () => {
  const vecs = [{ accuracy: 0.8 }, { accuracy: 0.9 }];
  const st = axisStats(vecs, "divergence");
  assert.ok(Number.isNaN(st.mean));
  assert.ok(Number.isNaN(st.std));
  assert.ok(Number.isNaN(st.min));
  assert.ok(Number.isNaN(st.max));
});

check("axisStats: axis present in subset of vectors → uses available values", () => {
  // Only one vector has divergence; std should be 0.
  const vecs = [{ accuracy: 0.8, divergence: 0.35 }, { accuracy: 0.9 }];
  const st = axisStats(vecs, "divergence");
  assert.ok(Math.abs(st.mean - 0.35) < EPS);
  assert.strictEqual(st.std, 0);
  assert.ok(Math.abs(st.min - 0.35) < EPS);
  assert.ok(Math.abs(st.max - 0.35) < EPS);
});

check("axisStats: single vector with defined axis → std = 0", () => {
  const st = axisStats([{ risk: 0.20 }], "risk");
  assert.ok(Math.abs(st.mean - 0.20) < EPS);
  assert.strictEqual(st.std, 0);
});

// ── gate on averaged vector ───────────────────────────────────────────────────
const policy = gate.loadPolicy();

check("gate.evaluate passes a clearly-good averaged vector", () => {
  const avg = { accuracy: 0.90, consistency: 0.85, risk: 0.20, divergence: 0.40 };
  assert.strictEqual(gate.evaluate(avg, policy).passed, true);
});

check("gate.evaluate rejects averaged vector with high risk", () => {
  const avg = { accuracy: 0.90, consistency: 0.85, risk: 0.50, divergence: 0.40 };
  assert.strictEqual(gate.evaluate(avg, policy).passed, false);
});

check("gate.evaluate rejects averaged vector with divergence above max", () => {
  const avg = { accuracy: 0.90, consistency: 0.85, risk: 0.20, divergence: 0.50 };
  assert.strictEqual(gate.evaluate(avg, policy).passed, false);
});

check("averaging two vectors produces expected midpoint", () => {
  const v1 = { accuracy: 0.80, consistency: 0.75, risk: 0.30, divergence: 0.45 };
  const v2 = { accuracy: 0.90, consistency: 0.85, risk: 0.10, divergence: 0.35 };
  const avg = {};
  for (const axis of ["accuracy", "consistency", "risk", "divergence"]) {
    avg[axis] = mean([v1[axis], v2[axis]]);
  }
  assert.ok(Math.abs(avg.accuracy    - 0.85) < EPS);
  assert.ok(Math.abs(avg.consistency - 0.80) < EPS);
  assert.ok(Math.abs(avg.risk        - 0.20) < EPS);
  assert.ok(Math.abs(avg.divergence  - 0.40) < EPS);
  // avg should pass the gate (0.85/0.80/0.20/0.40 all within bounds)
  assert.strictEqual(gate.evaluate(avg, policy).passed, true);
});

console.log(`\n${pass} checks passed.`);
