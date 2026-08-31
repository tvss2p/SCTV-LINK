/**
 * storage.js
 * localStorage の読み書きをまとめたヘルパー。
 * - LINKS_KEY   : 管理ページで保存したリンク一覧(暗号化済み)。無ければ初期データを使う。
 * - AUTH_KEY    : リンク集トップページ用「この端末はログイン済み」情報(パスワードそのものを保持し、
 *                 次回訪問時に自動復号するために使う)。管理ページはこれを使わず毎回入力を必須にする。
 */
(function (global) {
  const LINKS_KEY = "sctvlink_links_cipher_v1";
  const AUTH_KEY = "sctvlink_auth_v1";

  function getCurrentCipherText() {
    return localStorage.getItem(LINKS_KEY) || window.SCTV_DEFAULT_LINKS_CIPHERTEXT;
  }

  function saveLinksCipherText(cipherText) {
    localStorage.setItem(LINKS_KEY, cipherText);
  }

  function getSavedPassword() {
    return localStorage.getItem(AUTH_KEY);
  }

  function savePassword(password) {
    localStorage.setItem(AUTH_KEY, password);
  }

  function clearAuth() {
    localStorage.removeItem(AUTH_KEY);
  }

  global.SctvStorage = {
    getCurrentCipherText,
    saveLinksCipherText,
    getSavedPassword,
    savePassword,
    clearAuth,
  };
})(window);
