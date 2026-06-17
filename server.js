"use strict";
// HTTP server for Cloud Run deployment.
// Wraps the intentloop core as a minimal REST API — no npm dependencies.
// Endpoints:
//   GET  /healthz  → 200 {"ok":true}  (Cloud Run health check)
//   POST /triage   → run one loop, return gate verdict + recommendation
//   GET  /         → serve demo UI from public/

const http = require("http");
const fs = require("fs");
const path = require("path");
const { runLoop } = require("./packages/core/intentloop");

const PORT = Number(process.env.PORT) || 8080;

// ---- Static file serving for the demo UI (public/) ----
const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

// Serve a file from public/ if it exists & is inside the dir (path-traversal safe).
// Returns true if the request was handled.
function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(PUBLIC_DIR, urlPath);
  // Block path traversal: resolved path must stay inside PUBLIC_DIR.
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return false;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": body.length,
  });
  res.end(body);
  return true;
}

// Determine incident response recommendation from gate result + risk axis.
// Gate already enforces risk_max ≤ 0.40; anything that passes is "safe to act".
// Reject → always escalate to human (too risky or quality below threshold).
function recommend(persisted, hfeResult) {
  if (!persisted) return "ESCALATE_TO_HUMAN";
  const risk = hfeResult && hfeResult.best && hfeResult.best.vector
    ? hfeResult.best.vector.risk
    : 1.0;
  return risk <= 0.20 ? "SAFE_AUTO_ACT" : "SAFE_AUTO_ACT_MONITOR";
}

function sendJSON(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function handleTriage(req, res) {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk.toString("utf-8")));
  req.on("end", async () => {
    let payload;
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      return sendJSON(res, 400, { ok: false, error: "invalid JSON body" });
    }

    const alertText = payload.alert || payload.note;
    if (!alertText || typeof alertText !== "string" || !alertText.trim()) {
      return sendJSON(res, 400, { ok: false, error: "missing required field: 'alert'" });
    }

    const provider = payload.provider || "mock";
    const intent = payload.intent || "triage incident alert: assess risk, determine autonomous-vs-escalate response";

    let result;
    try {
      result = await runLoop({
        note: alertText.trim(),
        intent,
        provider,
        quiet: true, // suppress per-step console output; server logs to stdout only on error
      });
    } catch (err) {
      console.error("[triage error]", err.message);
      return sendJSON(res, 500, { ok: false, error: err.message });
    }

    const vector = result.hfe && result.hfe.best ? result.hfe.best.vector : null;

    sendJSON(res, 200, {
      ok: true,
      gate_verdict: result.persisted ? "PASS" : "REJECT",
      recommendation: recommend(result.persisted, result.hfe),
      hfe_score: result.hfe && result.hfe.best ? Number(result.hfe.best.score.toFixed(4)) : null,
      hfe_vector: vector
        ? {
            accuracy:    Number(vector.accuracy.toFixed(4)),
            consistency: Number(vector.consistency.toFixed(4)),
            risk:        Number(vector.risk.toFixed(4)),
            novelty:     Number(vector.novelty.toFixed(4)),
            feasibility: Number(vector.feasibility.toFixed(4)),
            divergence:  Number(vector.divergence.toFixed(4)),
          }
        : null,
      gate_reasons: result.gate ? result.gate.reasons : [],
      atp_id:             result.persisted ? result.packet.id : null,
      needs_verification: result.persisted ? result.packet.needs_verification : null,
      attempts:   result.attempts,
      session_id: result.sessionId,
    });
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/healthz") {
    return sendJSON(res, 200, { ok: true, service: "intentloop-harness", version: "0.1.0" });
  }

  if (req.method === "POST" && req.url === "/triage") {
    return handleTriage(req, res);
  }

  // Serve the demo UI (GET / → public/index.html, plus any static asset in public/).
  if (req.method === "GET" || req.method === "HEAD") {
    if (serveStatic(req, res)) return;
  }

  sendJSON(res, 404, { ok: false, error: `${req.method} ${req.url} not found` });
});

server.listen(PORT, () => {
  console.log(`[intentloop-harness] server listening on port ${PORT}`);
});
