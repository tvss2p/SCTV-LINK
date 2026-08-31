/**
 * sheet-api.js
 * Google Apps Script（Google スプレッドシート連携）とやり取りする共通処理。
 *
 * fetch() で直接呼び出すと、Apps Script の仕様上ブラウザのCORS制約に
 * かかり読み取れない場合があるため、CORSの影響を受けない
 * JSONP方式（<script>タグでの読み込み）で通信する。
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
   * UTF-8文字列をbase64に変換する（日本語を含むJSONをURLに安全に載せるため）。
   */
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  /**
   * JSONP方式でリクエストを送る。
   * <script src="url&callback=xxx"> を挿入し、Apps Script側が
   * xxx(...) を呼び出す形でレスポンスを受け取る。CORSの影響を受けない。
   */
  function jsonp(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const callbackName =
        "sctvJsonp_" + Date.now() + "_" + Math.floor(Math.random() * 1e9);
      const script = document.createElement("script");
      let settled = false;
      let timer;

      function cleanup() {
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
        clearTimeout(timer);
      }

      window[callbackName] = function (data) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(data);
      };

      script.onerror = function () {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("NETWORK_ERROR"));
      };

      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("NETWORK_ERROR"));
      }, timeoutMs || 15000);

      const sep = url.indexOf("?") === -1 ? "?" : "&";
      script.src = url + sep + "callback=" + encodeURIComponent(callbackName);
      document.head.appendChild(script);
    });
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
    const body = await jsonp(url);
    if (!body || body.ok !== true) throw new Error("UNAUTHORIZED");
    return { links: Array.isArray(body.links) ? body.links : [] };
  }

  /**
   * リンク一覧を保存する（スプレッドシートの中身を丸ごと置き換え）。
   */
  async function saveLinks(password, links) {
    const apiUrl = getApiUrl();
    const payload = utf8ToBase64(JSON.stringify({ links }));
    const url =
      apiUrl +
      "?pw=" + encodeURIComponent(password) +
      "&action=save" +
      "&data=" + encodeURIComponent(payload) +
      "&t=" + Date.now();
    const body = await jsonp(url, 20000);
    if (!body || body.ok !== true) throw new Error("UNAUTHORIZED");
    return { links: Array.isArray(body.links) ? body.links : [] };
  }

  global.SctvSheetApi = { fetchLinks, saveLinks };
})(window);
