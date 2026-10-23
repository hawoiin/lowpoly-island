# v60.1 帰還インタラクト修正

## 修正内容

- `updatePlayer()` 内で `nearest={kind:rogueReturn}` と記述されていたため、JavaScript が `rogueReturn` を未定義変数として評価していた問題を修正。
- 正しく `nearest={kind:'rogueReturn'}` とし、ダンジョン入口付近で毎フレーム発生していた `ReferenceError` を解消。
- `test/rogue-dungeon.js` に同じ誤記を検出する回帰テストを追加。

ダンジョンの設計、地形、敵、装備、通常ワールドの機能は変更していません。

## 適用方法

1. v60 のプロジェクトフォルダーにこの ZIP の内容を上書き展開する。
2. `public/index.html` と `test/rogue-dungeon.js` が更新されたことを確認する。
3. プロジェクト一式を Render に再デプロイする。
4. ブラウザーを強制再読み込みしてダンジョンに入り、コンソールに `rogueReturn is not defined` が再発しないことを確認する。

この ZIP はソース修正版です。Render 上の公開サイトをこちらから直接更新するものではありません。
