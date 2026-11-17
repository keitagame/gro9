# gro9 (Next.js)

OpenAI互換API(`/chat/completions`)に対応した、Grok/ChatGPT風のチャットUI。Markdown(表・コードブロック・リスト等)表示に対応。

- 画面上部の「モデル / API設定」からエンドポイント・APIキー・モデルIDを追加(初期モデルなし)
- 「システムプロンプト」から全モデル共通のシステムプロンプトを設定
- 設定・履歴はブラウザのlocalStorageに保存
- `/api/chat` (Edge Function) がCORS回避とストリーミング中継を担当

## ローカル起動
    npm install
    npm run dev

## Vercelデプロイ
1. このフォルダをGitHubにpush
2. Vercelで「Add New → Project」からリポジトリをインポート(設定変更不要)
3. Deploy

環境変数は不要です。
