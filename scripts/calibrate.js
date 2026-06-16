#!/usr/bin/env node
"use strict";
// DoD #6: run ~5 real notes through the loop and log HFE score vs human judgement.
// Reads notes/*.md (frontmatter carries human_quality), runs each in mock mode
// (quiet), and writes a calibration table to ledger/calibration-<ts>.md.

const fs = require("fs");
const path = require("path");
const { runLoop } = require("../packages/core/intentloop");

const NOTES_DIR = path.resolve(__dirname, "..", "notes");
const OUT_DIR   = path.resolve(__dirname, "..", "ledger");

// ── Mock-fallback detection ───────────────────────────────────────────────────
// axis-hfe's mock LLM produces a fixed vector and templated Japanese content.
// These constants are observed from axis-hfe mock output; update here if the
// mock implementation changes upstream.
const MOCK_VECTOR_CONSTANTS = {
  accuracy:    0.862625,
  consistency: 0.9579375,
  risk:        0.163203125,
};
// Template tags that may appear in axis-hfe mock content.
// NOTE: these also appear in real HFE pipeline stage labels (Gemini output) and can
// bleed into continuity context from prior packets — do NOT use for isMock decisions.
// Kept here only as auxiliary display hints.
const MOCK_CONTENT_TAGS = ["[非線形合成", "[自己修正"];
// Tolerance for floating-point comparison (1e-6 << the mock values' precision)
const MOCK_TOLERANCE = 1e-6;

/**
 * Returns { isMock, reasons[], aux[] } for a single hfeResult object.
 *
 * Decisive signals (contribute to isMock):
 *   (2) The 3 gating axes match known mock constants within MOCK_TOLERANCE
 *
 * Signal (3) — cross-note identical score — is applied after all notes are
 * collected; see the post-loop block in main().
 *
 * Auxiliary hints (display only, NOT decisive):
 *   (1) Content contains axis-hfe mock template tags — also present in real HFE
 *       pipeline stage labels and in continuity context from prior packets, so
 *       cannot distinguish mock from real without vector confirmation.
 */
function detectMockFallback(hfeResult) {
  const content = hfeResult.best?.content ?? "";
  const v       = hfeResult.best?.vector  ?? {};
  const reasons = [];
  const aux     = [];

  // Signal (1): template tag in content — auxiliary only, not decisive
  const tagHit = MOCK_CONTENT_TAGS.find((tag) => content.includes(tag));
  if (tagHit) aux.push(`content tag "${tagHit}" (not decisive)`);

  // Signal (2): gating axes ≈ mock constants — decisive
  const accClose  = Math.abs((v.accuracy    ?? NaN) - MOCK_VECTOR_CONSTANTS.accuracy)    < MOCK_TOLERANCE;
  const consClose = Math.abs((v.consistency ?? NaN) - MOCK_VECTOR_CONSTANTS.consistency) < MOCK_TOLERANCE;
  const riskClose = Math.abs((v.risk        ?? NaN) - MOCK_VECTOR_CONSTANTS.risk)        < MOCK_TOLERANCE;
  if (accClose && consClose && riskClose) {
    reasons.push(
      `vector ≈ mock constants (acc=${MOCK_VECTOR_CONSTANTS.accuracy}, ` +
      `cons=${MOCK_VECTOR_CONSTANTS.consistency}, risk=${MOCK_VECTOR_CONSTANTS.risk})`
    );
  }

  return { isMock: reasons.length > 0, reasons, aux };
}

