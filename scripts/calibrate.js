#!/usr/bin/env node
"use strict";
// DoD #6: run ~5 real notes through the loop and log HFE score vs human judgement.
// Reads notes/*.md (frontmatter carries human_quality), runs each in mock mode
// (quiet), and writes a calibration table to ledger/calibration-<ts>.md.

const fs = require("fs");
const path = require("path");
const { runLoop } = require("../packages/core/intentloop");

const NOTES_DIR = path.resolve(__dirname, "..", "notes");
const OUT_DIR = path.resolve(__dirname, "..", "ledger");

function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2].trim() };
}

async function main() {
  const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith(".md")).sort();
  const rows = [];
  // Resolve provider robustly. Accept `--provider X`, and also a bare positional
  // token (e.g. `gemini`) so the run still works if npm swallows the `--provider`
  // flag — which happens when the `--` separator is dropped (common in PowerShell).
  const KNOWN_PROVIDERS = ["mock", "anthropic", "gemini", "openai"];
  const argv = process.argv.slice(2);
  const flagIdx = argv.indexOf("--provider");
  let provider = "mock";
  if (flagIdx !== -1 && argv[flagIdx + 1]) {
    provider = argv[flagIdx + 1];
  } else {
    const bare = argv.find((a) => KNOWN_PROVIDERS.includes(a));
    if (bare) provider = bare;
  }

  for (const f of files) {
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(NOTES_DIR, f), "utf-8"));
    const human = meta.human_quality !== undefined ? Number(meta.human_quality) : null;
    process.stdout.write(`running ${f} ... `);
    const r = await runLoop({ note: body, provider, quiet: true, sessionId: `calib_${f}` });
    const v = r.hfe.best.vector;
    rows.push({
      file: f,
      human,
      score: r.hfe.best.score,
      accuracy: v.accuracy,
      consistency: v.consistency,
      risk: v.risk,
      passed: r.gate.passed,
      persisted: r.persisted,
    });
    console.log(`${r.persisted ? "PERSISTED" : "REJECTED"} (acc=${v.accuracy.toFixed(2)} cons=${v.consistency.toFixed(2)} risk=${v.risk.toFixed(2)})`);
  }

  // Build markdown table + a crude agreement metric (gate pass vs human>=0.6).
  let md = `# HFE vs Human Calibration — ${new Date().toISOString()}\n\n`;
  md += `provider: \`${provider}\`\n\n`;
  md += `| note | human | HFE acc | cons | risk | gate | persisted | human says keep | agree |\n`;
  md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  let agree = 0;
  let counted = 0;
  for (const r of rows) {
    const humanKeep = r.human === null ? null : r.human >= 0.6;
    const ok = humanKeep === null ? "" : humanKeep === r.persisted ? "✓" : "✗";
    if (humanKeep !== null) { counted++; if (humanKeep === r.persisted) agree++; }
    md += `| ${r.file} | ${r.human ?? "?"} | ${r.accuracy.toFixed(2)} | ${r.consistency.toFixed(2)} | ${r.risk.toFixed(2)} | ${r.passed ? "PASS" : "FAIL"} | ${r.persisted ? "yes" : "no"} | ${humanKeep === null ? "?" : humanKeep ? "yes" : "no"} | ${ok} |\n`;
  }
  const rate = counted ? (agree / counted) : 0;
  md += `\n**Gate/human agreement: ${agree}/${counted} = ${(rate * 100).toFixed(0)}%** (target ${rate >= 0.8 ? "MET" : "not met"}: 80%)\n`;
  md += `\n> Note: in \`mock\` mode HFE content is templated, so absolute scores are illustrative. `;
  md += `The calibration that matters runs with \`--provider anthropic\` on real notes.\n`;

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `calibration-${Date.now()}.md`);
  fs.writeFileSync(outFile, md, "utf-8");
  console.log(`\ncalibration log -> ${outFile}`);
  console.log(`gate/human agreement: ${agree}/${counted} = ${(rate * 100).toFixed(0)}%`);
}

main().catch((e) => { console.error(e); process.exit(1); });
