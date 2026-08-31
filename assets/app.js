/**
 * app.js - リンク集トップページのロジック
 * リンクの中身は Google スプレッドシートから毎回取得する。
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
  const retryBtn = document.getElementById("retry-btn");

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
    retryBtn.hidden = true;
    linkList.hidden = true;
  }

  function showMainError(message) {
    mainLoading.hidden = true;
    mainError.hidden = false;
    mainError.textContent = message;
    retryBtn.hidden = false;
    linkList.hidden = true;
  }

  function showMainList() {
    mainLoading.hidden = true;
    mainError.hidden = true;
    retryBtn.hidden = true;
    linkList.hidden = false;
  }

  function showLoginError(message) {
    loginError.textContent = message;
    loginError.hidden = false;
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

  function renderLinks(links) {
    linkList.innerHTML = "";

    if (!Array.isArray(links) || links.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-note";
      li.textContent = "登録されているリンクがありません。";
      linkList.appendChild(li);
      return;
    }

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
      linkList.appendChild(li);
    });
  }

  async function loadAndShow(password) {
    showMainLoading();
    try {
      const data = await SctvSheetApi.fetchLinks(password);
      renderLinks(data.links);
      showMainList();
      return true;
    } catch (err) {
      if (err && err.message === "UNAUTHORIZED") {
        // 記憶していたパスワードが無効になっていた場合はログイン画面に戻す
        SctvStorage.clearAuth();
        showLogin();
      } else {
        showMainError(errorMessageFor(err));
      }
      return false;
    }
  }

  async function init() {
    const savedPassword = SctvStorage.getSavedPassword();
    if (savedPassword) {
      showMainLoading();
      await loadAndShow(savedPassword);
      return;
    }
    showLogin();
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
      renderLinks(data.links);
      showMainList();
      mainScreen.hidden = false;
      loginScreen.hidden = true;
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
    SctvStorage.clearAuth();
    location.reload();
  });

  retryBtn.addEventListener("click", () => {
    const savedPassword = SctvStorage.getSavedPassword();
    if (savedPassword) {
      loadAndShow(savedPassword);
    } else {
      showLogin();
    }
  });

  init();
})();
