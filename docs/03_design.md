# 設計書

## 1. システム構成

```
┌───────────────────────────┐        push (main)        ┌──────────────────────────┐
│  ローカル開発 / Raspberry Pi │ ─────────────────────────▶ │  GitHub リポジトリ         │
│  (git, gh CLI)              │                             │  keikeimm/pt-karte        │
└───────────────────────────┘                             └────────────┬─────────────┘
                                                                          │ GitHub Actions
                                                             ┌────────────▼─────────────┐
                                                             │ .github/workflows/ci.yml │
                                                             │  test → security → deploy│
                                                             └────────────┬─────────────┘
                                                                          │ deploy-pages
                                                             ┌────────────▼─────────────┐
                                                             │  GitHub Pages（静的配信）  │
                                                             │  https://keikeimm.github  │
                                                             │  .io/pt-karte/            │
                                                             └────────────┬─────────────┘
                                                                          │ HTTPS (初回のみ)
                                                             ┌────────────▼─────────────┐
                                                             │  ブラウザ（Chromebook）    │
                                                             │  ┌─────────────────────┐ │
                                                             │  │ Service Worker       │ │ ← app shell をキャッシュ
                                                             │  │ (sw.js)              │ │
                                                             │  └─────────────────────┘ │
                                                             │  ┌─────────────────────┐ │
                                                             │  │ IndexedDB            │ │ ← クライアント/カルテ実データ
                                                             │  │ (clients/charts/     │ │   （このブラウザに閉じる）
                                                             │  │  settings）          │ │
                                                             │  └─────────────────────┘ │
                                                             └───────────────────────────┘
```

サーバーサイドのアプリケーションコードは存在しない。GitHub Pagesは静的ファイルを
配るだけで、クライアントデータは一切通過しない。

## 2. ディレクトリ構成

```
pt-karte/
  index.html            アプリシェル（1画面SPA、ハッシュルーティング）
  manifest.webmanifest   PWAマニフェスト
  sw.js                  Service Worker
  css/styles.css
  js/
    app.js               ルーター＋ビュー描画＋イベントハンドリング（UI層）
    store.js              クライアント/カルテのCRUD（ドメイン層）
    templates.js          カルテテンプレート定義（データ）
    handwriting.js         手書きパッド（Canvas制御）
    export.js              Excel/JSON書き出し・JSON読み込み
    data/
      adapter.js           データ層の唯一の差し替えポイント（re-export）
      local-adapter.js      IndexedDB実装
    vendor/
      xlsx.core.min.js     SheetJS（Excel生成、Apache-2.0）
  icons/                  PWAアイコン（tools/make_icons.py で生成）
  tools/make_icons.py     アイコン生成スクリプト（開発時のみ使用）
  test/                   単体・結合テスト（node:test）
  docs/                   本ドキュメント一式
  .github/workflows/ci.yml
```

## 3. モジュール構成と責務

| モジュール | 責務 | 主な公開関数 |
| --- | --- | --- |
| `app.js` | ハッシュルーティング、DOM生成（`el()`）、モーダル/トースト、画面ごとのビュー関数 | （エントリポイント。exportは持たない） |
| `store.js` | クライアント/チャートのCRUD、会員ID採番、記入日管理 | `newClient`, `nextMemberId`, `listClients`, `saveClient`, `deleteClient`, `createChart`, `saveChart`, `deleteChart`, `listCharts`, `listKartes`, `findChartByRole`, `todayISO` |
| `templates.js` | テンプレート定義（データのみ、副作用なし） | `TEMPLATES`, `getTemplate`, `instantiatePages`, `BODY_CHARTS` |
| `handwriting.js` | Canvas上でのペン入力管理（ストロークのベクタ保存、undo/redo） | `HandwritingPad` クラス |
| `export.js` | Excel/JSON書き出し、JSON読み込み | `exportClientXlsx`, `exportAll`, `importFile` |
| `js/data/adapter.js` | データ層の差し替えポイント（現在は `local-adapter.js` を re-export） | `db`, `uid`, `requestPersistentStorage` |
| `js/data/local-adapter.js` | IndexedDBの薄いラッパー | 上記と同じ関数群の実装 |

依存の向き: `app.js → store.js/handwriting.js/export.js/templates.js`、
`store.js → js/data/adapter.js`、`export.js → js/data/adapter.js, store.js`。
循環依存は無い。

## 4. データモデル（IndexedDB: DB名 `pt-karte`, version 1）

### store: `clients`（keyPath: `id`）

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | 内部ID（`uid('c_')`で生成、ルーティング等に使用） |
| `memberId` | string | 表示用の会員ID（`M00001`形式、自動採番、編集不可） |
| `name` / `kana` | string | 氏名 / フリガナ（必須） |
| `birthday` | string(YYYY-MM-DD) | 生年月日（必須） |
| `sex` | string | 性別（男/女/その他、必須） |
| `phone` / `email` | string | 電話・メール（任意） |
| `goal` | string | 目標（任意） |
| `startDate` | string(YYYY-MM-DD) | 利用開始日（必須） |
| `exerciseHistory` / `injuryHistory` / `medicalNotes` | string | 運動歴・ケガ既往・持病/服薬/アレルギー（任意） |
| `emergencyName` / `emergencyRelation` / `emergencyPhone` | string | 緊急連絡先（任意） |
| `doctor` | string | かかりつけ医・病院（任意） |
| `memo` | string | 備考（任意） |
| `createdAt` / `updatedAt` | number(epoch ms) | 作成/更新日時 |

