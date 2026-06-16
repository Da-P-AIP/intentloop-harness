#!/usr/bin/env node
"use strict";
// CLI for Milestone 1: take one source note -> HFE score -> gate -> ATP.
// Usage:
//   node bin/intentloop.js --note "some idea text"
//   node bin/intentloop.js --file notes/01-cache-across-sessions.md
//   node bin/intentloop.js --note "..." --provider anthropic

const fs = require("fs");
const { runLoop } = require("../packages/core/intentloop");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { args[key] = next; i++; }
      else args[key] = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let note = args.note;
  if (args.file) note = fs.readFileSync(args.file, "utf-8").trim();
  if (!note || note === true) {
    console.error("usage: node bin/intentloop.js --note \"text\" | --file path [--provider mock|anthropic|ollama]");
    process.exit(1);
  }
  try {
    const result = await runLoop({
      note,
      intent: args.intent,
      provider: args.provider,
      sessionId: args.session,
    });
    console.log(`\n=== result: ${result.persisted ? "PERSISTED " + result.packet.id : "REJECTED"} (${result.attempts} attempt(s)) ===`);
  } catch (e) {
    console.error(`\n[error] ${e.message}`);
    process.exit(1);
  }
}

main();
