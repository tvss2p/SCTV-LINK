/**
 * sheet-api.js
 * Google Apps Script（Google スプレッドシート連携）とやり取りする共通処理。
 */
(function (global) {
  function getApiUrl() {
    const url = window.SCTV_CONFIG && window.SCTV_CONFIG.SHEET_API_URL;
    if (!url || url.indexOf("ここにデプロイID") !== -1) {
      throw new Error("NOT_CONFIGURED");
    }
    return url;
  }

  /**
   * パスワードを添えてリンク一覧を取得する。
   * 戻り値: { links: [...] }
   * パスワードが違う場合は Error("UNAUTHORIZED") を throw。
   * 通信に失敗した場合は Error("NETWORK_ERROR") を throw。
   * 未設定(config.js未編集)の場合は Error("NOT_CONFIGURED") を throw。
   */
  async function fetchLinks(password) {
    const apiUrl = getApiUrl(); // ここで NOT_CONFIGURED の可能性あり
    const url = apiUrl + "?pw=" + encodeURIComponent(password) + "&t=" + Date.now();
    let res;
    try {
      res = await fetch(url, { method: "GET", cache: "no-store" });
    } catch (err) {
      throw new Error("NETWORK_ERROR");
    }
    if (!res.ok) throw new Error("NETWORK_ERROR");
    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new Error("NETWORK_ERROR");
    }
    if (!body || body.ok !== true) throw new Error("UNAUTHORIZED");
    return { links: Array.isArray(body.links) ? body.links : [] };
  }

  /**
   * リンク一覧を保存する（スプレッドシートの中身を丸ごと置き換え）。
   */
  async function saveLinks(password, links) {
    const apiUrl = getApiUrl();
    let res;
    try {
      // Content-Type を明示しない = text/plain の "simple request" となり、
      // Apps Script側でCORSプリフライトの問題を避けられる。
      res = await fetch(apiUrl, {
        method: "POST",
        body: JSON.stringify({ pw: password, links: links }),
      });
    } catch (err) {
      throw new Error("NETWORK_ERROR");
    }
    if (!res.ok) throw new Error("NETWORK_ERROR");
    let body;
    try {
      body = await res.json();
    } catch (err) {
      throw new Error("NETWORK_ERROR");
    }
    if (!body || body.ok !== true) throw new Error("UNAUTHORIZED");
    return { links: Array.isArray(body.links) ? body.links : [] };
  }

  global.SctvSheetApi = { fetchLinks, saveLinks };
})(window);