### store: `charts`（keyPath: `id`、index: `by_client` on `clientId`）

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | `uid('k_')`で生成 |
| `clientId` | string | 紐づくクライアントの`id` |
| `templateId` | string | `counseling` / `precautions` / `karte` |
| `role` | string \| null | `counseling`/`precautions`はrole付き、`karte`はnull |
| `title` | string \| null | role付きはテンプレ名固定、`karte`はnull（日付で管理するため） |
| `date` | string(YYYY-MM-DD) \| null | `karte`のみ使用。記入日 |
| `createdAt` / `updatedAt` | number | 作成/更新日時 |
| `pages` | Page[] | ページ配列（下記） |

### Page（`charts.pages[]`の要素）

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `id` | string | ページID |
| `name` | string | ページ名（タブ表示名） |
| `kind` | `'form'\|'note'\|'canvas'` | ページ種別 |
| `skippable` | boolean | スキップ可否 |
| `skipped` | boolean | スキップ設定中かどうか |
| `bg` | string \| null | canvasページの背景（`BODY_CHARTS`のキー） |
| `fields` | Field[] | formページのフィールド定義（テンプレ由来） |
| `values` | object | フィールド値（`fields[].key`をキーとする） |
| `text` | string | noteページの自由記述本文 |
| `strokes` | Stroke[] | canvasページの手書きストローク |

Stroke: `{ tool: 'pen'|'eraser', color, width(正規化), points: [[x,y,pressure], ...] }`
（座標は0〜1に正規化。画面幅が変わっても再描画できる）

### store: `settings`（keyPath: `key`）

現状未使用（将来のアプリ設定用に予約）。

## 5. 画面遷移

```
#/                              クライアント一覧
  └─ #/client/:id                クライアント詳細（顧客データ＋シート/カルテ一覧）
       └─ #/client/:id/chart/:chartId   カルテ/カウンセリング/注意書きエディタ
```

ハッシュ変更は `window.addEventListener('hashchange', render)` で捕捉し、
`render()` がハッシュを解析して該当ビュー関数を呼ぶ（`viewClientList` /
`viewClientDetail` / `viewChartEditor`）。モーダル（クライアント追加/編集、
バックアップ、削除確認等）は `document.body` に直接オーバーレイを追加する
独立したポップアップとして実装し、ルーティングの対象にはしていない。

## 6. 状態管理・保存方針

- グローバルなstateストアは持たない。各ビュー関数がその都度IndexedDBから
  読み込み、DOMを再構築する（`app().replaceChildren(view)`）
- 入力変更は `touch()`（保存中表示＋`debounce(450ms)`で`saveChart`/`saveClient`
  を呼ぶ）を通して自動保存する。手書きストロークも同じ経路で保存される
- ページ間移動時の表示位置は `sessionStorage`（`pg_<chartId>`キーでページindexのみ）
  に保持。個人情報は入れていない

## 7. PWA構成

- `manifest.webmanifest`: `start_url`/`scope`を相対パス(`.`)にし、GitHub Pagesの
  プロジェクトサイト（`/pt-karte/`配下）でも正しく動作するようにしている
- `sw.js`: install時にapp shell一式を`cache.addAll`。fetchは同一オリジンのみ処理し、
  ナビゲーションはnetwork-first（オフライン時は`index.html`にフォールバック）、
  その他はcache-first。`CACHE_VERSION`を上げるとactivate時に旧キャッシュを破棄する

## 8. テスト戦略

| レイヤ | 手法 | 対象ファイル |
| --- | --- | --- |
| データ層 | `fake-indexeddb`で本物同等のIndexedDBを用意し、`store.js`を直接実行 | `test/store.test.js`, `test/export.test.js` |
| テンプレート | 純粋なデータ検証（DOM不要） | `test/templates.test.js` |
| Canvas/手書き | `jsdom` + canvas 2D contextのフェイク実装、Pointer Eventsを合成発火 | `test/handwriting.test.js` |
| UI結合 | `jsdom`上でハッシュ遷移・クリック/入力イベントを実発火し、実際のユーザー操作に近い形で検証 | `test/app.test.js`, `test/app.chart-editor.test.js` |
| セキュリティ | ソース静的走査＋XSSペイロードを用いた動的検証 | `test/security.test.js` |
| Excel生成 | 実物のSheetJS（`js/vendor/xlsx.core.min.js`）を`vm.runInContext`でjsdomに読み込み、生成→読み戻しで検証 | `test/export.test.js` |

カバレッジは `c8`（`--all --src js`で未実行ファイルも0%として計上、
`js/data/adapter.js`と`js/vendor/**`は対象外）。詳細は
[非機能要件定義書](02_nonfunctional_requirements.md) 参照。

## 9. 将来のBaaS移行設計

`js/data/adapter.js` が唯一の差し替えポイント。`store.js`/`export.js`/`app.js`は
このファイルからしか `db`/`uid`/`requestPersistentStorage` をimportしない。

移行手順（Firebase/Supabase/PocketBase等）:
1. `adapter.js`に書かれている契約（`get`/`getAll`/`getAllByIndex`/`put`/`delete`/
   `clear`/`bulkPut`/`uid`/`requestPersistentStorage`）と同じ関数を持つ
   `firebase-adapter.js`等を新規作成
2. `adapter.js`末尾のre-export先をそちらに変更

これにより`store.js`以下は無修正で動作する想定。`adapter.js`内にFirestore実装例を
コメントで残している。現時点ではまだIndexedDBのみで、移行は未着手。
