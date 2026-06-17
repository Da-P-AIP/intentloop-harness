# intentloop-harness — Cloud Run イメージ
# Node 20 + Python 3 (axis-hfe) を一つのコンテナで動かす。
# Cloud Run は $PORT (default 8080) を自動設定する。

FROM node:20-slim

# Python 3 ランタイムと venv をインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

# axis-hfe を venv 内に隔離インストール
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir "axis-hfe[gemini]"

# アプリを配置（node_modules は不要 — npm 依存ゼロ設計）
WORKDIR /app
COPY . .

# 実行時ディレクトリを確保（.gitignore で除外されているため）
RUN mkdir -p packets ledger

# hfe.js が参照する Python バイナリを明示
ENV INTENTLOOP_PYTHON=/opt/venv/bin/python

# Cloud Run は PORT を注入する（デフォルト 8080）
ENV PORT=8080

# GEMINI_API_KEY は Cloud Run の環境変数 / Secret Manager から注入する。
# Dockerfile にシークレットをハードコードしないこと。

CMD ["node", "server.js"]
