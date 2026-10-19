# v47 Root Directory 修正

このリリースでは、Render がリポジトリ直下で package.json を探してしまう問題を修正します。

- render.yaml に `rootDir: lowpoly-island-v28-render-deploy` を追加
- package.json / package-lock.json のバージョンを 1.47.0 に同期
- タイトル画面のバージョン表示を v47 に更新

Render の Blueprint で管理している場合は、この render.yaml を GitHub に反映後、Render Dashboard の Blueprint から Sync（変更を同期）して設定を反映してください。
手動設定のサービスでは Settings → Build & Deploy → Root Directory を `lowpoly-island-v28-render-deploy` に設定して保存してください。
