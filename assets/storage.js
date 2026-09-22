/**
 * storage.js
 * 「この端末はログイン済み」と「前回表示したリンク一覧」を
 * localStorage に記憶するためのヘルパー。
 *
 * リンク一覧の正本は Google スプレッドシート側にあるが、
 * 毎回サーバーの応答を待っていると表示までに数秒かかるため、
 * 前回取得した内容を控えとして保存しておき、
 * ページを開いた瞬間はそれを表示する（その裏で最新を取りに行く）。
 * (トップページ用。管理ページは毎回パスワード入力が必須のため使用しない)
 */
(function (global) {
  const AUTH_KEY = "sctvlink_auth_v2";
  const LINKS_CACHE_KEY = "sctvlink_links_cache_v1";

  function getSavedPassword() {
    try {
      return localStorage.getItem(AUTH_KEY);
    } catch (err) {
      return null;
    }
  }

  function savePassword(password) {
    try {
      localStorage.setItem(AUTH_KEY, password);
    } catch (err) {
      /* 保存できなくても、その回の表示自体は成立する */
    }
  }

  /**
   * 前回取得したリンク一覧を返す。無い/壊れている場合は null。
   */
  function getCachedLinks() {
    let raw;
    try {
      raw = localStorage.getItem(LINKS_CACHE_KEY);
    } catch (err) {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.links)) return null;
      return parsed.links;
    } catch (err) {
      return null;
    }
  }

  function saveCachedLinks(links) {
    if (!Array.isArray(links)) return;
    try {
      localStorage.setItem(
        LINKS_CACHE_KEY,
        JSON.stringify({ v: 1, savedAt: Date.now(), links })
      );
    } catch (err) {
      /* 容量超過などで保存できなくても、通信して表示する経路は残る */
    }
  }

  function clearCachedLinks() {
    try {
      localStorage.removeItem(LINKS_CACHE_KEY);
    } catch (err) {
      /* no-op */
    }
  }

  function clearAuth() {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch (err) {
      /* no-op */
    }
    clearCachedLinks();
  }

  global.SctvStorage = {
    getSavedPassword,
    savePassword,
    clearAuth,
    getCachedLinks,
    saveCachedLinks,
    clearCachedLinks,
  };
})(window);
