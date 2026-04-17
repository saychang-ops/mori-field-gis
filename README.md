# 森町建設課GIS (Field)

現場データ収集用スマホアプリ（PWA）。PC版「建設課GIS v1.1.0」と連携。

## 開発

```
npm install
npm run dev   # http://localhost:3000 でローカルサーバ起動
npm test      # ユニットテスト実行
```

## デプロイ

GitHub mainブランチにpushすると、Vercelが自動ビルド＆デプロイ。

### 環境変数

Vercelダッシュボードで設定:
- `GOOGLE_GEOCODING_API_KEY`: Google Cloud で発行した Geocoding API キー

### Google Cloud Console 設定

1. Geocoding API を有効化
2. APIキーの HTTP Referer 制限に `https://<project>.vercel.app/*` を追加
3. 日次クォータを 500 req/日 に設定

### Vercel Firewall

Custom Rule で `request.geo.country != JP` → Deny を追加（Hobby無料枠3ルール中1つ消費）。

## 使い方

（実装進捗に応じて追記）

## 仕様書

`../docs/superpowers/specs/2026-04-18-smartphone-field-app-design.md`
