# intentloop-harness — Build Brief (Handoff Packet for Claude Code)

> このファイルをリポジトリの `docs/BUILD_BRIEF.md` に置き、Claude Code に渡す。
> 設計の出自は Axis Knowledge Vault の以下：
> [[evolve-intentops-with-loop-engineering]] / [[agent-memory-taxonomy]] /
> [[ai-ready-data-three-layer-mapping]] / [[intentops-vs-intentloop-comparison]]

## 0. Intent（この指示書のゴール）

`intentops-harness` の正常進化形 `intentloop-harness` を「ちゃんと動く形」にする。
**ただし全部を一度に作らない。** マイルストーン1＝*最小の閉ループ*をまず通し、
HFEスコアが人間の体感品質と一致するか測ってから拡張する（loop engineeringの鉄則：
小さい閉ループ→計測→拡張）。

## 1. 継承するもの / 変える2本の配線

**継承（intentops-harnessから流用・触らない）**
- パイプライン骨格 `Observe → Packetize → Plan → Evaluate → Gate → Act → Verify → Persist → Log`
- Consent Gate（low=自動 / medium=人間承認 / high=却下）
- Action Ledger（ハッシュ連鎖）
- 有界ループ（最大2回・目標80%）

**配線①：JS製HFE風採点 → 本物の `axis-hfe`**
- `pip install axis-hfe`。6軸ベクトル（accuracy/consistency/risk/novelty/feasibility/divergence）。
- 役割は**フィルタ（品質ゲート）**。自律的な答え生成エンジンとして過信しない。
- Fusion/Jump出力は `needs_verification: true` を立て、検証前は確定記憶にしない。

**配線②：使い捨て出力 → ATP永続化**
- ゲート通過後、`axis-thought-packet` スキーマ準拠のATPを `packets/` に書き出す。
- 次セッションの Observe が直近ATPを読んで「思考の続き」から再開（継続性）。

## 2. 技術スタック / 境界

- **オーケストレーション**：Node（intentops-harnessを継承）
- **推論・採点**：Python `axis-hfe`。Nodeから**サブプロセスCLI**で呼ぶ（JSON in/out）。
  - 入力 `{ problem, ideal_preset, iterations }` → 出力 `{ best:{content,score,vector}, ranked:[...] }`
  - マイルストーン1はサブプロセスCLIで十分（FastAPIサイドカーは後回し）。
- **パケット形式**：`schema/thought-packet.schema.json`（`reactor/schemas/` から移植）
- **記憶の置き場**：ATP=`packets/`（実行時, .gitignore）／エピソード=`ledger/`
- **手続き記憶**：`reactor/` にループ方針（閾値・反復上限・preset使い分け）を置く

## 3. ゲート判定基準（ハード）

通過条件：`risk <= 0.40` かつ `consistency >= 0.70` かつ `accuracy >= 0.80`。
不通過なら永続化しない（リファイン or 却下）。閾値は `reactor/` の設定ファイルから読む。

## 4. リポ構成（intentops-harnessを拡張）

```
intentloop-harness/
  packages/core/
    intentloop.js     # オーケストレータ（旧 intentops.js）
    packetize.js      # ATP生成＋スキーマ検証
    gate.js           # HFE閾値ゲート
    ledger.js         # ハッシュ連鎖（継承）
  python/
    hfe_score.py      # axis-hfe エントリポイント（JSON in/out, mock_llm対応）
    requirements.txt  # axis-hfe[anthropic] など
  schema/
    thought-packet.schema.json
  reactor/            # 手続き記憶：prompts / loop-policy.json（閾値・preset）
  packets/            # 実行時ATP出力（.gitignore）
  ledger/
  docs/BUILD_BRIEF.md # この文書
  .env.example  package.json
```

## 5. マイルストーン1の受け入れ基準（Definition of Done）

1. CLI（または `npm run dev`）が source note 1本 → HFE 6軸スコアを出す
2. ゲートが閾値で正しく却下/通過する
3. スキーマ検証を通るATPが `packets/<id>.json` に生成される
4. 2回目の実行が直近ATPを文脈として読む（=継続性のデモ）
5. 実行ごとにLedgerエントリ（prev/curr hash）が記録される
6. 実ノート約5本で「HFEスコア vs 人間判断」の較正ログを出力

## 6. ガードレール（loop engineering）

- 反復上限（max 2 / 80%）＝発振・暴走の制動
- **再評価はイベント駆動**（新しいリンク証拠が来た時だけ再HFE）。タイマー駆動禁止。
- observability＝全ステップをLedgerに追記
- 安全：パケットに秘密情報を入れない／自動deploy・自動push禁止（Consent Gate継承）

## 7. Claude Code向けタスク順

1. intentops-harness骨格からscaffold、`python/` と `schema/` を追加
2. `hfe_score.py`：axis-hfeをラップ（オフライン用に `mock_llm=True` フォールバック）
3. Node↔Pythonブリッジ（subprocess, JSON）
4. `gate.js`：reactor設定から閾値を読んで判定
5. `packetize.js`：ATP生成＋スキーマ検証→`packets/`へ
6. ループ配線：Observe(直近ATP読込)→…→Persist(ATP)、有界反復
7. 各ステップでLedger記録
8. 較正テスト：5ノート実行→較正ログ出力
9. README：`03_outputs/intentloop-harness-readme-draft.md` から起こす

## 8. クロコに判断を委ねる未決事項

- **LLMプロバイダ**：開発は `ollama`/`mock_llm`（コスト回避）、本番run は `anthropic`（claude-sonnet-4-6）を推奨
- **Node↔Python**：マイルストーン1はsubprocess CLI、呼び出しが増えたらFastAPIサイドカーへ
- **パケット保管先**：当面はリポ内 `packets/`、後でVaultの `.raw/packets/` に同期

## 9. 申し送り

- GitHub: `https://github.com/Da-P-AIP/intentloop-harness`（現状ほぼ空）
- 既存資産: [intentops-harness](https://github.com/Da-P-AIP/intentops-harness) /
  [axis-hfe](https://github.com/Da-P-AIP/axis-hfe)（PyPI: `axis-hfe`) /
  [axis-thought-packet](https://github.com/Da-P-AIP/axis-thought-packet)
- コミット/プッシュはClaude Code側で実施（Cowork側のGitHub連携は現在認証エラーのため）
