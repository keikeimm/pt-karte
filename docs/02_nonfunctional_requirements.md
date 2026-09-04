# 非機能要件定義書

## 1. 可用性・オフライン動作

| 要件 | 実装 |
| --- | --- |
| 初回読み込み後はネットワーク切断でも全機能利用可 | Service Worker (`sw.js`) が app shell 一式（HTML/CSS/JS/アイコン/vendorライブラリ）をキャッシュ。ナビゲーションは network-first、その他は cache-first |
| キャッシュの更新漏れ防止 | 資材を変更したら `CACHE_VERSION` を上げる運用（`activate` で旧キャッシュを破棄） |
| 端末データの永続化 | `navigator.storage.persist()` を起動時に要求し、ストレージが自動追い出しされにくくする |

## 2. 性能

- ビルド不要の素の HTML/CSS/JS（ES Modules）。バンドルサイズの最適化よりも
  「依存が壊れない・誰でも読める」ことを優先する
- 3rd partyライブラリはExcel生成用の SheetJS (`js/vendor/xlsx.core.min.js`, 約430KB)
  のみ。初回のみダウンロードし、以降はService Workerキャッシュから読む
- IndexedDBアクセスはクライアント/カルテ単位の小規模データを想定しており、
  件数が数千件規模になっても実用上問題ない設計（インデックス `by_client` で
  クライアント単位の絞り込みをO(1)相当にしている）

## 3. セキュリティ（情報漏えい防止）

**基本方針: データは常にこの端末のブラウザ内（IndexedDB）に閉じ、ユーザーが
明示的に書き出し操作をしない限り一切外部に送信されない。**

| 観点 | 対策 | 検証 |
| --- | --- | --- |
| 外部通信の禁止 | アプリコード（`js/*.js`、`js/data/*.js`）は `fetch`/`XMLHttpRequest`/`sendBeacon`/`WebSocket` を一切使わない（`sw.js` の同一オリジンfetchのみ例外） | `test/security.test.js` の静的検証テストでソースを走査 |
| XSS（クロスサイトスクリプティング）対策 | 画面描画は自前の `el()` ヘルパー経由で常に `textContent`/属性経由の値渡しのみ行い、`innerHTML` へユーザー入力を渡す経路が無い。人体図SVGは固定マップ (`BODY_CHARTS`) からのみ参照する | `test/security.test.js` でHTML/scriptペイロードを実際にクライアント名・メモ・テーブル欄・JSONバックアップ経由で流し込み、DOMに要素が注入されないことを確認 |
| Excel数式インジェクション対策 | Excel書き出し時、セル値が `= + - @` や制御文字で始まる場合は先頭に `'` を付与し、文字列として扱わせる（`js/export.js` の `sanitizeCell()`） | `test/export.test.js` で数式的な文字列を実際に書き出し、SheetJSで読み戻してセル型が文字列(`s`)であり数式(`f`)になっていないことを確認 |
| 依存パッケージの脆弱性 | `devDependencies`（jsdom/fake-indexeddb/c8）を対象にCIで `npm audit --audit-level=high` を実行し、高/致命的脆弱性があればビルドを失敗させる | `.github/workflows/ci.yml` の `security` ジョブ |
| 外部オリジン参照の禁止 | `index.html`/`manifest.webmanifest`/`css/styles.css` は同一オリジンのリソースのみ参照 | `test/security.test.js` |
| 危険なJS APIの不使用 | `eval` / `new Function` / `document.write` を使わない | `test/security.test.js` |
| リポジトリへの実データ混入防止 | リポジトリは public だがコード・テストのみ。顧客データはコミットされない（`.gitignore` で `node_modules`/`coverage` を除外、テストは全て合成データ） | 目視レビュー運用 |

**残存リスク（既知の限界。詳細は [運用手順書](05_operations_manual.md) の該当節）**:
- 端末そのものの紛失・盗難、ブラウザの別拡張機能によるDOM改ざんは対象外
  （OSログイン・画面ロック等、端末側のセキュリティに依存する）
- 書き出したExcel/JSONファイル自体の取り扱い（送付経路の暗号化等）はユーザー運用に委ねる
- `js/vendor/xlsx.core.min.js` は自前の監査対象外（SheetJS社のOSSを検証無しで信頼している）

## 4. 保守性

- モジュールは責務ごとに分割: `app.js`（UI/ルーティング）, `store.js`（CRUD）,
  `templates.js`（テンプレ定義）, `handwriting.js`（手書きパッド）,
  `export.js`（書き出し）, `js/data/adapter.js`（データ層の差し替えポイント）
- テストは `node:test` + `jsdom` + `fake-indexeddb` によるユニット/結合テスト。
  **カバレッジ閾値: lines/statements 80%、functions 80%、branches 75%**
  （`npm run test:coverage`、閾値を割ると失敗する）
- CIで `test`（カバレッジゲート）・`security`（npm audit）の両方が通らないと
  `main` へのデプロイが実行されない

## 5. 互換性

- 対象ブラウザ: Chrome / ChromeOS（Chromebook）。Pointer Events APIを使うため、
  最近の Chrome/Edge/Safari であれば概ね動作する
- レスポンシブ対応（`css/styles.css` の `@media` でモバイル幅に対応）だが、
  主要な利用シーンはタブレット/Chromebookの画面サイズを想定

## 6. 拡張性

- 保存先（IndexedDB）は `js/data/adapter.js` に集約し、`get/getAll/getAllByIndex/
  put/delete/clear/bulkPut/uid/requestPersistentStorage` という契約を満たす
  別実装（Firebase/Supabase/PocketBase等）に差し替えられる設計にしてある
  （詳細は [設計書](03_design.md) 参照）

## 7. 運用性

- デプロイは GitHub Actions による自動化（push to main → test/security →
  GitHub Pages へデプロイ）
- バックアップはユーザー操作（JSON書き出し）に依存するため、
  運用手順書に推奨頻度を明記する
