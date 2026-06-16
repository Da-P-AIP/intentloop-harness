---
tags:
  - concept/comparison
  - project/intentloop-harness
  - project/intentops-harness
  - project/hfe
  - project/thought-packet
  - denno-shoko/core
---

# intentops-harness vs intentloop-harness — Feature Comparison

Created: 2026-06-16
Status: Draft (intentloop side = target spec, not yet built)

## Summary

`intentloop-harness` is the persistent-loop evolution of `intentops-harness`.
The harness *governance* (consent gate, ledger, bounded loop) is inherited as-is;
what changes is **memory, loop scope, and the reasoning/packet engines**.

## Comparison

| 観点 | intentops-harness（現行 MVP） | intentloop-harness（目標仕様） |
| --- | --- | --- |
| **役割** | 監査可能な単発DevOpsエージェント | 記憶し磨き続ける永続ループエージェント |
| **ループの範囲** | セッション*内*で完結 | セッションを*跨いで*閉じる |
| **品質の挙動** | 1回ごとのリファイン（最大2回・80%目標） | 周回ごとに品質が*複利で*向上 |
| **記憶** | 使い捨て `generated-artifacts/<hash>/` | 三系統記憶（宣言／手続き／エピソード）に永続化 |
| **データ基盤** | なし（その場のコンテキスト） | 三層メダリオン（Bronze/Silver/Gold）＋ RAG |
| **HFE** | JS製の HFE *風* 正規化・採点 | 本物の `axis-hfe`（6軸ベクトル・進化ループ） |
| **Thought Packet** | ハーネス内蔵の簡易パケット | `axis-thought-packet` スキーマに標準化 |
| **ATP の役割** | 内部の一時メモ | セッション/エージェント間の継続カプセル（運び屋） |
| **RAG** | なし | Vault note本文を定性コーパスとして検索 |
| **MCP** | 内部のローカルサーバ経由のみ | 三系統記憶への*共通アクセス口*として標準装備 |
| **Consent Gate** | あり（low/medium/high のリスク階層） | 継承（変更なし） |
| **Action Ledger** | あり（ハッシュ連鎖） | 継承＋*エピソード記憶*として正式化 |
| **暴走対策** | 反復上限（max 2） | 上限＋*イベント駆動*の再評価（タイマー禁止） |
| **observability** | Ledger | Ledger＝observabilityの背骨として明示 |
| **実装** | JavaScript ＋ Gemini | JSハーネス ＋ Python `axis-hfe` ＋ ATPスキーマ |
| **状態** | 動作するMVP | 設計段階（最小ループから検証） |

## 継承するもの / 変えるもの

- **継承（触らない）**: Consent Gate、Action Ledger、有界ループの考え方、`Observe→…→Log` の骨格。
- **変える（2本の配線）**: ①JS採点 → 本物の `axis-hfe`、②使い捨て出力 → ATP永続化（`.raw/packets/`）。
- **足す**: 三層データ基盤、RAG、三系統記憶の分離、MCPの標準装備。

## Related

- [[evolve-intentops-with-loop-engineering]]
- [[agent-memory-taxonomy]]
- [[ai-ready-data-three-layer-mapping]]
- [[axis-thought-packet]]
- [[axis-hfe]]
