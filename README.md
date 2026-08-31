# 社内アプリ リンク集（SCTV LINK HUB）

社内向けアプリへのリンクをまとめたスマホ向けリンク集です。GitHub Pages でそのまま公開できる静的サイト（HTML/CSS/JavaScriptのみ、ビルド不要）です。

## 構成

```
index.html          リンク集トップページ（パスワード認証つき）
admin.html          リンクの追加・編集・削除を行う管理ページ（毎回パスワード認証）
assets/style.css    デザイン（白背景・濃紺メイン・オレンジ差し色）
assets/crypto-util.js  Web Crypto API による AES-GCM 暗号化・復号ユーティリティ
assets/seed-data.js 初期リンクデータ（暗号化済み）
assets/storage.js   localStorage 読み書きの共通処理
assets/app.js       トップページのロジック
assets/admin.js     管理ページのロジック
```

## パスワード

現在のパスワードは **`2121`** です。

## 主な仕様

- **パスワード認証**：トップページ・管理ページともに `2121` の入力が必須です。
- **端末の記憶**：トップページは一度ログインに成功した端末では、次回以降パスワード入力なしで自動的に表示されます（`localStorage` に記憶）。「この端末のログイン情報を削除する」リンクでいつでも解除できます。
- **管理ページは毎回認証**：トップページでログイン済みの端末でも、管理ページ (`admin.html`) に入る際は必ずパスワード入力が必要です。
- **未ログイン時の中身の秘匿**：リンク先URL・名称・説明などのデータは `assets/seed-data.js` に AES-GCM（256bit）+ PBKDF2 で暗号化した状態で保存されています。ログイン前に開発者ツールでソースを見ても、暗号文（Base64文字列）しか確認できません。パスワードを入力して復号に成功したときだけ、画面上にリンク一覧が描画されます。
  - 暗号化・復号はブラウザ標準の Web Crypto API のみを使用しており、外部ライブラリ・CDNには依存していません（社内ネットワークなど外部通信が制限された環境でも動作します）。
- **デザイン**：白背景／文字とメインカラーは濃紺／差し色はオレンジ。スマホでの利用を想定し、リンクボタンは大きめのタップ領域にしています。

## 管理ページでのリンク編集について（重要な制約）

このサイトはサーバーやデータベースを持たない「静的サイト」です。そのため管理ページでの追加・編集・削除は、**操作しているブラウザ（端末）の `localStorage` に保存**されます。

- 管理ページで保存すると、その端末・そのブラウザでは、以降トップページを開いたときに変更後の内容が表示されます。
- ただし、**他の人のスマホ・PCには自動的には反映されません**（サーバー上のファイルを書き換えているわけではないため）。
- ブラウザのデータ（キャッシュ・サイトデータ）を消去すると、編集内容は消え、初期リンク一覧（`seed-data.js` の内容）に戻ります。

複数人・複数端末で編集内容を共有したい場合は、以下のいずれかの対応が必要です（今回のバージョンには含まれていません）。

1. 管理ページで編集後、リポジトリの `assets/seed-data.js` を作り直して git push する運用にする（下記「初期リンクの更新方法」参照）。
2. サーバー／データベースを用意し、管理ページからAPI経由で更新する構成に作り替える。

## 初期リンクの更新方法（開発者向け）

初期データ（`assets/seed-data.js`）を直接更新したい場合は、Node.js で以下のように暗号文を再生成し、`window.SCTV_DEFAULT_LINKS_CIPHERTEXT` の値を書き換えてください。

```js
const crypto = require("crypto");

function encrypt(password, plaintext) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, enc, tag]).toString("base64");
}

const data = {
  links: [
    { id: "campaign", name: "①キャンペーン確認サイト", url: "https://tvss2p.github.io/sctv-campaign-site/", description: "…" }
    // ...
  ],
};

console.log(encrypt("2121", JSON.stringify(data)));
```

## セキュリティに関する注意

- パスワードは4桁の数字のみです。暗号化・PBKDF2による保護をかけていますが、これは「開発者ツールで中身をそのまま見えなくする／簡易的なアクセス制御」を目的としたものであり、パスワード自体の強度が低いため、本格的な機密情報の保護には適していません。
- より高いセキュリティが必要な場合は、パスワードを長く複雑なものに変更する、またはサーバーサイド認証（Basic認証・SSOなど）の導入をご検討ください。

## デプロイ方法（GitHub Pages）

1. このリポジトリの Settings → Pages で、公開ブランチを `main`（または運用しているブランチ）、公開ディレクトリを `/`（ルート）に設定します。
2. 数分待つと `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます。
