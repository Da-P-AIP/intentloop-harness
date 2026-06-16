#!/usr/bin/env python3
"""HFE scoring entry point for intentloop-harness (Wire #1).

Wraps the real `axis-hfe` package (import name: `hypothesis_field`) behind a
JSON-in / JSON-out subprocess CLI so the Node orchestrator can call it.

Contract
--------
Input  (stdin, JSON): {
    "problem":      str,            # the source note / question
    "ideal_preset": str = default,  # default|creative|safe|balanced
    "iterations":   int = 2,        # internal HFE iterations
    "count":        int = 3,        # hypotheses per iteration
    "provider":     str = mock,     # mock|ollama|anthropic|openai
    "model":        str | None,
    "api_key":      str | None
}
Output (stdout, JSON): {
    "ok": true,
    "best":   {"content", "score", "vector": {6 axes}, "source", "id"},
    "ranked": [ {content, score, vector, source, id}, ... ],
    "iterations_run": int,
    "preset": str
}
On error: {"ok": false, "error": str}

Offline/dev runs use provider="mock" -> mock_llm=True (no API cost).
"""
import sys
import json
import asyncio

# Force UTF-8 I/O so packets/ledger carry clean text on Windows (cp932) too.
try:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


def _hyp_to_dict(h):
    return {
        "id": getattr(h, "id", ""),
        "content": getattr(h, "content", ""),
        "score": float(getattr(h, "score", 0.0)),
        "vector": {k: float(v) for k, v in (getattr(h, "vector", {}) or {}).items()},
        "source": getattr(h, "source", "generated"),
    }


async def _run(payload):
    import hypothesis_field as hf

    provider = payload.get("provider", "mock")
    mock = provider == "mock"
    engine = hf.build_engine(
        provider="ollama" if mock else provider,
        model=payload.get("model"),
        api_key=payload.get("api_key"),
        ideal_preset=payload.get("ideal_preset", "default"),
        iterations=int(payload.get("iterations", 2)),
        mock_llm=mock,
    )
    result = await engine.run(
        payload["problem"],
        iterations=int(payload.get("iterations", 2)),
        count=int(payload.get("count", 3)),
    )
    return {
        "ok": True,
        "best": _hyp_to_dict(result.best),
        "ranked": [_hyp_to_dict(h) for h in result.ranked],
        "iterations_run": int(result.iterations_run),
        "preset": payload.get("ideal_preset", "default"),
    }


def main():
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        if not payload.get("problem"):
            raise ValueError("missing required field: problem")
        out = asyncio.run(_run(payload))
    except Exception as e:  # noqa: BLE001 - surface any failure as JSON
        out = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    sys.stdout.write(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
