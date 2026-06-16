"use strict";
// Wire #2: turn an evaluated, gate-passed result into a schema-valid
// AxisThoughtPacket (ATP) and persist it to packets/. Next session's Observe
// step reads recent packets for continuity.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validate } = require("./schema-validate");

const PACKETS_DIR = path.resolve(__dirname, "..", "..", "packets");
const SCHEMA_FILE = path.resolve(__dirname, "..", "..", "schema", "thought-packet.schema.json");
const SCHEMA_VERSION = "0.1.0";

function ensureDir() {
  if (!fs.existsSync(PACKETS_DIR)) fs.mkdirSync(PACKETS_DIR, { recursive: true });
}

function loadSchema() {
  return JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf-8"));
}

// Read the most recent N packets (by created_at) for the Observe step.
function loadRecent(limit = 3) {
  ensureDir();
  const files = fs.readdirSync(PACKETS_DIR).filter((f) => f.endsWith(".json"));
  const packets = files.map((f) => JSON.parse(fs.readFileSync(path.join(PACKETS_DIR, f), "utf-8")));
  packets.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return packets.slice(0, limit);
}

// Build an ATP from the gate-passed HFE result. Does NOT write — caller validates first.
function build({ sessionId, intent, sourceNote, hfeResult, gateResult, policy, prevPacketIds }) {
  const best = hfeResult.best;
  const flagged = (policy.verification.flag_sources || []).includes(best.source);
  const id = `atp_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  return {
    id,
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    session_id: sessionId,
    intent,
    content: best.content,
    source_note: sourceNote || "",
    hfe: {
      score: best.score,
      vector: best.vector,
      source: best.source,
      iterations_run: hfeResult.iterations_run,
      preset: hfeResult.preset,
    },
    gate: gateResult,
    // Verify-before-trust: fused/jumped/self-corrected output is not durable-trusted yet.
    needs_verification: flagged,
    lineage: { prev_packet_ids: prevPacketIds || [] },
  };
}

// Validate against schema and write packets/<id>.json. Throws if invalid.
function persist(packet) {
  ensureDir();
  const { valid, errors } = validate(packet, loadSchema());
  if (!valid) {
    throw new Error("ATP failed schema validation:\n  " + errors.join("\n  "));
  }
  const file = path.join(PACKETS_DIR, `${packet.id}.json`);
  fs.writeFileSync(file, JSON.stringify(packet, null, 2), "utf-8");
  return file;
}

module.exports = { build, persist, loadRecent, validate, loadSchema, PACKETS_DIR };
