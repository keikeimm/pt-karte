# 運用手順書

## 1. 日常運用

### 1.1 リリース手順

1. `main`ブランチに変更をコミット・push する
2. GitHub Actions（`.github/workflows/ci.yml`）が自動起動:
   - `test`ジョブ: `npm ci` → `npm run test:coverage`（カバレッジ閾値割れで失敗）
   - `security`ジョブ: `npm ci` → `npm audit --audit-level=high`（高/致命的脆弱性で失敗）
   - `deploy`ジョブ: 上記2つが両方成功し、かつ`push`イベント（PRでは動かない）の
     場合のみ、GitHub Pagesへデプロイ
3. 進捗確認: `gh run list --repo keikeimm/pt-karte --limit 5` /
   `gh run watch <run-id> --repo keikeimm/pt-karte`
4. デプロイ後、`https://keikeimm.github.io/pt-karte/` を `curl -sI` 等で200確認する

### 1.2 手動再デプロイ

Pages設定は変えずワークフローだけ再実行したい場合:
```sh
gh workflow run "CI / Deploy to GitHub Pages" --repo keikeimm/pt-karte
```

## 2. バックアップ運用

- **推奨頻度**: 新規クライアント登録やカルテ記入があった営業日の終わりに
  1回、クライアント一覧の「バックアップ」→「全データを書き出す」でJSONを保存する
- 保存先はトレーナー側で管理（クラウドストレージ等、この文書の範囲外）。
  端末の紛失・初期化・サイトデータ削除に備える唯一の手段であることに注意
- 復元は「JSONを読み込む」。同一データの重複防止のため、通常は「マージ」を使う。
  完全にクリーンな状態から復元したい場合のみ「全置換」を使う（既存データは消える）
- クライアント個別のExcel書き出し（「このクライアントを書き出す（Excel）」）は
  human-readableな控え・印刷用であり、**復元には使えない**（読み込み機能なし）

## 3. Pages / CI の障害対応

### 3.1 `test`ジョブが失敗する

1. `gh run view <run-id> --log --repo keikeimm/pt-karte` でテストの失敗箇所を確認
2. ローカルで再現: `npm ci && npm run test:coverage`
3. カバレッジ閾値割れの場合は `coverage/` の text reportで不足ファイルを特定し、
   テストを追加する（閾値は `package.json` の `test:coverage` スクリプトで指定）

### 3.2 `security`ジョブ（`npm audit`）が失敗する

1. ローカルで `npm audit` を実行し、対象パッケージと深刻度を確認
2. 対応方針:
   - 該当パッケージの新バージョンで修正されている場合: `npm update <pkg>` して
     `package-lock.json`をコミット
   - 修正版が無い/devDependency止まりで実害が無いと判断した場合:
     一時的に `npm audit --audit-level=high` の対象から除外するのではなく、
     `docs/02_nonfunctional_requirements.md` に受容理由を明記した上で
     `npm audit --audit-level=critical` に緩めるなど、変更の跡が残る形で対応する
     （安易な `continue-on-error` は避ける）
3. 本番配信物（`index.html`/`js`/`css`）はnpm依存を持たないため、
   devDependenciesの脆弱性はテスト実行環境のみに影響する点を切り分けて判断する

### 3.3 `deploy`ジョブが失敗する / Pagesが403になる

- GitHub Pagesは**手動で一度**「Settings → Pages → Build and deployment →
  Source: GitHub Actions」に設定しておく必要がある（fine-grained PATおよび
  Actions既定の`GITHUB_TOKEN`のどちらもPagesサイトの新規作成はできないため）。
  設定がリセットされた場合はこの手順をやり直す
- 上記設定済みなら、以後は`deploy`ジョブが自動でPagesを更新する

### 3.4 PWAの更新が端末に反映されない

- Service Workerのキャッシュが古いバージョンを返し続けている可能性が高い
- `sw.js`の`CACHE_VERSION`を上げてデプロイする（`activate`イベントで旧キャッシュを破棄する）
- 利用者側での回避策: ブラウザの「サイトデータを削除」またはSWの強制更新
  （DevTools → Application → Service Workers → Update on reload）

## 4. 依存ライブラリの更新

### 4.1 devDependencies（jsdom / fake-indexeddb / c8）

```sh
npm outdated
npm update            # package-lock.json も更新される
npm run test:coverage # 更新後に必ずローカルでフルテストを回す
```
破壊的変更が疑われる場合は `npm install <pkg>@<version>` で個別に上げ、
`CHANGELOG`を確認してからテストを回す。

### 4.2 SheetJS（`js/vendor/xlsx.core.min.js`）の更新

このファイルはnpm経由でインストールせず、ビルド物を直接コピーして同梱している
（配信物をビルド不要に保つため）。更新手順:

```sh
cd /tmp && npm pack xlsx@<新バージョン>
tar xf xlsx-<新バージョン>.tgz
cp package/dist/xlsx.core.min.js  <repo>/js/vendor/xlsx.core.min.js
cp package/LICENSE                <repo>/js/vendor/xlsx-LICENSE.txt
```
その後 `sw.js` の `CACHE_VERSION` を上げ、`npm test`（`test/export.test.js`が
実物のライブラリを読み込んで検証する）を実行して壊れていないことを確認する。

## 5. セキュリティ運用

- **原則**: 顧客データは常にブラウザ内IndexedDBに閉じる。新機能を追加する際は
  「外部通信を発生させないか」「`innerHTML`にユーザー入力を渡していないか」を
  必ずレビューし、`test/security.test.js`の静的検証テストが対象コードを
  カバーするようにファイル追加時はリストに含める
- 新しいユーザー入力欄をExcel書き出しに追加する場合は、必ず`sanitizeCell()`を
  経由させる（数式インジェクション対策、詳細は仕様書 §5）
- インシデント（顧客データが意図せず外部に出た疑い等）を発見した場合の考え方:
  1. まず該当コードが外部通信を行っていないか（`test/security.test.js`の
     静的検証テストをローカルで再実行）を確認する
  2. ブラウザ拡張機能等、アプリ外の要因の可能性も切り分ける
  3. 影響範囲（対象クライアント、対象端末）を特定し、必要であればJSONバックアップの
     世代を遡って比較する
- 依存パッケージの脆弱性対応は §3.2 参照

## 6. よくあるトラブルシューティング

| 症状 | 原因/対処 |
| --- | --- |
| オフラインにすると真っ白になる | 初回オンライン時にService Workerのインストールが完了していない。一度オンラインで開き直す |
| 手書きが描けない（線が出ない） | Pointer Events非対応の古いブラウザの可能性。対象ブラウザ（Chrome/Edge/Safari最新）を確認 |
| Excel書き出しが失敗する | `js/vendor/xlsx.core.min.js`の読み込み前に`js/app.js`が実行された可能性。`index.html`でvendorスクリプトが`type="module"`のapp.jsより前に書かれているか確認 |
| カルテ一覧の並び順がおかしい | `chart.date`が空/不正な値になっていないか確認（`listKartes()`は`date`の文字列比較でソートするためYYYY-MM-DD形式であることが前提） |
| PWAとしてインストールできない | `manifest.webmanifest`のicons/start_url、HTTPS配信、Service Worker登録の3条件を確認 |
