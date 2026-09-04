# PT カルテ — パーソナルトレーナー向けカルテ管理（モック）

顧客ごとに「ファイル」を分け、カルテ・カウンセリングシート・注意書きを
**オフラインで**記入できる PWA のモックです。Chromebook（Chrome）での利用を想定しています。

**公開URL:** https://keikeimm.github.io/pt-karte/

ビルド不要の素の HTML/CSS/JS。データはすべて閲覧中の端末のブラウザ内
（IndexedDB）に保存され、外部サーバーには送信されません。

---

## できること

| 要件 | 実装 |
| --- | --- |
| 客ごとにファイルを分ける | クライアント一覧。1行=1ファイル。検索・追加 |
| ファイルを開いてカルテに書き込み | クライアント詳細 → カルテを開くとページ単位のエディタ |
| カウンセリングシート・注意書きも開ける | クライアント詳細に専用ボタン（初回カウンセリング / 注意事項・免責同意書） |
| オフライン対応 | Service Worker で一式をキャッシュ。初回読み込み後は機内モードでも動作 |
| 手書きでカルテ記入 | Canvas + ペン（筆圧対応）/ 消しゴム / 色 / 太さ / 取消・やり直し / 人体図・姿勢図の背景 |
| カルテの種類を選択 | 新規作成時にテンプレートを選択（下記6種 + 白紙） |
| 打ち込み可能 | フォーム項目・自由入力テキスト。手書きページにもメモ欄 |
| 指定したページを飛ばせる | 各ページの「このページを飛ばす」トグル。前後送りはスキップ扱い（タップで開くことは可能） |
| 頭に顧客データ | クライアント詳細は顧客データを常時上部表示。各カルテの1ページ目に顧客サマリーを自動表示 |

### カルテテンプレート

1. 初回カウンセリングシート（目標 / 生活習慣 / 食事 / 運動歴 / PAR-Q+ / 整形外科的既往〈人体図〉/ 同意・署名）
2. 姿勢・動作評価シート（静的姿勢〈矢状面・前額面〉/ 関節可動域 / 動作スクリーニング / 総合所見）
3. トレーニングセッション記録（コンディション / メニュー記録 / 有酸素 / 手書きメモ / 申し送り）
4. 体組成・身体測定記録（測定値 / 周径囲 / 写真メモ）
5. 食事・栄養カウンセリング記録（目標PFC / 食事記録 / 振り返り）
6. 注意事項・免責同意書（注意事項 / 免責・キャンセルポリシー / 緊急連絡先）
7. 白紙カルテ（ページを自由に追加。フォーム / 入力 / 手書きを選択）

---

## Chromebook でのインストール（PWA）

1. Chrome で https://keikeimm.github.io/pt-karte/ を開く
2. アドレスバー右の **インストールアイコン**（またはメニュー → 「PT カルテ をインストール」）
3. インストールすると独立したウィンドウで起動し、オフラインでも利用できます

初回はオンラインで一度開いてください（キャッシュ作成のため）。以降はオフライン可。

---

## データの持ち出し・バックアップ

サーバー同期はありません。**ブラウザのサイトデータを削除すると消えます。**

- 一覧画面の「バックアップ」→「全データを書き出す」で JSON を保存
- クライアント詳細の「このクライアントを書き出す（JSON）」で個別保存
- 「JSONを読み込む」で復元（マージ / 全置換を選択）

---

## ローカルで動かす

```sh
cd pt-karte
python3 -m http.server 8000
# http://localhost:8000/ を開く
```

アイコンを作り直す場合: `python3 tools/make_icons.py`（`rsvg-convert` と `Pillow` が必要）

---

## テスト / CI・CD

配信物（`index.html`/`css`/`js`/`sw.js`/`manifest`）はビルド不要のままだが、
テストは Node（`node:test` 標準テストランナー）+ `jsdom`（DOM）+
`fake-indexeddb`（本物同等のIndexedDB）で書いてある。`devDependencies` のみで、
アプリ本体の実行には一切影響しない。

```sh
npm ci                # devDependencies を1回だけインストール
npm test              # 単体・結合テスト（node:test）
npm run test:coverage # カバレッジ計測つき（c8）。lines/branches/functionsに閾値ゲートあり
```

- `test/templates.test.js` / `test/store.test.js` / `test/export.test.js`: テンプレ定義・
  データ層（IndexedDB経由のCRUD）・バックアップ入出力の単体テスト
- `test/handwriting.test.js`: 手書きパッド（ストローク記録・undo/redo・背景切替）の単体テスト
- `test/app.test.js` / `test/app.chart-editor.test.js`: 画面遷移・フォーム入力・
  カルテ編集・ページスキップ送り・テンプレ選択の重複防止などの結合テスト
  （jsdom上でクリック/入力イベントを実際に発火させて検証）
- カバレッジ閾値: **lines/statements 80%, functions 80%, branches 75%**
  （`package.json` の `test:coverage` に指定。除外: `js/data/adapter.js` は
  ただの re-export のため対象外）

**CI/CD**（`.github/workflows/ci.yml`）: push・PR で `test` ジョブ（`npm ci` →
`npm run test:coverage`、失敗すればビルド全体が赤くなる）を実行し、`main` への
push 時は `test` が通った場合のみ `deploy` ジョブが GitHub Pages に反映する
（`needs: test` でゲート）。デプロイ物には `test/`・`tools/`・`package*.json` は含めない
（`rsync --exclude` でステージングしてからアップロード）。

---

## アーキテクチャ／将来のBaaS移行について

保存先は `js/data/adapter.js` の1ファイルに集約してあり、`store.js` / `export.js` /
`app.js` はこのファイルからしか `db` / `uid` / `requestPersistentStorage` を
import しない。今は `local-adapter.js`（IndexedDB）を re-export しているだけ。

Firebase・Supabase・PocketBaseなど無料枠のある汎用BaaSに乗せ替えたくなったら:

1. `js/data/adapter.js` に書いてある契約（`get`/`getAll`/`getAllByIndex`/`put`/
   `delete`/`clear`/`bulkPut`/`uid`/`requestPersistentStorage`）と同じ関数を持つ
   `firebase-adapter.js` 等を新規作成
2. `adapter.js` 末尾の re-export 先をそちらに変更

の2ステップで済み、`store.js` 以下は無修正で動く想定。Firestoreはオフライン
キャッシュ＋オンライン復帰時の自動同期を標準搭載しているので、「オフライン
必須」の要件を保ったままクラウド同期を足せる（`adapter.js` 内にコード例あり）。

**現時点ではまだIndexedDBのみ。移行は未着手。**

---

## 制限（モックのため）

- 認証・複数端末同期・監査ログなし
- データは端末内 IndexedDB のみ（上記バックアップで持ち出し）
- 公開リポジトリですがコードのみ。顧客データはリポジトリに含まれません
- 手書きは Pointer Events 対応ブラウザが必要（Chrome/Edge/Safari の最近のバージョン）

## ライセンス

MIT
