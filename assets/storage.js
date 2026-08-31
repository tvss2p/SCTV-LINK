/**
 * storage.js
 * 「この端末はログイン済み」を記憶するための localStorage ヘルパー。
 * リンクの中身は Google スプレッドシート側にあり、この端末には保存しない。
 * (トップページ用。管理ページは毎回パスワード入力が必須のため使用しない)
 */
(function (global) {
  const AUTH_KEY = "sctvlink_auth_v2";

  function getSavedPassword() {
    return localStorage.getItem(AUTH_KEY);
  }

  function savePassword(password) {
    localStorage.setItem(AUTH_KEY, password);
  }

  function clearAuth() {
    localStorage.removeItem(AUTH_KEY);
  }

  global.SctvStorage = { getSavedPassword, savePassword, clearAuth };
})(window);
