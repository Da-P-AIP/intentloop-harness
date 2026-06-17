# intentloop-harness — Cloud Run デプロイ手順

> **注意**: 実際の `gcloud run deploy` や API キー投入は Da-P（本人）がローカル PC で実行してください。
> このドキュメントに認証情報をコミットしないこと。

---

## 前提

| 項目 | 値 |
|------|-----|
| GCP プロジェクト ID | `diaphonos-fortune` |
| プロジェクト番号 | `554218173303` |
| リージョン | `asia-northeast1`（東京） |
| Cloud Run サービス名 | `intentloop-harness` |
| 必須 API キー | `GEMINI_API_KEY`（Gemini 2.5 Flash 用） |

### 必要なもの

```bash
# gcloud CLI（未インストールの場合）
# https://cloud.google.com/sdk/docs/install
gcloud --version   # 確認

# Docker（ローカルテスト時のみ）
docker --version
```

---

## 手順 1: ローカルで動作確認（Docker なし）

```bash
# mock プロバイダで HTTP サーバーを起動（API キー不要）
node server.js &
SERVER_PID=$!

# ヘルスチェック
curl http://localhost:8080/healthz
# → {"ok":true,"service":"intentloop-harness","version":"0.1.0"}

# トリアージ（mock）
curl -s -X POST http://localhost:8080/triage \
  -H "Content-Type: application/json" \
  -d '{"alert": "DB CPU 98% — 5分間継続", "provider": "mock"}' | jq .

# サーバー停止
kill $SERVER_PID
```

---

## 手順 2: Docker でローカルビルド＆起動確認

```bash
# リポジトリルートから実行
cd /path/to/intentloop-harness

# イメージビルド（初回は pip install のため数分かかる）
docker build -t intentloop-harness .

# mock で起動（API キー不要）
docker run --rm -p 8080:8080 intentloop-harness

# 別ターミナルで確認
curl http://localhost:8080/healthz
curl -s -X POST http://localhost:8080/triage \
  -H "Content-Type: application/json" \
  -d '{"alert": "メモリリーク検出: pod/api-server 使用率 94%", "provider": "mock"}' | jq .

# Gemini 実呼び出しでテストする場合
docker run --rm \
  -e GEMINI_API_KEY=<YOUR_GEMINI_KEY> \
  -p 8080:8080 \
  intentloop-harness
```

---

## 手順 3: Cloud Run へデプロイ

### 3-A: 環境変数で API キーを直接渡す方法（手軽）

```bash
gcloud auth login
gcloud config set project diaphonos-fortune

gcloud run deploy intentloop-harness \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=<YOUR_GEMINI_KEY>
```

### 3-B: Secret Manager 経由で渡す方法（推奨・セキュア）

```bash
# シークレット作成（初回のみ）
echo -n "<YOUR_GEMINI_KEY>" | \
  gcloud secrets create gemini-api-key \
    --data-file=- \
    --project diaphonos-fortune

# Cloud Run デプロイ（シークレット参照）
gcloud run deploy intentloop-harness \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest

# シークレット更新（キーを変えたい場合）
echo -n "<NEW_KEY>" | \
  gcloud secrets versions add gemini-api-key --data-file=-
```

> `--source .` を使うと Cloud Build が自動で Dockerfile をビルドし、
> Artifact Registry へプッシュして Cloud Run にデプロイします。
> ローカルの Docker デーモンは不要です。

---

## 手順 4: デプロイ後の疎通確認

```bash
# サービス URL を取得
SERVICE_URL=$(gcloud run services describe intentloop-harness \
  --region asia-northeast1 \
  --project diaphonos-fortune \
  --format 'value(status.url)')

echo "Service URL: $SERVICE_URL"

# ヘルスチェック
curl "${SERVICE_URL}/healthz"
# → {"ok":true,"service":"intentloop-harness","version":"0.1.0"}

# トリアージ（mock）
curl -s -X POST "${SERVICE_URL}/triage" \
  -H "Content-Type: application/json" \
  -d '{"alert": "disk usage /var/log 97%", "provider": "mock"}' | jq .

# トリアージ（Gemini 実呼び出し）
curl -s -X POST "${SERVICE_URL}/triage" \
  -H "Content-Type: application/json" \
  -d '{"alert": "disk usage /var/log 97%", "provider": "gemini"}' | jq .
```

---

## API 仕様

### `GET /healthz`

```
200 OK
{"ok": true, "service": "intentloop-harness", "version": "0.1.0"}
```

### `POST /triage`

**リクエスト**

```json
{
  "alert":    "インシデントのテキスト（必須）",
  "provider": "mock | gemini | anthropic | openai （省略時: mock）",
  "intent":   "カスタム intent 文（省略可）"
}
```

**レスポンス（成功）**

```json
{
  "ok": true,
  "gate_verdict":       "PASS | REJECT",
  "recommendation":     "SAFE_AUTO_ACT | SAFE_AUTO_ACT_MONITOR | ESCALATE_TO_HUMAN",
  "hfe_score":          0.8432,
  "hfe_vector": {
    "accuracy":    0.8600,
    "consistency": 0.9200,
    "risk":        0.1800,
    "novelty":     0.5300,
    "feasibility": 0.9500,
    "divergence":  0.4200
  },
  "gate_reasons": [
    "PASS: risk 0.180 <= 0.4",
    "PASS: consistency 0.920 >= 0.7",
    "PASS: accuracy 0.860 >= 0.8",
    "PASS: divergence 0.420 <= 0.47"
  ],
  "atp_id":             "atp_1781582958555_b2e7c9",
  "needs_verification": true,
  "attempts":           1,
  "session_id":         "sess_1781582958555_a1b2"
}
```

**recommendation の意味**

| 値 | 意味 |
|----|------|
| `SAFE_AUTO_ACT` | リスク ≤ 0.20。ゲート PASS。自律実行して良い。 |
| `SAFE_AUTO_ACT_MONITOR` | リスク 0.20〜0.40。ゲート PASS。自律実行可だが監視推奨。 |
| `ESCALATE_TO_HUMAN` | ゲート REJECT。精度・整合性・リスクが閾値未満。人間にエスカレ。 |

**エラーレスポンス**

```json
{"ok": false, "error": "missing required field: 'alert'"}  // 400
{"ok": false, "error": "HFE failed: ..."}                  // 500
```

---

## 環境変数一覧

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `PORT` | 否（Cloud Run が自動設定） | listen ポート（デフォルト 8080） |
| `GEMINI_API_KEY` | provider=gemini 使用時 | Gemini API キー |
| `INTENTLOOP_PYTHON` | 否（Dockerfile で設定済） | Python バイナリパス |

---

## トラブルシューティング

```bash
# Cloud Run のログを確認
gcloud run services logs read intentloop-harness \
  --region asia-northeast1 \
  --project diaphonos-fortune \
  --limit 50

# コンテナのローカルデバッグ（シェルに入る）
docker run --rm -it --entrypoint /bin/bash intentloop-harness

# Python/axis-hfe の確認
docker run --rm intentloop-harness /opt/venv/bin/python -c \
  "import hypothesis_field; print('axis-hfe OK')"
```
