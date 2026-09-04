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
| カルテは1種類 | タブ（ページ）切替で「各項目」＋「白紙の手書き・自由記述」欄を行き来する構成に統一 |
| 打ち込み可能 | フォーム項目・自由入力テキスト。手書きページにもメモ欄 |
| 指定したページを飛ばせる | 各ページの「このページを飛ばす」トグル。前後送りはスキップ扱い（タップで開くことは可能） |
| 頭に顧客データ | クライアント詳細は顧客データを常時上部表示。各カルテの1ページ目に顧客サマリーを自動表示 |
| カルテは記入日で管理 | 「＋ 本日のカルテ」でその場で作成（テンプレ選択なし）。記入日はその場で変更可、一覧は日付の新しい順 |
| 会員IDを自動採番 | クライアント新規登録時に `M00001` 形式で自動付与（手入力・編集は不可） |
| 必須項目は最小限 | 氏名・フリガナ・生年月日・性別・利用開始日のみ必須。電話・メールは任意 |
| 緊急連絡先は基本情報に統合 | 旧・注意書きテンプレの「緊急連絡先・かかりつけ医」ページを廃止し、クライアント基本情報の項目に統合 |

### シート構成

- **カウンセリングシート**・**注意事項・免責同意書**: クライアント詳細の専用ボタンから開く固定の様式（1クライアントにつき通常1件）
- **カルテ**: 記入日ごとに1件。タブは「本日の記録」（体調・睡眠・体重・体脂肪率・メモ）／「メニュー・測定記録」（種目や測定値の表）／「白紙（手書き・自由記述）」（人体図・姿勢図を背景に選べる手書き＋メモ）の3つ

---

## Chromebook でのインストール（PWA）

1. Chrome で https://keikeimm.github.io/pt-karte/ を開く
2. アドレスバー右の **インストールアイコン**（またはメニュー → 「PT カルテ をインストール」）
3. インストールすると独立したウィンドウで起動し、オフラインでも利用できます

初回はオンラインで一度開いてください（キャッシュ作成のため）。以降はオフライン可。

---

## データの持ち出し・バックアップ

サーバー同期はありません。**ブラウザのサイトデータを削除すると消えます。**

- 一覧画面の「バックアップ」→「全データを書き出す」で JSON を保存、「JSONを読み込む」で復元
  （マージ / 全置換を選択）。アプリ自身の全データを退避・復元するための内部用フォーマット
- クライアント詳細の「このクライアントを書き出す（Excel）」で **.xlsx** を書き出し。
  シートは **基本情報 / カウンセリングシート / 同意書 / カルテ** の4枚に分かれ、
  カルテシートは記入日ごとに見出しを立てて並ぶ。人に渡す書類・印刷用途向けで、
  アプリへの読み込みには対応しない（読み込みは上記JSONバックアップのみ）

Excel生成は [SheetJS](https://sheetjs.com)（`js/vendor/xlsx.core.min.js`、Apache-2.0、
詳細は `js/vendor/README.md`）をオフライン動作のため同梱・キャッシュしている。

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
  カルテの記入日管理（作成・表示順・その場での日付変更）・ページスキップ送りなどの
  結合テスト（jsdom上でクリック/入力イベントを実際に発火させて検証）
- `test/security.test.js`: セキュリティテスト。ソースの静的検証（外部通信・
  `eval`・`innerHTML`代入・外部URL参照が無いこと）と、XSSペイロード（HTML/scriptタグ）
  をクライアント名・メモ・テーブル欄・JSONバックアップ経由で実際に流し込み、
  DOMに注入されないことの動的検証
- カバレッジ閾値: **lines/statements 80%, functions 80%, branches 75%**
  （`package.json` の `test:coverage` に指定。除外: `js/data/adapter.js` は
  ただの re-export のため対象外）

**CI/CD**（`.github/workflows/ci.yml`）: push・PR で `test`（`npm ci` →
`npm run test:coverage`、失敗すればビルド全体が赤くなる）と `security`
（`npm audit --audit-level=high`）を実行し、`main` への push 時はその両方が
通った場合のみ `deploy` ジョブが GitHub Pages に反映する（`needs: [test, security]`
でゲート）。デプロイ物には `test/`・`tools/`・`package*.json` は含めない
（`rsync --exclude` でステージングしてからアップロード）。

---

## セキュリティ

顧客データは常にこの端末のブラウザ内（IndexedDB）に閉じ、ユーザーが明示的に
書き出さない限り外部に送信されない設計。具体的な対策・検証方法は
[非機能要件定義書](docs/02_nonfunctional_requirements.md) §3 と
`test/security.test.js` を参照。要点:

- XSS対策: 画面描画は常に `textContent`/属性経由（`innerHTML`にユーザー入力を渡さない）
- Excel書き出しの数式インジェクション対策: `=`/`+`/`-`/`@`で始まる値を無害化してから書き込む
- 外部通信ゼロ（`fetch`/`XMLHttpRequest`等を自前コードで使用していない）
- 依存パッケージの脆弱性をCIで`npm audit`ゲート

---

## ドキュメント

要件・設計・仕様・運用の詳細は [`docs/`](docs/README.md) を参照:
機能要件定義書・非機能要件定義書・設計書・仕様書・運用手順書。

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
