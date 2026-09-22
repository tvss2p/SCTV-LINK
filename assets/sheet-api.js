/**
 * sheet-api.js
 * Google Apps Script（Google スプレッドシート連携）とやり取りする共通処理。
 *
 * Apps Script のウェブアプリはブラウザから呼び出す際に複数の落とし穴があるため、
 * 2つの通信方式を用意している（片方が塞がれても、もう片方で通る）。
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
 * 【速度について】
 * 以前は「方式1が失敗してから方式2」という直列だったため、
 * fetch()がCORSで弾かれる環境では毎回2回分の往復時間がかかっていた。
 * 現在は読み取り時のみ、先に試す方式に HEAD_START_MS の猶予を与えた上で
 * もう一方も並行して開始し、先に成功した方を採用する。
 * さらに成功した方式を localStorage に覚えておき、次回はそちらを先に試す。
 * （保存(save)はサーバー側で二重に書き込まれないよう、従来どおり直列のまま）
 *
 * 【重要】どちらの方式も、Apps Scriptのデプロイ設定が
 * 「アクセスできるユーザー: 全員」になっている必要がある。
 * 「Googleアカウントを持つ全員」だとログインが要求され、
 * ブラウザからの呼び出しはログイン画面にリダイレクトされて失敗する
 * （ブラウザで直接URLを開くと自分はログイン済みなので成功して見える）。
 */
(function (global) {
  const TRANSPORT_KEY = "sctvlink_transport_v1"; // 前回成功した通信方式
  // 先に試す方式にこれだけ猶予を与えてから、もう一方も並行で開始する。
  // 前回成功した方式が分かっている場合は長めに待ち、サーバーの二重実行を避ける
  // （猶予内に失敗すれば、待たずに即もう一方へ切り替わる）。
  const HEAD_START_KNOWN_MS = 2500;
  const HEAD_START_UNKNOWN_MS = 700;
  // Apps Scriptは一定時間使われないとスリープし、次の1回目だけ起動に10秒前後かかる
  // （実測9〜11秒）。タイムアウトはそれを確実に上回る値にしておく。
  const IFRAME_TIMEOUT_MS = 20000;

  function getApiUrl() {
    const url = window.SCTV_CONFIG && window.SCTV_CONFIG.SHEET_API_URL;
    if (!url || url.indexOf("ここにデプロイID") !== -1) {
      throw new Error("NOT_CONFIGURED");
    }
    return url;
  }

  function getPreferredTransport() {
    try {
      return localStorage.getItem(TRANSPORT_KEY);
    } catch (err) {
      return null; // プライベートブラウズ等でlocalStorageが使えない場合
    }
  }

  function rememberTransport(name) {
    try {
      localStorage.setItem(TRANSPORT_KEY, name);
    } catch (err) {
      /* 覚えられなくても動作に支障はない */
    }
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
      }, timeoutMs || IFRAME_TIMEOUT_MS);

      const sep = url.indexOf("?") === -1 ? "?" : "&";
      iframe.src = url + sep + "embed=1";
      // <head>内から先行呼び出しされる場合はまだ body が無いため documentElement を使う
      (document.body || document.documentElement).appendChild(iframe);
    });
  }

  function networkError(details) {
    const error = new Error("NETWORK_ERROR");
    error.details = details;
    return error;
  }

  /**
   * 方式1 → 方式2 の順に「直列で」試す（保存用）。
   * 同じリクエストが二重にサーバーへ届かないことを優先する。
   */
  async function requestSerial(url, timeoutMs) {
    const details = [];
    try {
      const data = await viaFetch(url);
      rememberTransport("fetch");
      return data;
    } catch (err) {
      details.push("fetch: " + err.message);
    }
    try {
      const data = await viaIframe(url, timeoutMs);
      rememberTransport("iframe");
      return data;
    } catch (err) {
      details.push("iframe: " + err.message);
    }
    throw networkError(details);
  }

  /**
   * 2つの方式を（時間差をつけて）並行して試し、先に成功した方を採用する（読み取り用）。
   * 前回成功した方式を先に、もう一方は HEAD_START_MS 後に開始する。
   * 先に始めた方が猶予時間内に失敗した場合は、待たずにもう一方を開始する。
   */
  function requestParallel(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const details = [];
      const failed = {};
      let settled = false;
      let secondStarted = false;
      let delayTimer;

      const preferred = getPreferredTransport();
      const first = preferred === "iframe" ? "iframe" : "fetch";
      const second = first === "fetch" ? "iframe" : "fetch";
      const headStartMs = preferred ? HEAD_START_KNOWN_MS : HEAD_START_UNKNOWN_MS;

      function run(name) {
        const attempt =
          name === "fetch" ? viaFetch(url) : viaIframe(url, timeoutMs);
        attempt.then(
          function (data) {
            if (settled) return;
            settled = true;
            clearTimeout(delayTimer);
            rememberTransport(name);
            resolve(data);
          },
          function (err) {
            details.push(name + ": " + err.message);
            failed[name] = true;
            if (settled) return;
            if (!secondStarted) {
              startSecond(); // 猶予を待たずに、もう一方へ即座に切り替える
              return;
            }
            if (failed[first] && failed[second]) reject(networkError(details));
          }
        );
      }

      function startSecond() {
        if (secondStarted || settled) return;
        secondStarted = true;
        clearTimeout(delayTimer);
        run(second);
      }

      run(first);
      delayTimer = setTimeout(startSecond, headStartMs);
    });
  }

  /**
   * パスワードを添えてリンク一覧を取得する。
   * 戻り値: { links: [...] }
   * options.fresh を true にすると、サーバー側のキャッシュを無視して
   * スプレッドシートを読み直す（管理ページ用）。
   * パスワードが違う場合は Error("UNAUTHORIZED") を throw。
   * 通信に失敗した場合は Error("NETWORK_ERROR") を throw。
   * 未設定(config.js未編集)の場合は Error("NOT_CONFIGURED") を throw。
   */
  async function fetchLinks(password, options) {
    const apiUrl = getApiUrl(); // ここで NOT_CONFIGURED の可能性あり
    const url =
      apiUrl +
      "?pw=" + encodeURIComponent(password) +
      (options && options.fresh ? "&fresh=1" : "") +
      "&t=" + Date.now();
    const body = await requestParallel(url);
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
    const body = await requestSerial(url, 30000);
    if (!body || body.ok !== true) throw new Error("UNAUTHORIZED");
    return { links: Array.isArray(body.links) ? body.links : [] };
  }

  global.SctvSheetApi = { fetchLinks, saveLinks, viaFetch, viaIframe, getApiUrl };
})(window);
