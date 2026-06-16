# RUN_CALIBRATION — 本物の axis-hfe で実較正を回す手順

> 対象: `intentloop-harness` マイルストーン1の DoD #6（HFEスコア vs 人間判断の較正）を、
> mock ではなく **本物の axis-hfe + `--provider anthropic`（claude-sonnet-4-6）** で実行する。
> 環境: **Windows / PowerShell** 前提。コピペで上から順に流せば動くように書いてある。

---

## 0. 全体像（30秒で）

やることは3つだけ。

1. Python 側に本物の `axis-hfe` を入れる
2. `ANTHROPIC_API_KEY` を環境変数にセットする
3. `npm run calibrate -- --provider anthropic` を叩く → `ledger/calibration-<時刻>.md` が出る

実ノート5本（`notes/01〜05.md`）は**すでにリポに入っていて**、各ファイルの先頭に人間評価（`human_quality`）も書いてある。だから較正用データの準備は不要。そのまま回せる。

判定の合否ラインは **gate と人間の一致率 80%**。下回ったら `reactor/loop-policy.json` の閾値を調整して再実行する。

---

## 1. 前提セットアップ

### 1-1. リポに移動

```powershell
cd C:\Users\mazu7\Desktop\AAA_Da-P\intentloop-harness
```

### 1-2. Node 依存（基本そのままでOK）

このリポはランタイム依存ゼロ（標準モジュールのみ）。`node --version` が 18 以上なら準備完了。念のため:

```powershell
node --version    # v18 以上であること
```

### 1-3. Python 側に本物の axis-hfe を入れる

`hfe_score.py` は import 名 `hypothesis_field`（パッケージ名 `axis-hfe`）をラップしている。
Anthropic で回すので **anthropic extra 付き**で入れる:

```powershell
pip install "axis-hfe[anthropic]"
```

入ったか確認（ここでコケると本番 run も必ずコケる。先に潰しておく）:

```powershell
python -c "import hypothesis_field; print('axis-hfe OK')"
```

> `python` ではなく `py` や `python3` で動かしている場合は **1-5** を参照。Node 側が呼ぶインタプリタ名を合わせる必要がある。

### 1-4. APIキーを環境変数にセットする（ここが一番ハマる）

**重要**: 現状のコードは `.env` ファイルを自動で読み込まない（dotenv を使っていない）。
`.env.example` はあるが、**ファイルに書くだけでは効かない**。PowerShell のセッション環境変数として直接セットする必要がある。Node が spawn する Python はこの環境変数を継承して Anthropic SDK が拾う。

