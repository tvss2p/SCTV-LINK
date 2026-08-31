/**
 * sheet-api.js
 * Google Apps Script（Google スプレッドシート連携）とやり取りする共通処理。
 *
 * Apps Script のウェブアプリはブラウザから呼び出す際に複数の落とし穴があるため、
 * 2つの通信方式を順に試す（片方が塞がれても、もう片方で通る）。
 *
 *   方式1: fetch()
 *     デプロイが「全員(匿名可)」で公開されていれば、これが最もシンプルで確実。
 *     ただしCORS制約で弾かれることがある。
 *
 *   方式2: 隠しiframe + postMessage
 *     CORS/CORBの影響を受けない。ただしApps ScriptのHtmlServiceは
 *     コンテンツを独自の入れ子iframeでラップして配信するため、
 *     Apps Script側は window.parent ではなく window.top へ送る必要がある
 *     （Code.gs 側で対応済み）。
 *
 * 【重要】どちらの方式も、Apps Scriptのデプロイ設定が
 * 「アクセスできるユーザー: 全員」になっている必要がある。
 * 「Googleアカウントを持つ全員」だとログインが要求され、
 * ブラウザからの呼び出しはログイン画面にリダイレクトされて失敗する
 * （ブラウザで直接URLを開くと自分はログイン済みなので成功して見える）。
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
   * 方式1: fetch() で取得する。
   */
  async function viaFetch(url) {
    let res;
    try {
      res = await fetch(url, { method: "GET" });
    } catch (err) {
      throw new Error("FETCH_BLOCKED"); // CORSなどでブロックされた
    }
    if (!res.ok) throw new Error("FETCH_BLOCKED");
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (err) {
      // JSONでない = ログイン画面などが返ってきている
      throw new Error("NOT_JSON");
    }
  }

  /**
   * 方式2: 隠しiframeでURLへ遷移させ、postMessageで結果を受け取る。
   * Apps Script側は { source: "sctv-link-hub", result: {...} } を
   * window.top / window.parent へ postMessage してくる想定。
   */
  function viaIframe(url, timeoutMs) {
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
        finish(new Error("IFRAME_FAILED"));
      };

      timer = setTimeout(function () {
        finish(new Error("IFRAME_TIMEOUT"));
      }, timeoutMs || 15000);

      const sep = url.indexOf("?") === -1 ? "?" : "&";
      iframe.src = url + sep + "embed=1";
      document.body.appendChild(iframe);
    });
  }

  /**
   * 方式1 → 方式2 の順に試す。
   * 両方失敗した場合は Error("NETWORK_ERROR") を throw。
   * 詳細な失敗理由は err.details に配列で入れる（debug.html用）。
   */
  async function request(url, timeoutMs) {
    const details = [];
    try {
      return await viaFetch(url);
    } catch (err) {
      details.push("fetch: " + err.message);
    }
    try {
      return await viaIframe(url, timeoutMs);
    } catch (err) {
      details.push("iframe: " + err.message);
    }
    const error = new Error("NETWORK_ERROR");
    error.details = details;
    throw error;
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
    const body = await request(url);
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
    const body = await request(url, 20000);
    if (!body || body.ok !== true) throw new Error("UNAUTHORIZED");
    return { links: Array.isArray(body.links) ? body.links : [] };
  }

  global.SctvSheetApi = { fetchLinks, saveLinks, viaFetch, viaIframe, getApiUrl };
})(window);
