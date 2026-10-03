# ALIFO Cloud v1.0

ALIFO専用クラウドの最初の動作版です。

## 現在できること
- ファイルのアップロード
- サーバー上への保存
- ファイルのダウンロード
- ファイル削除
- フォルダ作成
- フォルダを開く / 戻る
- フォルダ削除
- ドラッグ＆ドロップ
- PC / スマホ向け画面

## 起動
Node.js をインストールした環境で:

npm install
npm start

ブラウザで http://localhost:10000 を開きます。

## Render
Render の Web Service として配置できます。
Build Command: npm install
Start Command: npm start

注意:
このv1.0は「ユーザー認証なし」の試作版です。公開サービスとして運用する前に、ログイン、ユーザー別ストレージ、アクセス制御、容量制限、永続ストレージ等を追加してください。
