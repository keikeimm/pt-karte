# vendor/

外部ライブラリを直接同梱するディレクトリ（ビルド不要方針のため、npm経由の
バンドルではなく本体ファイルをそのまま置いている）。

- `xlsx.core.min.js` — [SheetJS](https://sheetjs.com) `xlsx` パッケージ v0.18.5 の
  core ビルド（`npm pack xlsx@0.18.5` の `dist/xlsx.core.min.js` をそのままコピー）。
  ライセンス: Apache-2.0（`xlsx-LICENSE.txt`）。
  `index.html` で通常の `<script>`（非モジュール）として読み込み、グローバル
  `XLSX` を生やす。`js/export.js` がそれを参照して Excel 書き出しに使う。
  オフライン対応のため `sw.js` のプリキャッシュ対象にも入れてある。
  更新する場合は `npm pack xlsx@<version>` して `dist/xlsx.core.min.js` を
  差し替え、`xlsx-LICENSE.txt` も同梱のものに更新すること。
