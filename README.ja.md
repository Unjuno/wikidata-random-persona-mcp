# Wikidataランダム人物MCP

このリポジトリは、**実在人物と架空キャラクターのWikidata IDと参照URLを管理し、MCPツールからランダムに1件返す**ための実装です。

## 設計上、やらないこと

- MCP側で人格設定をLLM生成しない
- Wikipediaの記事全文を保存・再配布しない
- 取得した実在人物の架空の発言を実際の発言として表示しない
- 利用側のAIにWeb閲覧能力があると決めつけない
- GitHub公開だけでMCPが稼働すると思わない

## 責任分担

| 担当 | 責任 |
|---|---|
| カタログ更新処理 | Wikidataからラベル・分類・sitelinkを取得、検査して承認候補を作る |
| MCP (`random_persona`) | 承認済みカタログから選択、名前・QID・参照URL・共通の利用手順を返す |
| 利用側ChatGPT/Codex | URLの記事を取得し、事実と推測を区別して人物像を解釈し、仮想会話を行う |

## 動作環境と確認

- Node.js 22以上、ESM、MCP SDK v2（`@modelcontextprotocol/server`）
- 外部依存なしのドメイン単体テスト: `npm test`
- SDKを含むMCP接続検証: `npm install`実行後、ChatGPT Sitesの実際のホスト環境で実施する
- 生成済みカタログは初期サンプル6件。大量データの取り込み・網羅性は未完成

## リポジトリを作成したら

1. GitHubで `Unjuno/wikidata-random-persona-mcp` を公開・空リポジトリとして作成する
2. 本プロジェクトのファイルをリポジトリへ登録する（ChatGPTのGitHub連携でファイルの書き込みが可能）
3. `npm run check`、`npm test`、`npm run catalog:validate` をGitHub Actionsで確認する
4. ChatGPT Work/Codexに [`docs/SITES_HANDOFF.md`](docs/SITES_HANDOFF.md) を渡し、SitesへMCPツールを追加・動作確認する
5. 一般公開についてはSitesプラグインの共有制限と公開申請条件を別途判定する

## 将来の拡張

- 承認済みQIDカタログの段階的拡充
- 日本語Wikipedia記事を優先する収集・再検査
- フィクション分類の下位クラス判定、一覧記事の除外
- 最終利用側での資料取得成功率・会話開始率の検証

開発者・運用者向け設計は [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、具体的なSites引き継ぎは [`docs/SITES_HANDOFF.md`](docs/SITES_HANDOFF.md) を参照してください。