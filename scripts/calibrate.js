#!/usr/bin/env node
"use strict";
// DoD #6: run ~5 real notes through the loop and log HFE score vs human judgement.
// Reads notes/*.md (frontmatter carries human_quality), runs each in mock mode
// (quiet), and writes a calibration table to ledger/calibration-<ts>.md.
//
// Multi-run averaging mode (--runs N / --samples N / CALIBRATE_RUNS=N):
//   Each note is evaluated N times; the 6-axis vectors are averaged.
//   Gate judgment uses the averaged vector, not any single run.
//   Per-run mock-fallback detection excludes bad runs from the average.

const fs   = require("fs");
const path = require("path");
const { runLoop } = require("../packages/core/intentloop");
const gate = require("../packages/core/gate");

const NOTES_DIR = path.resolve(__dirname, "..", "notes");
const OUT_DIR   = path.resolve(__dirname, "..", "ledger");
const AXES = ["accuracy", "consistency", "risk", "novelty", "feasibility", "divergence"];

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

// ── Stats utilities (exported for tests) ─────────────────────────────────────

/** Arithmetic mean. Returns NaN for empty array. */
function mean(arr) {
  if (arr.length === 0) return NaN;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

/** Population standard deviation. Returns 0 for single-element array. */
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

/** Per-axis stats over an array of vector objects. Skips undefined/NaN values. */
function axisStats(vectors, axis) {
  const vals = vectors.map((v) => v[axis] ?? NaN).filter((x) => !Number.isNaN(x));
  if (vals.length === 0) return { mean: NaN, std: NaN, min: NaN, max: NaN };
  return {
    mean: mean(vals),
    std:  stdDev(vals),
    min:  Math.min(...vals),
    max:  Math.max(...vals),
  };
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

// Fixed-width format helpers
const f2 = (x) => (x !== undefined && !Number.isNaN(x) ? Number(x).toFixed(2) : "—");
const f3 = (x) => (x !== undefined && !Number.isNaN(x) ? Number(x).toFixed(3) : "—");
const f4 = (x) => (x !== undefined && !Number.isNaN(x) ? Number(x).toFixed(4) : "—");

// Compute averaged vector + per-axis stats from an array of run objects.
function computeAvg(runs, axes) {
  const avgVector = {};
  const stats = {};
  for (const axis of axes) {
    const vals = runs.map((r) => r.vector[axis]).filter((x) => x !== undefined && !Number.isNaN(x));
    avgVector[axis] = vals.length > 0 ? mean(vals) : undefined;
    stats[axis] = axisStats(runs.map((r) => r.vector), axis);
  }
  return { avgVector, stats };
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

  // Inter-call delay (rate-limit guard).
  // Priority: --delay <ms> CLI flag > CALIBRATE_DELAY_MS env var > default.
  // Default is 0 for mock (no API) and 4000 ms for real providers.
  const delayFlagIdx = argv.indexOf("--delay");
  const DELAY_MS = (() => {
    if (delayFlagIdx !== -1 && argv[delayFlagIdx + 1]) return Number(argv[delayFlagIdx + 1]);
    if (process.env.CALIBRATE_DELAY_MS) return Number(process.env.CALIBRATE_DELAY_MS);
    return provider === "mock" ? 0 : 4000;
  })();

  // --runs N / --samples N / CALIBRATE_RUNS env var (default 1 = single-run mode).
  const runsFlagIdx = argv.findIndex((a) => a === "--runs" || a === "--samples");
  const NUM_RUNS = (() => {
    if (runsFlagIdx !== -1 && argv[runsFlagIdx + 1]) {
      const n = parseInt(argv[runsFlagIdx + 1], 10);
      return Number.isFinite(n) && n >= 1 ? n : 1;
    }
    if (process.env.CALIBRATE_RUNS) {
      const n = parseInt(process.env.CALIBRATE_RUNS, 10);
      return Number.isFinite(n) && n >= 1 ? n : 1;
    }
    return 1;
  })();

  const multiRunMode = NUM_RUNS > 1;
  // Mock-fallback detection is meaningful only when the intent is to use a real
  // provider. When provider=mock, mock output is expected and is NOT flagged.
  const detectFallback = provider !== "mock";

  // Load policy early so per-note summary can evaluate the gate inline.
  const policy = gate.loadPolicy();

  if (multiRunMode) {
    console.log(`[multi-run] N=${NUM_RUNS} runs/note  provider=${provider}  delay=${DELAY_MS}ms\n`);
  }

  // ── Data collection ───────────────────────────────────────────────────────
  // noteData[i] = { file, human, runs: [{score, vector, isMock, mockReasons, mockAux, persisted}], rteCount }
  const noteData = [];
  let rteFailTotal = 0;
  let callCount = 0;  // tracks total LLM calls made; drives inter-call sleep

  for (let ni = 0; ni < files.length; ni++) {
    const f = files[ni];
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(NOTES_DIR, f), "utf-8"));
    const human = meta.human_quality !== undefined ? Number(meta.human_quality) : null;

    if (!multiRunMode) {
      process.stdout.write(`running ${f} ... `);
    } else {
      console.log(`── ${f} ──`);
    }

    const runs = [];
    let rteCount = 0;

    for (let ri = 0; ri < NUM_RUNS; ri++) {
      // Inter-call sleep — applied before every call except the very first one.
      // This replaces the original inter-note sleep: for N=1 the cadence is
      // identical (N_notes - 1 sleeps); for N>1 it guards every individual call.
      if (callCount > 0 && DELAY_MS > 0) {
        process.stdout.write(`  [rate-limit guard] sleeping ${DELAY_MS} ms before next call...\n`);
        await sleep(DELAY_MS);
      }
      callCount++;

      if (multiRunMode) process.stdout.write(`  [run ${ri + 1}/${NUM_RUNS}] `);

      let r;
      try {
        r = await runLoop({
          note: body,
          provider,
          quiet: true,
          // Unique sessionId per run prevents continuity bleed across runs.
          sessionId: multiRunMode ? `calib_${f}_run${ri}` : `calib_${f}`,
        });
      } catch (err) {
        rteCount++;
        rteFailTotal++;
        console.warn(`ERROR: ${err.message} — skipping this run`);
        continue;
      }

      const v = r.hfe.best.vector;
      let isMock = false;
      let mockReasons = [];
      let mockAux = [];

      if (detectFallback) {
        const det = detectMockFallback(r.hfe);
        isMock      = det.isMock;
        mockReasons = det.reasons;
        mockAux     = det.aux ?? [];
      }

      runs.push({ score: r.hfe.best.score, vector: v, isMock, mockReasons, mockAux, persisted: r.persisted });

      if (!multiRunMode) {
        // Single-run mode: preserve existing console output format exactly.
        const mockSuffix = isMock ? " ⚠ MOCK-FALLBACK" : "";
        console.log(
          `${r.persisted ? "PERSISTED" : "REJECTED"} (acc=${v.accuracy.toFixed(2)} cons=${v.consistency.toFixed(2)} risk=${v.risk.toFixed(2)})${mockSuffix}`
        );
        if (isMock) {
          console.warn(`  ⚠ MOCK-FALLBACK detected on ${f}: ${mockReasons.join("; ")}`);
        }
        if (!isMock && mockAux.length > 0) {
          console.log(`  aux (non-decisive): ${mockAux.join("; ")}`);
        }
      } else {
        // Multi-run mode: compact per-run line.
        const mockLabel = isMock ? " ⚠MOCK" : "";
        const divStr    = v.divergence !== undefined ? ` div=${v.divergence.toFixed(2)}` : "";
        console.log(
          `${r.gate.passed ? "PASS" : "FAIL"} (acc=${v.accuracy.toFixed(2)} cons=${v.consistency.toFixed(2)} risk=${v.risk.toFixed(2)}${divStr})${mockLabel}`
        );
        if (isMock && mockReasons.length > 0) console.warn(`         ⚠ ${mockReasons.join("; ")}`);
        if (!isMock && mockAux.length > 0)    console.log(`         aux: ${mockAux.join("; ")}`);
      }
    }

    // Per-note summary line printed immediately after all N runs (signal 2 applied;
    // signal 3 cross-note check has not run yet, so this is "preliminary" for real
    // providers — in practice cross-note fires only when every note produces the same
    // mock score, so the preliminary is final for all real-provider scenarios).
    if (multiRunMode) {
      const prelimValid = detectFallback ? runs.filter((r) => !r.isMock) : runs;
      if (prelimValid.length === 0) {
        const rteStr  = rteCount > 0 ? `${rteCount} RTE, ` : "";
        const mockStr = runs.length > 0 ? `${runs.length} mock` : "0 completed";
        console.log(`  → no valid runs (${rteStr}${mockStr})\n`);
      } else {
        const { avgVector, stats } = computeAvg(prelimValid, AXES);
        const gResult = gate.evaluate(avgVector, policy);
        const av = avgVector;
        const st = stats;
        const divStr = av.divergence !== undefined && !Number.isNaN(av.divergence)
          ? ` div=${f2(av.divergence)}±${f3(st.divergence?.std)}`
          : "";
        const mockCount = runs.length - prelimValid.length;
        console.log(
          `  → avg: acc=${f2(av.accuracy)}±${f3(st.accuracy?.std)}` +
          ` cons=${f2(av.consistency)}±${f3(st.consistency?.std)}` +
          ` risk=${f2(av.risk)}±${f3(st.risk?.std)}${divStr}` +
          `  [${prelimValid.length}/${runs.length} valid]  ${gResult.passed ? "PERSISTED" : "REJECTED"}`
        );
        if (rteCount  > 0) console.warn(`  ⚠ ${rteCount} run(s) skipped (RuntimeError)`);
        if (mockCount > 0) console.warn(`  ⚠ ${mockCount} run(s) excluded (mock-fallback)`);
        console.log("");
      }
    }

    noteData.push({ file: f, human, runs, rteCount });
  }

  // ── Cross-note identity check (signal 3) ─────────────────────────────────
  // Exact float equality of `score` across distinct notes is essentially
  // impossible with a real LLM. Applied per individual run across all notes.
  if (detectFallback) {
    const scoreMap = new Map();
    for (const nd of noteData) {
      for (const run of nd.runs) {
        if (!scoreMap.has(run.score)) scoreMap.set(run.score, []);
        scoreMap.get(run.score).push(nd.file);
      }
    }
    for (const nd of noteData) {
      for (const run of nd.runs) {
        if (!run.isMock) {
          const allFiles = scoreMap.get(run.score) ?? [];
          const others   = [...new Set(allFiles.filter((g) => g !== nd.file))];
          if (others.length > 0) {
            const reason = `score ${run.score} identical to ${others.join(", ")}`;
            run.isMock      = true;
            run.mockReasons = [...run.mockReasons, reason];
            if (!multiRunMode) {
              console.warn(`  ⚠ MOCK-FALLBACK detected on ${nd.file} (cross-note identity): ${reason}`);
            } else {
              // In multi-run mode, the per-note summary was already printed as
              // preliminary. Warn that a run was retroactively flagged.
              console.warn(`  ⚠ [post-hoc] cross-note mock on ${nd.file}: ${reason}`);
            }
          }
        }
      }
    }
  }

  // ── Compute final per-note rows ───────────────────────────────────────────
  const rows = [];

  for (const nd of noteData) {
    const allRuns    = nd.runs;
    const validRuns  = allRuns.filter((r) => !r.isMock);
    const totalRuns  = allRuns.length;    // completed (non-RTE) runs
    const validCount = validRuns.length;

    // isMockNote: only meaningful for real providers; all completed runs were mock.
    const isMockNote = detectFallback && validCount === 0 && totalRuns > 0;

    // Runs that contribute to the average:
    //   real provider → mock-excluded valid runs only
    //   mock provider → all completed runs (mock detection is disabled)
    const runsToAvg = detectFallback ? validRuns : allRuns;

    let avgVector = null;
    let stats     = {};
    let passed    = false;
    let persisted = false;

    if (runsToAvg.length > 0) {
      ({ avgVector, stats } = computeAvg(runsToAvg, AXES));

      // Gate on the averaged vector (the key invariant of multi-run mode).
      passed = gate.evaluate(avgVector, policy).passed;
      if (multiRunMode) {
        persisted = passed;
      } else {
        // Single-run backward compat: use the actual persisted flag from runLoop.
        persisted = runsToAvg[0].persisted;
      }
    }

    const allMockReasons = [...new Set(allRuns.filter((r) => r.isMock).flatMap((r) => r.mockReasons))];
    const allMockAux     = [...new Set(allRuns.flatMap((r) => r.mockAux ?? []))];

    rows.push({
      file: nd.file, human: nd.human,
      avgVector, stats, passed, persisted,
      isMock: isMockNote, mockReasons: allMockReasons, mockAux: allMockAux,
      totalRuns, validCount, rteCount: nd.rteCount,
    });
  }

  // ── Build calibration markdown ─────────────────────────────────────────────
  const mockExcluded   = rows.filter((r) => r.isMock);
  const totalNotes     = rows.length;
  const excludedCount  = mockExcluded.length;
  const validNoteCount = totalNotes - excludedCount;

  let md = `# HFE vs Human Calibration — ${new Date().toISOString()}\n\n`;
  md += `provider: \`${provider}\``;
  if (multiRunMode) md += `  |  runs per note: **${NUM_RUNS}**`;
  md += `\n\n`;

  if (rteFailTotal > 0) {
    md += `> ⚠ **${rteFailTotal} run(s) failed with RuntimeError** (skipped; not included in averages).\n\n`;
  }

  if (mockExcluded.length > 0) {
    md += `> ⚠ **Mock-fallback detected** on ${excludedCount} note(s):\n`;
    for (const r of mockExcluded) {
      md += `> - \`${r.file}\` — ${r.mockReasons.join("; ")}\n`;
    }
    md += `>\n> These notes are **excluded** from the gate/human agreement metric.\n\n`;
  }

  // Main results table
  if (multiRunMode) {
    md += `| note | human | avg acc | avg cons | avg risk | avg div | gate | persisted | human says keep | agree | valid/total |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  } else {
    md += `| note | human | HFE acc | cons | risk | gate | persisted | human says keep | agree | mock? |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  }

  let agree   = 0;
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

    const av = r.avgVector ?? {};

    if (multiRunMode) {
      md +=
        `| ${r.file}` +
        ` | ${r.human ?? "?"}` +
        ` | ${f2(av.accuracy)}` +
        ` | ${f2(av.consistency)}` +
        ` | ${f2(av.risk)}` +
        ` | ${f2(av.divergence)}` +
        ` | ${r.passed ? "PASS" : "FAIL"}` +
        ` | ${r.persisted ? "yes" : "no"}` +
        ` | ${humanKeep === null ? "?" : humanKeep ? "yes" : "no"}` +
        ` | ${agreeCell}` +
        ` | ${r.isMock ? "—" : `${r.validCount}/${r.totalRuns}`} |\n`;
    } else {
      const mockCell = r.isMock ? "⚠ mock" : "";
      md +=
        `| ${r.file}` +
        ` | ${r.human ?? "?"}` +
        ` | ${f2(av.accuracy)}` +
        ` | ${f2(av.consistency)}` +
        ` | ${f2(av.risk)}` +
        ` | ${r.passed ? "PASS" : "FAIL"}` +
        ` | ${r.persisted ? "yes" : "no"}` +
        ` | ${humanKeep === null ? "?" : humanKeep ? "yes" : "no"}` +
        ` | ${agreeCell}` +
        ` | ${mockCell} |\n`;
    }
  }

  const rate = counted ? agree / counted : 0;
  md += `\n**${totalNotes}本中${validNoteCount}本が有効（${excludedCount}本はmockフォールバックのため除外）**\n\n`;
  md += `**Gate/human agreement（有効サンプルのみ）: ${agree}/${counted} = ${(rate * 100).toFixed(0)}%**`;
  md += ` (target ${rate >= 0.8 ? "MET" : "not met"}: 80%)\n`;

  // Extended stats sections — only in multi-run mode
  if (multiRunMode) {
    md += `\n---\n\n## Per-note run statistics (N=${NUM_RUNS} runs/note)\n\n`;

    for (const r of rows) {
      const attempted = NUM_RUNS;
      md += `### ${r.file}  (${r.validCount}/${r.totalRuns} valid`;
      if (r.rteCount > 0) md += `, ${r.rteCount} RTE failures`;
      md += ` out of ${attempted} attempted)\n\n`;

      if (r.validCount === 0) {
        md += `> All runs excluded (mock-fallback or RuntimeError).\n\n`;
        continue;
      }
      md += `| axis | mean | ±std | min | max |\n`;
      md += `| --- | --- | --- | --- | --- |\n`;
      for (const axis of AXES) {
        const st = r.stats[axis];
        if (!st || Number.isNaN(st.mean)) continue;
        md += `| ${axis} | ${f4(st.mean)} | ${f4(st.std)} | ${f4(st.min)} | ${f4(st.max)} |\n`;
      }
      md += `\n`;
    }

    // Divergence summary: shows distance from boundary for keep/reject discrimination.
    const divMax = policy.gate.divergence_max;
    if (divMax !== undefined) {
      md += `---\n\n## Divergence axis summary (boundary = ${divMax})\n\n`;
      md += `> Positive distance = safe margin below boundary; negative = over boundary.\n`;
      md += `> Compare ±std against the margin to judge stability.\n\n`;
      md += `| note | div mean | div ±std | dist from boundary | human label | avg verdict |\n`;
      md += `| --- | --- | --- | --- | --- | --- |\n`;
      for (const r of rows) {
        const av = r.avgVector;
        if (!av || av.divergence === undefined || Number.isNaN(av.divergence)) continue;
        const dm   = av.divergence;
        const ds   = r.stats.divergence?.std ?? 0;
        const dist = divMax - dm;
        const side = dm <= divMax ? "safe" : "over";
        const humanLabel = r.human !== null ? (r.human >= 0.6 ? "keep" : "reject") : "?";
        md += `| ${r.file} | ${f4(dm)} | ${f4(ds)} | ${dist >= 0 ? "+" : ""}${f4(dist)} (${side}) | ${humanLabel} | ${r.persisted ? "keep" : "reject"} |\n`;
      }
      md += `\n`;
    }
  } else {
    md += `\n> Note: in \`mock\` mode HFE content is templated, so absolute scores are illustrative. `;
    md += `The calibration that matters runs with \`--provider anthropic\` on real notes.\n`;
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `calibration-${Date.now()}.md`);
  fs.writeFileSync(outFile, md, "utf-8");

  console.log(`calibration log -> ${outFile}`);
  console.log(`${totalNotes}本中${validNoteCount}本が有効（${excludedCount}本はmockフォールバックのため除外）`);
  console.log(`gate/human agreement（有効サンプルのみ）: ${agree}/${counted} = ${(rate * 100).toFixed(0)}%`);
  if (rteFailTotal > 0) console.warn(`⚠ RuntimeError failures: ${rteFailTotal} run(s) skipped`);
}

// Export stats utilities so the test file can import without running main().
module.exports = { mean, stdDev, axisStats };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