そのセッションだけ有効（推奨・手軽）:

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-xxxxxxxxxxxxxxxx"
```

セットされたか確認:

```powershell
echo $env:ANTHROPIC_API_KEY
```

永続化したい場合（ユーザー環境変数に保存。**新しい**ターミナルから有効になる）:

```powershell
setx ANTHROPIC_API_KEY "sk-ant-xxxxxxxxxxxxxxxx"
# 実行後、PowerShell を開き直す。同じ窓では反映されない点に注意
```

> キーは絶対にコミットしない。`.env` も `packets/` も `.gitignore` 済みだが、ターミナル履歴に残る点だけ意識して。

### 1-5.（必要な人だけ）Python インタプリタ名を合わせる

Node→Python ブリッジ（`packages/core/hfe.js`）は既定で **`python`** を spawn する。
`python` が無い／`python3` や `py` で動かしている環境では、環境変数で上書きする:

```powershell
$env:INTENTLOOP_PYTHON = "py"     # もしくは "python3"
```

`python -c "import hypothesis_field"`（1-3）が通ったインタプリタ名を、そのまま `INTENTLOOP_PYTHON` に入れればOK。

---

## 2. 実ノート5本の置き場所（確認のみ・編集不要）

較正は `notes/*.md` を**自動で全部**拾う（`scripts/calibrate.js` が `notes/` を読む）。
現状そろっている5本:

```
notes/01-cache-across-sessions.md      human_quality: 0.85
notes/02-autodeploy-on-pass.md         human_quality: 0.20   ← 本来 reject されるべき悪い例
notes/03-three-memory-systems.md       human_quality: 0.80
notes/04-hfe-as-answer-engine.md       human_quality: 0.35   ← 本来 reject されるべき悪い例
notes/05-bounded-iteration.md          human_quality: 0.82
```

各ファイルの先頭はこの形（frontmatter）。`human_quality` が人間の正解ラベル:

```markdown
---
human_quality: 0.85
human_note: "Solid, actionable, low-risk. Event-driven re-eval is the right call."
---
（ここからノート本文）
```

ノートを差し替え・追加したい時は、同じ frontmatter 形式で `notes/` に `.md` を置くだけ。
`human_quality` を入れ忘れると、その行は一致率の母数から外れる（`?` 表示になる）ので必ず入れる。

> 判定ロジック上、`human_quality >= 0.6` を「人間は採用すべき(keep)」とみなす。
> つまり 01/03/05 は keep、02/04 は reject が"人間の正解"。

---

## 3. 本番 run（claude-sonnet-4-6 で較正）

### 3-1. まず1本だけ疎通確認（課金を最小に）

いきなり5本回す前に、1本で Anthropic 経路が通るか確かめる。これが通れば配線は生きている:

```powershell
node bin/intentloop.js --file notes/01-cache-across-sessions.md --provider anthropic
```

`=== result: PERSISTED atp_... ===` が出れば疎通OK。
エラーが出たら **6章** のトラブルシュートへ。

### 3-2. 5本まとめて較正

```powershell
npm run calibrate -- --provider anthropic
```

`npm run` 経由で引数を渡すので **`--` を必ず挟む**（これが無いと `--provider` が calibrate.js に届かず mock のまま回る）。
npm を挟まず直接でも同じ:

```powershell
node scripts/calibrate.js --provider anthropic
```

実行中は1本ずつ `running 01-... PERSISTED (acc=.. cons=.. risk=..)` のように流れ、最後に:

```
calibration log -> ...\ledger\calibration-<時刻>.md
gate/human agreement: 4/5 = 80%
```

provider を指定しなければ既定は `mock`。**本物で測るときは必ず `--provider anthropic` を付ける。**
モデルは指定不要（policy の `model_prod = claude-sonnet-4-6` を自動で使う）。

---

## 4. 出力 `calibration-*.md` の見方と 80% 判定

`ledger/calibration-<時刻>.md` が生成される。中身はこのテーブル:

```
| note | human | HFE acc | cons | risk | gate | persisted | human says keep | agree |
```

各列の意味:

- **human** … ノートの `human_quality`（人間の正解スコア）
- **HFE acc / cons / risk** … axis-hfe が返した6軸のうちゲート判定に使う3軸
- **gate** … 閾値判定の結果（PASS / FAIL）
- **persisted** … 実際に ATP として保存されたか（= gate を通ったか）
- **human says keep** … `human_quality >= 0.6` なら yes
- **agree** … gate の判断と人間の判断が一致したか（✓ / ✗）

最終行に出る一本値がすべて:

```
**Gate/human agreement: 4/5 = 80%** (target MET: 80%)
```

**判定ポイント:**

- `target MET` と出れば DoD #6 クリア。較正合格、拡張フェーズに進んでよい。
- `not met` なら **どの行が ✗ か**を見る。典型は「02/04（悪いノート）が persisted=yes になってしまう（=ゲートが甘くて通してしまう）」パターン。逆に「良いノートを誤って弾く」パターンもある。✗ の向きで次の調整方針が決まる（5章）。

> 一致は「スコアの近さ」ではなく **keep/reject の二値が合うか** で測る。
> なので狙いは「02・04 をゲートで FAIL させ、01・03・05 を PASS で残す」閾値を見つけること。

---

## 5. 80%未満だったときの調整の勘所

いじるのは1ファイルだけ: **`reactor/loop-policy.json`**。コードは閾値をハードコードせず、毎回ここから読む。該当ブロック:

```json
"gate": {
  "risk_max": 0.40,
  "consistency_min": 0.70,
  "accuracy_min": 0.80
}
```

通過条件は **3つすべて満たす**こと（`risk <= risk_max` かつ `consistency >= consistency_min` かつ `accuracy >= accuracy_min`）。
`calibration-*.md` の acc/cons/risk 列を眺めて、**良いノートと悪いノートを分離できる境目**に閾値を寄せる。

**ケース別の動かし方:**

- **悪いノート（02/04）が通ってしまう（✗ が reject 側で出る）**
  → ゲートを**厳しく**する。悪いノートの risk が高め・accuracy 低めに出ているはずなので、
  `risk_max` を下げる（例 0.40 → 0.30）か、`accuracy_min` を上げる（例 0.80 → 0.85）。
  悪いノートだけが弾かれ、良いノートは残る値を探す。

- **良いノート（01/03/05）が弾かれてしまう（✗ が keep 側で出る）**
  → ゲートが**厳しすぎ**。`consistency_min` / `accuracy_min` を少し下げるか `risk_max` を少し上げて緩める。

**調整の手順（1軸ずつ）:**

1. `calibration-*.md` で、keep すべき3本の最小 acc と、reject すべき2本の最大 acc を見る。
   その**あいだ**に `accuracy_min` を置けば accuracy 1軸で分離できる。risk も同様に「悪い方の最小 risk」と「良い方の最大 risk」のあいだに `risk_max` を置く。
2. `reactor/loop-policy.json` を1値だけ変える（複数同時に動かすと原因の切り分けができなくなる）。
3. 再実行: `npm run calibrate -- --provider anthropic`
4. 一致率が上がったか、新しい `calibration-*.md` で確認。80% に届くまで 1〜3 を繰り返す。

**閾値で割り切れない場合の上位手段（マイルストーン2側の話）:**

- `loop.max_iterations`（既定2）を上げると、FAIL→refine の再評価回数が増える。発振防止の上限なので**安易に上げない**（briefのガードレール）。まずは閾値で攻める。
- `hfe.ideal_preset`（`default` / `creative` / `safe` / `balanced`）を `safe` に寄せると保守的な採点になる。リスク系ノートの分離に効くことがある。
- どうしても5本では決まらない時は、較正ノートを増やして母数を上げる（2章の形式で `notes/` に追加）。

> 変更したら `reactor/loop-policy.json` の差分はコミットしておくと、どの閾値で 80% を取れたか後から追える。

---

## 6. 詰まりやすい所のトラブルシュート

**`HFE failed: ...` / `hfe_score.py produced no output`**
→ Python 側の例外。まず手動で Python だけ叩いて素のエラーを見る:

```powershell
'{"problem":"test","provider":"anthropic","model":"claude-sonnet-4-6"}' | python python/hfe_score.py
```

返ってくる JSON の `"error"` に本当の原因（キー未設定・モジュール無し等）が入っている。

**`ModuleNotFoundError: hypothesis_field`**
→ axis-hfe が、Node が呼ぶインタプリタに入っていない。1-3 を実行。複数 Python がある環境なら 1-5 の `INTENTLOOP_PYTHON` を、`import hypothesis_field` が通ったインタプリタ名に合わせる。

**`failed to spawn python: ...`**
→ `python` コマンドが PATH に無い。`$env:INTENTLOOP_PYTHON = "py"`（または `python3`）を設定（1-5）。

**認証エラー / `AuthenticationError` / 401**
→ `ANTHROPIC_API_KEY` が未設定か別ターミナルにしか無い。`echo $env:ANTHROPIC_API_KEY` で確認。
`setx` で入れた場合は**ターミナルを開き直す**（同じ窓では反映されない）。`.env` に書いただけでは効かない点に再注意（1-4）。

**一致率が前と全く同じで動かない / mock のまま**
→ `--provider anthropic` が届いていない。`npm run` 経由なら `--` を挟んでいるか確認（`npm run calibrate -- --provider anthropic`）。出力テーブル上部の `provider:` 行が `anthropic` になっているかで判別できる（`mock` のままなら引数が渡っていない）。

**日本語ノートで文字化け**
→ `hfe_score.py` は UTF-8 I/O を強制済み。Node 側も UTF-8 で受けている。Windows の cp932 でも基本問題ないが、もし崩れるならターミナルを `chcp 65001`（UTF-8）にしてから再実行。

**ledger が壊れていないか確認したい**
→ 較正は実行ごとに `ledger/ledger.jsonl` にハッシュ連鎖で追記される。整合性チェック:

```powershell
npm run verify-ledger    # { ok: true, count: N } が出ればOK
```

---

## 付録: コマンドだけ通しで

### Anthropic（claude-sonnet-4-6）

```powershell
cd C:\Users\mazu7\Desktop\AAA_Da-P\intentloop-harness
pip install "axis-hfe[anthropic]"
python -c "import hypothesis_field; print('axis-hfe OK')"
$env:ANTHROPIC_API_KEY = "sk-ant-xxxxxxxxxxxxxxxx"
node bin/intentloop.js --file notes/01-cache-across-sessions.md --provider anthropic   # 疎通1本
npm run calibrate -- --provider anthropic                                              # 本番5本
#   -> ledger/calibration-<時刻>.md を開いて末尾の一致率を確認（目標80%）
#   -> 未達なら reactor/loop-policy.json の gate 閾値を調整して再実行
```

### Gemini（gemini-2.5-flash）

```powershell
cd C:\Users\mazu7\Desktop\AAA_Da-P\intentloop-harness
pip install "axis-hfe[gemini]"
python -c "import hypothesis_field; print('axis-hfe OK')"
$env:GEMINI_API_KEY = "AIza..."
node bin/intentloop.js --file notes/01-cache-across-sessions.md --provider gemini   # 疎通1本
node scripts/calibrate.js --provider gemini                                         # 本番5本（確定・推奨）
```

> **PowerShell の `--` 罠に注意**: `npm run calibrate -- --provider gemini` は、PowerShell が
> 区切りの `--` を食ってしまうと `npm run calibrate --provider gemini` に化け、今度は npm が
> `--provider` を食って calibrate.js には bare `gemini` だけが届く。これが「Gemini 指定なのに
> mock で回る」正体。確実なのは **`node scripts/calibrate.js --provider gemini` を直接叩く**こと。
> npm を使いたいなら引数を渡さない専用スクリプト **`npm run calibrate:gemini`** を使う（同・確定）。
> なお calibrate.js は bare positional（`gemini` 単体）も拾うよう強化済みなので、万一 `--provider`
> が剥がれても provider=gemini として認識される。
