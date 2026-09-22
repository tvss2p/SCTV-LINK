/**
 * admin.js - 管理ページのロジック
 * Google スプレッドシートを直接読み書きする。
 * 管理ページは端末に関わらず、毎回パスワード入力を必須にする。
 */
(function () {
  const loginScreen = document.getElementById("login-screen");
  const mainScreen = document.getElementById("main-screen");
  const loginForm = document.getElementById("login-form");
  const passwordInput = document.getElementById("password-input");
  const loginError = document.getElementById("login-error");
  const loginSubmitBtn = document.getElementById("login-submit-btn");
  const mainLoading = document.getElementById("main-loading");
  const mainError = document.getElementById("main-error");
  const editorList = document.getElementById("link-editor-list");
  const adminToolbar = document.getElementById("admin-toolbar");
  const addLinkBtn = document.getElementById("add-link-btn");
  const saveBtn = document.getElementById("save-btn");
  const saveStatus = document.getElementById("save-status");
  const template = document.getElementById("link-editor-template");

  // ログイン成功時に入力されたパスワード（保存リクエストに使用。localStorageには保存しない）
  let sessionPassword = null;

  function showLogin() {
    loginScreen.hidden = false;
    mainScreen.hidden = true;
    setTimeout(() => passwordInput.focus(), 0);
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

  function showStatus(message, isError) {
    saveStatus.textContent = message;
    saveStatus.hidden = false;
    saveStatus.className = "status-message " + (isError ? "error" : "success");
  }

  function addLinkCard(link) {
    const data = link || { name: "", url: "", description: "" };
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector("[data-link-item]");
    card.dataset.id = data.id || "";
    card.querySelector('[data-field="name"]').value = data.name || "";
    card.querySelector('[data-field="url"]').value = data.url || "";
    card.querySelector('[data-field="description"]').value = data.description || "";
    card.querySelector("[data-remove]").addEventListener("click", () => {
      card.remove();
    });
    editorList.appendChild(card);
  }

  function renderEditor(links) {
    editorList.innerHTML = "";
    if (Array.isArray(links) && links.length > 0) {
      links.forEach((link) => addLinkCard(link));
    }
    editorList.hidden = false;
    adminToolbar.hidden = false;
  }

  function collectLinksFromForm() {
    const cards = editorList.querySelectorAll("[data-link-item]");
    const links = [];
    cards.forEach((card, index) => {
      const name = card.querySelector('[data-field="name"]').value.trim();
      const url = card.querySelector('[data-field="url"]').value.trim();
      const description = card.querySelector('[data-field="description"]').value.trim();
      if (!name && !url && !description) return; // 空カードは無視
      links.push({
        id: card.dataset.id || "link-" + Date.now() + "-" + index,
        name,
        url,
        description,
      });
    });
    return links;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearLoginError();
    const password = passwordInput.value;
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = "確認中…";
    mainLoading.hidden = false;
    mainError.hidden = true;
    try {
      // 管理ページは編集用なので、サーバー側キャッシュを無視して最新を読み込む
      const data = await SctvSheetApi.fetchLinks(password, { fresh: true });
      sessionPassword = password;
      loginScreen.hidden = true;
      mainScreen.hidden = false;
      mainLoading.hidden = true;
      renderEditor(data.links);
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

  addLinkBtn.addEventListener("click", () => {
    addLinkCard(null);
    saveStatus.hidden = true;
  });

  saveBtn.addEventListener("click", async () => {
    if (!sessionPassword) return;
    const links = collectLinksFromForm();

    const invalid = links.find((l) => !l.name || !l.url);
    if (invalid) {
      showStatus("名称とURLは必須です。未入力の項目を確認してください。", true);
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "保存中…";
    try {
      const data = await SctvSheetApi.saveLinks(sessionPassword, links);
      renderEditor(data.links);
      showStatus("保存しました。全員のスマホ・PCに反映されます。", false);
    } catch (err) {
      showStatus(errorMessageFor(err), true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "保存する";
    }
  });

  showLogin();
})();
