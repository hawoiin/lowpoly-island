# v46 修正内容

## Render のビルドエラー
- `package-lock.json` を更新ZIPに必ず含めました。Render の Root Directory が `lowpoly-island-v28-render-deploy` である状態で、`package.json` と同じ階層に配置してください。
- `render.yaml` の `buildCommand` を `npm install` に変更し、lockfile が欠けた状態の `npm ci` による EUSAGE エラーを避けます。
- `package.json` / `package-lock.json` のバージョンを `1.46.0` にそろえています。

## 野営地番人の攻撃モーション
- 右肩のZ回転が大きな負角度になることで、右腕が胸の前を横切って胴体に入り込む軌道を修正しました。
- 振りかぶり時は右肩を外側へ開き、攻撃時は主にX回転を使って棍棒を前方へ振り下ろします。
- 攻撃力、サーバー側の攻撃判定、ダメージ発生時刻、敵AI、敵配置、ワールド保存形式は変更していません。

## バージョン
- タイトル画面右下: v46

## 既存ワールド
- `world.json` は配布ZIPに含めていません。既存のワールド保存データは残してください。
