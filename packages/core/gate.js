"use strict";
// HFE quality gate. Reads hard thresholds from reactor/loop-policy.json
// (procedural memory) — never hard-coded. Pass requires ALL of:
//   risk <= risk_max  AND  consistency >= consistency_min  AND  accuracy >= accuracy_min

const fs = require("fs");
const path = require("path");

const POLICY_FILE = path.resolve(__dirname, "..", "..", "reactor", "loop-policy.json");

function loadPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_FILE, "utf-8"));
}

// vector: { accuracy, consistency, risk, [divergence], ... }
function evaluate(vector, policy) {
  const g = (policy || loadPolicy()).gate;
  const reasons = [];
  const checks = [
    ["risk", vector.risk <= g.risk_max, `risk ${fmt(vector.risk)} <= ${g.risk_max}`],
    ["consistency", vector.consistency >= g.consistency_min, `consistency ${fmt(vector.consistency)} >= ${g.consistency_min}`],
    ["accuracy", vector.accuracy >= g.accuracy_min, `accuracy ${fmt(vector.accuracy)} >= ${g.accuracy_min}`],
  ];
  // Applied only when policy defines divergence_max AND the vector provides the axis.
  // Skipping either keeps backward compat with old policy files and mock vectors.
  if (g.divergence_max !== undefined && vector.divergence !== undefined) {
    checks.push(["divergence", vector.divergence <= g.divergence_max, `divergence ${fmt(vector.divergence)} <= ${g.divergence_max}`]);
  }
  for (const [, ok, msg] of checks) reasons.push(`${ok ? "PASS" : "FAIL"}: ${msg}`);
  const passed = checks.every(([, ok]) => ok);
  const thresholds = { risk_max: g.risk_max, consistency_min: g.consistency_min, accuracy_min: g.accuracy_min };
  if (g.divergence_max !== undefined) thresholds.divergence_max = g.divergence_max;
  return { passed, thresholds, reasons };
}

function fmt(n) {
  return Number(n).toFixed(3);
}

// Returns { triggered: boolean, matchedKeyword: string|null }.
// Matches case-insensitively against all keywords in policy.safety.danger_keywords.
// If the list is absent or empty, returns triggered=false (backward compat).
function checkDangerKeywords(text, policy) {
  const p = policy || loadPolicy();
  const keywords =
    p.safety && Array.isArray(p.safety.danger_keywords) ? p.safety.danger_keywords : [];
  if (keywords.length === 0 || !text) return { triggered: false, matchedKeyword: null };
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      return { triggered: true, matchedKeyword: kw };
    }
  }
  return { triggered: false, matchedKeyword: null };
}

module.exports = { evaluate, checkDangerKeywords, loadPolicy, POLICY_FILE };
