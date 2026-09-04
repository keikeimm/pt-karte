# docs/ 目次

「PT カルテ」の要件・設計・仕様・運用に関するドキュメント一式。

| # | ドキュメント | 内容 |
| --- | --- | --- |
| 01 | [機能要件定義書](01_functional_requirements.md) | 何を実現するか（機能一覧・ユースケース・スコープ外事項） |
| 02 | [非機能要件定義書](02_nonfunctional_requirements.md) | 性能・セキュリティ・可用性・保守性など、機能以外の要件 |
| 03 | [設計書](03_design.md) | システム構成・モジュール構成・データモデル・画面遷移・テスト戦略 |
| 04 | [仕様書](04_specification.md) | 画面項目・バリデーション・カルテテンプレート・Excel/JSON入出力の詳細仕様 |
| 05 | [運用手順書](05_operations_manual.md) | デプロイ・バックアップ・障害対応・依存ライブラリ更新などの実務手順 |

対象リポジトリ: `github.com/keikeimm/pt-karte`
公開URL: https://keikeimm.github.io/pt-karte/

これらのドキュメントは実装（`js/`・`test/`・`.github/workflows/ci.yml`）と対応させて
書いている。実装を変更したら該当ドキュメントも合わせて更新すること。
