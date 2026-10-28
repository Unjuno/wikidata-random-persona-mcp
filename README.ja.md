# Wikidata Random Persona MCP

[English](README.md) · [Sitesへの引き継ぎ](docs/SITES_HANDOFF.md) · [完成判定](docs/READINESS.md)

**人物を生成するMCPではなく、会話相手の参照先をランダムに渡すMCPです。**

MCPは実在人物・架空キャラクターのQID、名前、分類、Wikipedia/WikidataのURLと共通手順を返します。記事を読む・人物像を解釈する・ユーザーと仮想対話するのは利用側のChatGPTです。サーバーにはLLM呼び出し、記事本文保存、任意URL取得、会話履歴保存を追加しません。

## 実装範囲

| 項目 | 内容 |
|---|---|
| random_persona | 登録済みの有効な人物から1人を抽選 |
| get_persona | 登録済みQIDの参照先を取得 |
| 抽選 | 人物単位の均等抽選。実在・架空の混合集合であり、種類ごとの50％固定ではない |
| 言語 | 日本語優先、英語へ代替。記事の優先順であり人物の除外条件ではない |
| 配信停止 | blocked-qids.jsonを両ツールに適用。カタログ単独の巻き戻しでも保持 |
| 更新 | メタデータ照合→候補保存→差分レビュー→ハッシュ付き承認→版の置換 |
| テスト | 単体検証と公式SDKクライアントによる実HTTP接続。実際のChatGPT会話は別の受け入れ試験 |

最初の公開版が実在3件・架空3件の固定デモであった点は、当初のWikidata大量抽選構想に合致していませんでした。現在はWikidata公式ダンプ全体から標本を抽出するパイプラインと、分類別APIによる初期候補の収集機能を用意しています。抽選は承認・配信済みカタログ内で均等に行われ、Wikidataの全人物から一様抽選するわけではありません。登録数は実際のSiteの `/healthz` で確認してください。収集・承認・Sites反映は別工程です。詳細は [WIKIDATA_SAMPLING.md](docs/WIKIDATA_SAMPLING.md) に記載しています。

## 作業環境で実行

Node.js 22以上。CIは22/24で実行します。ローカルPCは必須ではなく、Work/Codexの対応作業環境でも同じコマンドを使います。

```sh
npm ci --ignore-scripts
npm run check
npm run catalog:validate
npm test
npm run test:protocol
npm start
```

Nodeの動作確認先は `http://127.0.0.1:3000/mcp` です。Sitesの接続先ではありません。実装済みのHost/Origin検査と128 KiBの実バイト上限に加えて、本番基盤でアクセス権・レート制限・同時実行数・タイムアウトを確認します。

## カタログ更新

`npm run catalog:refresh` は候補だけを保存します。差分と拒否された項目を確認した後、出力された64桁のSHA-256を使って次のように承認します。ハッシュの単位はなく、型は64文字の16進文字列です。

```sh
npm run catalog:promote -- --reviewed --expected-sha256 REVIEWED_SHA256
```

`REVIEWED_SHA256`はレビューした候補の値へ置換します。バックアップはcatalog.previous.json。配信停止リストは上書きしません。GitHub Actionsの手動ワークフローも候補を作るだけで、自動承認・自動公開はしません。

## 次の作業

[docs/SITES_HANDOFF.md](docs/SITES_HANDOFF.md) の日本語指示をWork/Codexに渡し、Sitesの実ランタイムへ移植します。利用側の共通手順は [CLIENT_WORKFLOW.md](docs/CLIENT_WORKFLOW.md)。ユーザーが長い人格プロンプトを書く設計にはしません。

**GitHubの公開、MCP実装のテスト合格、Sitesへのデプロイ、第三者による利用成功は、それぞれ別の到達点です。** 現在の未検証項目を [READINESS.md](docs/READINESS.md) で確認してください。

### Sites実行アダプター

SitesではNode常駐サーバーを使わず、`sites/worker/index.js` を使います。`npm run build:sites` が承認済みカタログ、配信停止リスト、純粋な抽選ロジックをWorker用出力へまとめ、`/mcp` で `server/discover`・`tools/list`・`tools/call` を提供します。`.openai/hosting.json` はMCP機能を宣言します。HostはSiteの完全一致ホスト名に限定し、Originも同じSiteだけ、本文は実バイト数で128 KiBまでです。認証とSite閲覧可否はSitesがMCP転送前に検査します。アカウント側にトラフィック上限があれば追加設定します。

ツール説明と返却される `guidance` に、記事取得・同一性確認・仮想対話の明示・QID維持・取得失敗の正直な報告を含めます。これはChatGPTへの連携指示であり、実際の閲覧機能や会話挙動の実機確認の代替ではありません。
