"use strict";
// Wire #1: Node -> Python bridge to the real axis-hfe engine.
// Calls python/hfe_score.py as a subprocess, JSON in via stdin, JSON out via
// stdout. Milestone 1 uses a plain subprocess CLI (FastAPI sidecar deferred).

const { spawn } = require("child_process");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "..", "..", "python", "hfe_score.py");
const PYTHON = process.env.INTENTLOOP_PYTHON || "python";

// payload: { problem, ideal_preset, iterations, count, provider, model, api_key }
// returns: Promise<{ ok, best, ranked, iterations_run, preset } | { ok:false, error }>
function score(payload) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString("utf-8")));
    proc.stderr.on("data", (d) => (err += d.toString("utf-8")));
    proc.on("error", (e) => reject(new Error(`failed to spawn ${PYTHON}: ${e.message}`)));
    proc.on("close", (code) => {
      if (!out.trim()) {
        return reject(new Error(`hfe_score.py produced no output (exit ${code}). stderr: ${err.slice(0, 500)}`));
      }
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`could not parse hfe_score.py output: ${e.message}\nraw: ${out.slice(0, 500)}`));
      }
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

module.exports = { score };
