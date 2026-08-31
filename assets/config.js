/**
 * config.js
 * Google スプレッドシート連携用の設定。
 *
 * SHEET_API_URL には、Google Apps Script を「ウェブアプリ」としてデプロイした際に
 * 発行される URL（.../exec で終わるもの）を設定してください。
 * 設定方法は README.md の「Google スプレッドシート連携のセットアップ」を参照。
 */
window.SCTV_CONFIG = {
  SHEET_API_URL: "https://script.google.com/macros/s/【ここにデプロイIDを入力】/exec",
};
