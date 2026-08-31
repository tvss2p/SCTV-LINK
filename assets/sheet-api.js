/**
 * sheet-api.js
 * Google Apps Script（Google スプレッドシート連携）とやり取りする共通処理。
 *
 * fetch() は Apps Script 特有の CORS 制約で読み取れないことがあり、
 * その代替として試した JSONP(<script>タグ)方式も、Chromeの CORB
 * (Cross-Origin Read Blocking) によりブロックされることが判明した
 * (Apps ScriptがJavaScriptとして正しいContent-Typeを返さないため)。
 *
 * そのため、隠しiframeで実際にApps ScriptのURLへページ遷移させ、
 * その中から postMessage で結果を送り返してもらう方式を採用する。
 * これは通常のページ遷移+ウィンドウ間メッセージングであり、
 * CORS/CORBのどちらの制約も受けない。
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
   * 隠しiframeでURLへ遷移させ、postMessageで結果を受け取る。
   * Apps Script側は { source: "sctv-link-hub", result: {...} } を
   * window.parent.postMessage() で送ってくる想定。
   */
  function embedRequest(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.setAttribute("aria-hidden", "true");

      function cleanup() {
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }

      function finish(err, data) {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) reject(err);
        else resolve(data);
      }

      function onMessage(event) {
        const data = event.data;
        if (!data || data.source !== "sctv-link-hub") return; // 無関係なメッセージは無視
        finish(null, data.result);
      }

      window.addEventListener("message", onMessage);

      iframe.onerror = function () {
        finish(new Error("NETWORK_ERROR"));
      };

      timer = setTimeout(function () {
        finish(new Error("NETWORK_ERROR"));
      }, timeoutMs || 15000);

      const sep = url.indexOf("?") === -1 ? "?" : "&";
      iframe.src = url + sep + "embed=1";
      document.body.appendChild(iframe);
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
    const body = await embedRequest(url);
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
    const body = await embedRequest(url, 20000);
    if (!body || body.ok !== true) throw new Error("UNAUTHORIZED");
    return { links: Array.isArray(body.links) ? body.links : [] };
  }

  global.SctvSheetApi = { fetchLinks, saveLinks };
})(window);
