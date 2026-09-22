/**
 * app.js - リンク集トップページのロジック
 *
 * リンクの正本は Google スプレッドシート側にある。
 * 表示までの待ち時間を無くすため、2度目以降のアクセスでは
 *   1. 前回取得したリンク一覧(localStorage)を即座に描画する
 *   2. その裏で最新の一覧を取りに行き、内容が変わっていれば差し替える
 * という流れにしている（初回のみ「読み込み中…」を表示する）。
 */
(function () {
  const loginScreen = document.getElementById("login-screen");
  const mainScreen = document.getElementById("main-screen");
  const loginForm = document.getElementById("login-form");
  const passwordInput = document.getElementById("password-input");
  const loginError = document.getElementById("login-error");
  const loginSubmitBtn = document.getElementById("login-submit-btn");
  const linkList = document.getElementById("link-list");
  const logoutBtn = document.getElementById("logout-btn");
  const mainLoading = document.getElementById("main-loading");
  const mainError = document.getElementById("main-error");
  const staleNote = document.getElementById("stale-note");
  const retryBtn = document.getElementById("retry-btn");
  const debugHint = document.getElementById("debug-hint");
  const loginDebugHint = document.getElementById("login-debug-hint");

  // 現在画面に描画されているリンク一覧（内容が同じときの再描画を避けるため）
  let renderedSignature = null;

  function showLogin() {
    loginScreen.hidden = false;
    mainScreen.hidden = true;
    setTimeout(() => passwordInput.focus(), 0);
  }

  function showMainLoading() {
    loginScreen.hidden = true;
    mainScreen.hidden = false;
    mainLoading.hidden = false;
    mainError.hidden = true;
    if (staleNote) staleNote.hidden = true;
    retryBtn.hidden = true;
    if (debugHint) debugHint.hidden = true;
    linkList.hidden = true;
  }

  function showMainError(message) {
    mainLoading.hidden = true;
    mainError.hidden = false;
    mainError.textContent = message;
    retryBtn.hidden = false;
    if (debugHint) debugHint.hidden = false;
    linkList.hidden = true;
  }

  function showMainList() {
    loginScreen.hidden = true;
    mainScreen.hidden = false;
    mainLoading.hidden = true;
    mainError.hidden = true;
    retryBtn.hidden = true;
    if (debugHint) debugHint.hidden = true;
    linkList.hidden = false;
  }

  /**
   * 控えの内容を表示したまま「最新を取得できなかった」ことだけを知らせる。
   */
  function showStaleNote(show) {
    if (!staleNote) return;
    staleNote.hidden = !show;
    retryBtn.hidden = !show;
  }

  function showLoginError(message) {
    loginError.textContent = message;
    loginError.hidden = false;
    if (loginDebugHint) loginDebugHint.hidden = false;
  }

  function clearLoginError() {
    loginError.hidden = true;
    loginError.textContent = "";
  }

  function errorMessageFor(err) {
    if (err && err.message === "NOT_CONFIGURED") {
      return "設定が未完了です。assets/config.js に Google スプレッドシートのAPI URLを設定してください。";
    }
    if (err && err.message === "NETWORK_ERROR") {
      return "通信に失敗しました。ネットワーク状況を確認してもう一度お試しください。";
    }
    return "パスワードが違います。";
  }

  function signatureOf(links) {
    try {
      return JSON.stringify(links);
    } catch (err) {
      return null;
    }
  }

  function renderLinks(links) {
    const signature = signatureOf(links);
    // 控えと最新が同じ内容なら、描画し直さない（画面のちらつき防止）
    if (signature !== null && signature === renderedSignature) return;
    renderedSignature = signature;

    linkList.innerHTML = "";

    if (!Array.isArray(links) || links.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-note";
      li.textContent = "登録されているリンクがありません。";
      linkList.appendChild(li);
      return;
    }

    const fragment = document.createDocumentFragment();

    links.forEach((link) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "link-button";
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";

      const nameEl = document.createElement("p");
      nameEl.className = "link-name";
      const nameText = document.createElement("span");
      nameText.textContent = link.name || "(名称未設定)";
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "›";
      nameEl.appendChild(nameText);
      nameEl.appendChild(arrow);

      const descEl = document.createElement("p");
      descEl.className = "link-desc";
      descEl.textContent = link.description || "";

      a.appendChild(nameEl);
      a.appendChild(descEl);
      li.appendChild(a);
      fragment.appendChild(li);
    });

    linkList.appendChild(fragment);
  }

  /**
   * index.html の <head> で先行して開始したリクエストがあれば、それを使う。
   * （CSSやHTMLの解析を待たずに通信を始めているぶん、数百ミリ秒早く結果が届く）
   */
  function fetchLinksFor(password) {
    const prefetched = window.__sctvLinksPromise;
    if (prefetched) {
      window.__sctvLinksPromise = null; // 使い回さない（再試行は必ず新規リクエスト）
      return prefetched;
    }
    return SctvSheetApi.fetchLinks(password);
  }

  /**
   * 最新の一覧を取得して表示する。
   * hasCache が true のとき（すでに控えを表示中）は、
   * 失敗しても画面を消さず、注意書きを出すだけに留める。
   */
  async function loadAndShow(password, hasCache) {
    if (!hasCache) showMainLoading();
    try {
      const data = await fetchLinksFor(password);
      SctvStorage.saveCachedLinks(data.links);
      renderLinks(data.links);
      showMainList();
      return true;
    } catch (err) {
      if (err && err.message === "UNAUTHORIZED") {
        // 記憶していたパスワードが無効になっていた場合はログイン画面に戻す
        SctvStorage.clearAuth();
        renderedSignature = null;
        showLogin();
      } else if (hasCache) {
        showStaleNote(true);
      } else {
        showMainError(errorMessageFor(err));
      }
      return false;
    }
  }

  function init() {
    const savedPassword = SctvStorage.getSavedPassword();
    if (!savedPassword) {
      showLogin();
      return;
    }

    const cachedLinks = SctvStorage.getCachedLinks();
    if (cachedLinks) {
      // 前回の内容を即表示し、最新化は裏で行う（await しない）
      renderLinks(cachedLinks);
      showMainList();
      loadAndShow(savedPassword, true);
      return;
    }

    loadAndShow(savedPassword, false);
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearLoginError();
    const password = passwordInput.value;
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = "確認中…";
    try {
      const data = await SctvSheetApi.fetchLinks(password);
      SctvStorage.savePassword(password);
      SctvStorage.saveCachedLinks(data.links);
      renderLinks(data.links);
      showMainList();
      passwordInput.value = "";
    } catch (err) {
      showLoginError(errorMessageFor(err));
      passwordInput.value = "";
      passwordInput.focus();
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = "ログイン";
    }
  });

  logoutBtn.addEventListener("click", () => {
    SctvStorage.clearAuth(); // 控えのリンク一覧もここで消える
    location.reload();
  });

  retryBtn.addEventListener("click", () => {
    const savedPassword = SctvStorage.getSavedPassword();
    if (!savedPassword) {
      showLogin();
      return;
    }
    showStaleNote(false);
    loadAndShow(savedPassword, false);
  });

  init();
})();
