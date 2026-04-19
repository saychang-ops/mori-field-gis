# 森町建設課GIS (Field)

現場データ収集用スマホアプリ（PWA）。PC版「建設課GIS v1.1.0」と連携。

## 機能

- 地図表示（地理院淡色・Google航空写真の切替）
- 町道路線・町道橋の閲覧（PC版と同一データを同梱）
- GPS現在地表示（マゼンタ色・フェードパルス）、追従モード
- 現場メモの新規登録
  - 点（円・四角・三角・星 × 6色）
  - 線（solid/dashed/dotted × 太さ2/4/6 × 6色）
- OS標準カメラで写真撮影、1600px長辺/JPEG 0.82 に自動リサイズ（最大3枚）
- 3種検索（住所Google Geocoding / 町道コード・名 / 橋梁名あいまい）
- Web Share API でGeoJSONエクスポート（base64写真埋め込み）
- PWA: ホーム画面追加、Service Workerでオフライン起動

## 開発

```
npm install
npm run dev   # http://localhost:3000 でローカルサーバ起動
npm test      # ユニットテスト実行（30件）
```

## デプロイ

GitHub mainブランチにpushすると、Vercelが自動ビルド＆デプロイ（1〜2分）。
Service Worker 更新は `sw.js` の `CACHE_VERSION` をバンプすると全ユーザー端末に伝播する。

### 環境変数

Vercelダッシュボードで設定:
- `GOOGLE_GEOCODING_API_KEY`: Google Cloud で発行した Geocoding API キー

### Google Cloud Console 設定

1. Geocoding API を有効化
2. APIキーの HTTP Referer 制限に `https://<project>.vercel.app/*` を追加
3. 日次クォータを 1000 req/日 に設定
4. 予算アラートを設定（推奨: 月額 $5）

### Vercel Firewall

Custom Rule で `request.geo.country != JP` → Deny を追加（Hobby無料枠3ルール中1つ消費）。

## 使い方

1. VercelのURLを Chrome (Android) または Safari (iPhone) で開く
2. 「ホーム画面に追加」でネイティブアプリ風に起動
3. GPS許可ダイアログで「許可」
4. 現場で記録:
   - `📍` 現在地表示（マゼンタ色のマーカーがフェードパルス）
   - `📍` 長押し: 追従モード
   - `＋` 登録: 現在地点／地図タップ点／線描画
   - `＋` → 登録フォームでアイコン形状・色／線種・太さ・色を選択
   - `⬆` 共有: 蓄積したメモをGeoJSONファイルとしてエクスポート
5. 事務所で受信したファイルをPC版「建設課GIS_v1.1.0.html」の「取込」で読込

## PC版取込仕様

エクスポートGeoJSONは PC版の `processImportedFeatures` と互換:
- 各Feature が `_type: "custom"`、`_custom_layer_id: "smartphone_field_memo"` 等を持つ
- PC版は「現場メモ」カスタムレイヤとして自動作成、既存ならFeature追加
- 点の形状・色は `icon_type`/`icon_shape`/`icon_color`、線のスタイルは `line_style`/`line_color`/`line_width` でPC版に引き継がれる

## アーキテクチャ概要

- 地図: Leaflet 1.9.4（CDN）。Canvas renderer + 独自 pane 構成
  - `townRoadsPane` (z-index 440): 町道路線
  - `townBridgesPane` (z-index 450): 町道橋（SVG）
  - `memoPane` (z-index 460): 線メモ
  - `markerPane` (z-index 600): 点メモ（divIcon）
- 点登録／線描画モード中は町道pane に `pointer-events: none` を付与し、町道・橋の上でも新規登録できるようにする
- 保存: `localStorage` に GeoJSON FeatureCollection を1つ格納
- Geocoding: Vercel Serverless Function 経由で APIキーをサーバー側に保持

## バージョン履歴

- v0.1.0: 地図表示・GPS・レイヤ
- v0.2.0: 点登録・写真・フォーム
- v0.3.0: 線登録・長押し確定
- v0.4.0: 3種検索・Geocodingプロキシ
- v0.5.0: PWA・Service Worker
- v0.6.0: エクスポート・Web Share
- v0.7.x: 点形状／色ピッカー、点登録時の町道pane無効化、現在地マゼンタ化＋フェードパルス、各種修正
- v1.0.0: 実機テスト一巡・ドキュメント整備

## 仕様書・実装計画

- 仕様書: `../docs/superpowers/specs/2026-04-18-smartphone-field-app-design.md`
- 実装計画: `../docs/superpowers/plans/2026-04-18-smartphone-field-app.md`
- 実機テスト結果: `docs/test-results-v1.0.0.md`