// ── Utilities ─────────────────────────────────────────────────────────────────
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith(".md")).sort();

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

  // Inter-note delay (rate-limit guard).
  // Priority: --delay <ms> CLI flag > CALIBRATE_DELAY_MS env var > default.
  // Default is 0 for mock (no API) and 4000 ms for real providers.
  const delayFlagIdx = argv.indexOf("--delay");
  const DELAY_MS = (() => {
    if (delayFlagIdx !== -1 && argv[delayFlagIdx + 1]) return Number(argv[delayFlagIdx + 1]);
    if (process.env.CALIBRATE_DELAY_MS) return Number(process.env.CALIBRATE_DELAY_MS);
    return provider === "mock" ? 0 : 4000;
  })();

  // Mock-fallback detection is meaningful only when the intent is to use a real
  // provider. When provider=mock, mock output is expected and is NOT flagged.
  const detectFallback = provider !== "mock";

  const rows = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(NOTES_DIR, f), "utf-8"));
    const human = meta.human_quality !== undefined ? Number(meta.human_quality) : null;
    process.stdout.write(`running ${f} ... `);

    const r = await runLoop({ note: body, provider, quiet: true, sessionId: `calib_${f}` });
    const v = r.hfe.best.vector;

    // Per-note mock-fallback check (signals 2; signal 1 aux-only)
    let isMock = false;
    let mockReasons = [];
    let mockAux = [];
    if (detectFallback) {
      const det = detectMockFallback(r.hfe);
      isMock      = det.isMock;
      mockReasons = det.reasons;
      mockAux     = det.aux ?? [];
    }

    rows.push({
      file: f,
      human,
      score:       r.hfe.best.score,
      accuracy:    v.accuracy,
      consistency: v.consistency,
      risk:        v.risk,
      passed:      r.gate.passed,
      persisted:   r.persisted,
      isMock,
      mockReasons,
      mockAux,
    });

    const statusLabel = r.persisted ? "PERSISTED" : "REJECTED";
    const mockSuffix  = isMock ? " ⚠ MOCK-FALLBACK" : "";
    console.log(
      `${statusLabel} (acc=${v.accuracy.toFixed(2)} cons=${v.consistency.toFixed(2)} risk=${v.risk.toFixed(2)})${mockSuffix}`
    );
    if (isMock) {
      console.warn(`  ⚠ MOCK-FALLBACK detected on ${f}: ${mockReasons.join("; ")}`);
    }
    if (!isMock && mockAux.length > 0) {
      console.log(`  aux (non-decisive): ${mockAux.join("; ")}`);
    }

    // Inter-note sleep — skip after the last note
    if (i < files.length - 1 && DELAY_MS > 0) {
      process.stdout.write(`  [rate-limit guard] sleeping ${DELAY_MS} ms before next note...\n`);
      await sleep(DELAY_MS);
    }
  }

  // Signal (3): cross-note identical score — catches mock fallback variants that
  // evade signals (1) and (2). Exact float equality of `score` across distinct
  // notes is essentially impossible with a real LLM.
  if (detectFallback) {
    const scoreGroups = new Map();
    for (const row of rows) {
      if (!scoreGroups.has(row.score)) scoreGroups.set(row.score, []);
      scoreGroups.get(row.score).push(row.file);
    }
    for (const row of rows) {
      if (!row.isMock) {
        const dupes = scoreGroups.get(row.score) ?? [];
        if (dupes.length > 1) {
          const others = dupes.filter((f) => f !== row.file).join(", ");
          const reason = `score ${row.score} identical to ${others}`;
          row.isMock = true;
          row.mockReasons = [...row.mockReasons, reason];
          console.warn(`  ⚠ MOCK-FALLBACK detected on ${row.file} (cross-note identity): ${reason}`);
        }
      }
    }
  }

  // ── Build calibration markdown ─────────────────────────────────────────────
  const mockExcluded = rows.filter((r) => r.isMock);
  const totalNotes   = rows.length;
  const excludedCount = mockExcluded.length;
  const validCount   = totalNotes - excludedCount;

  let md = `# HFE vs Human Calibration — ${new Date().toISOString()}\n\n`;
  md += `provider: \`${provider}\`\n\n`;

  if (mockExcluded.length > 0) {
    md += `> ⚠ **Mock-fallback detected** on ${excludedCount} note(s):\n`;
    for (const r of mockExcluded) {
      md += `> - \`${r.file}\` — ${r.mockReasons.join("; ")}\n`;
    }
    md += `>\n> These notes are **excluded** from the gate/human agreement metric.\n\n`;
  }

  md += `| note | human | HFE acc | cons | risk | gate | persisted | human says keep | agree | mock? |\n`;
  md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

  let agree = 0;
  let counted = 0;
  for (const r of rows) {
    const humanKeep = r.human === null ? null : r.human >= 0.6;
    let agreeCell;
    if (r.isMock) {
      agreeCell = "—";
    } else if (humanKeep === null) {
      agreeCell = "";
    } else {
      const matched = humanKeep === r.persisted;
      agreeCell = matched ? "✓" : "✗";
      counted++;
      if (matched) agree++;
    }
    const mockCell = r.isMock ? "⚠ mock" : "";
    md +=
      `| ${r.file}` +
      ` | ${r.human ?? "?"}` +
      ` | ${r.accuracy.toFixed(2)}` +
      ` | ${r.consistency.toFixed(2)}` +
      ` | ${r.risk.toFixed(2)}` +
      ` | ${r.passed ? "PASS" : "FAIL"}` +
      ` | ${r.persisted ? "yes" : "no"}` +
      ` | ${humanKeep === null ? "?" : humanKeep ? "yes" : "no"}` +
      ` | ${agreeCell}` +
      ` | ${mockCell} |\n`;
  }

  const rate = counted ? agree / counted : 0;
  md += `\n**${totalNotes}本中${validCount}本が有効（${excludedCount}本はmockフォールバックのため除外）**\n\n`;
  md += `**Gate/human agreement（有効サンプルのみ）: ${agree}/${counted} = ${(rate * 100).toFixed(0)}%**`;
  md += ` (target ${rate >= 0.8 ? "MET" : "not met"}: 80%)\n`;
  md += `\n> Note: in \`mock\` mode HFE content is templated, so absolute scores are illustrative. `;
  md += `The calibration that matters runs with \`--provider anthropic\` on real notes.\n`;

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `calibration-${Date.now()}.md`);
  fs.writeFileSync(outFile, md, "utf-8");

  console.log(`\ncalibration log -> ${outFile}`);
  console.log(`${totalNotes}本中${validCount}本が有効（${excludedCount}本はmockフォールバックのため除外）`);
  console.log(`gate/human agreement（有効サンプルのみ）: ${agree}/${counted} = ${(rate * 100).toFixed(0)}%`);
}

main().catch((e) => { console.error(e); process.exit(1); });
