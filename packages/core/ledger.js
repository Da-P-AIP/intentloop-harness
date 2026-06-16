"use strict";
// Action Ledger (inherited from intentops-harness): hash-chained, append-only
// episodic memory. Every loop step is appended; each entry hashes the previous
// one, so tampering is detectable. Observability guardrail.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LEDGER_DIR = path.resolve(__dirname, "..", "..", "ledger");
const LEDGER_FILE = path.join(LEDGER_DIR, "ledger.jsonl");
const GENESIS = "0".repeat(64);

function ensureDir() {
  if (!fs.existsSync(LEDGER_DIR)) fs.mkdirSync(LEDGER_DIR, { recursive: true });
}

function lastEntry() {
  ensureDir();
  if (!fs.existsSync(LEDGER_FILE)) return null;
  const lines = fs.readFileSync(LEDGER_FILE, "utf-8").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[lines.length - 1]);
}

function hashEntry(entry) {
  // Hash a stable serialization of everything except the curr_hash field itself.
  const { curr_hash, ...rest } = entry;
  return crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

// Append one step. `step` is a short label (e.g. "observe", "evaluate", "gate").
function append(step, data) {
  ensureDir();
  const prev = lastEntry();
  const entry = {
    seq: prev ? prev.seq + 1 : 0,
    ts: new Date().toISOString(),
    step,
    data: data || {},
    prev_hash: prev ? prev.curr_hash : GENESIS,
  };
  entry.curr_hash = hashEntry(entry);
  fs.appendFileSync(LEDGER_FILE, JSON.stringify(entry) + "\n", "utf-8");
  return entry;
}

// Walk the chain and confirm every prev_hash/curr_hash link is intact.
function verifyChain() {
  ensureDir();
  if (!fs.existsSync(LEDGER_FILE)) return { ok: true, count: 0 };
  const lines = fs.readFileSync(LEDGER_FILE, "utf-8").trim().split(/\r?\n/).filter(Boolean);
  let expectedPrev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    const e = JSON.parse(lines[i]);
    if (e.prev_hash !== expectedPrev) return { ok: false, brokenAt: i, reason: "prev_hash mismatch" };
    if (hashEntry(e) !== e.curr_hash) return { ok: false, brokenAt: i, reason: "curr_hash mismatch" };
    expectedPrev = e.curr_hash;
  }
  return { ok: true, count: lines.length };
}

module.exports = { append, lastEntry, verifyChain, LEDGER_FILE };
