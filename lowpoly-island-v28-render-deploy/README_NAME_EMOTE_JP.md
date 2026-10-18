# v30 名前必須・モーションエモート更新

## 変更内容
- 名前欄が空欄または空白だけの場合、「島に降り立つ」を有効にしません。開始処理とサーバー側でも再検証します。
- 既存の4つのエモートキーを維持し、絵文字の吹き出しではなくキャラクターのモーションに置き換えました。
  - `1`：手を振る
  - `2`：ダンス
  - `3`：びっくり
  - `4`：ガッツポーズ
- エモートイベントは既存のWebSocket経由で本人と他プレイヤーへ配信されます。攻撃中は攻撃モーションを優先し、その後にエモートを再生します。

## GitHub / Renderへの反映
RenderのRoot Directoryは既存の `lowpoly-island-v28-render-deploy` のままにしてください。フォルダ名や `render.yaml` は変更不要です。

変更対象ファイルは以下です。ZIP全体で置き換える代わりに、GitHub上の同じパスへこれらのファイルを上書きしても反映できます。
- `public/index.html`
- `public/shared.js`
- `public/boot.js`
- `package.json`
- `test/name-emote.js`（新規）

新規回帰テストは `node test/name-emote.js` で実行できます。Node.js構文チェック、名前・エモート回帰テスト、およびWebSocket通信起動を必要としない既存テストは通過しています。
