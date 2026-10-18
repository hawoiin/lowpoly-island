# 探索の島 v28 — Render デプロイ用

このフォルダは、ゲーム画面とマルチプレイ用 WebSocket サーバーを Render の **Web Service 1つ**で起動する構成です。Netlify との分離設定は不要です。`server.js` が `public/` のゲームファイルを配信し、同じホストで WebSocket 同期を受け付けます。

## Render の設定

GitHub リポジトリへこのフォルダ内のファイル一式を配置し、Render で **New + → Web Service** からそのリポジトリを接続してください。

- Runtime: Node
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/`

`render.yaml` を認識させる Blueprint デプロイを使う場合も、同じ設定が入っています。

## 公開後の確認

Render の `https://<サービス名>.onrender.com` を開きます。クライアントは現在のページのホスト名から `wss://` を自動選択するため、WebSocket URL を手で書き換える必要はありません。別の端末・ブラウザでも同じURLを開き、他プレイヤーが見えればマルチプレイ通信の基本確認ができています。

## 注意

- 無料Web Serviceは一定時間アクセスがないと休止することがあります。最初のアクセスでは起動を待つ場合があります。
- ワールド状態は `world.json` に保存されますが、永続ディスクを構成していない場合、再デプロイやインスタンス再作成後も保存内容が残る保証はありません。まずは接続確認を行い、ワールド進行を長期保存する段階でRenderのPersistent Diskを設定してください。
- WebSocketサービスが停止・再起動された場合、クライアントは自動再接続しますが、再起動中は一時的に接続が切れます。
