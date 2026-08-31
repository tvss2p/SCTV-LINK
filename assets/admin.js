/**
 * admin.js - 管理ページのロジック
 * 管理ページは端末に関わらず、毎回パスワード入力を必須にする
 * （トップページのログイン記憶とは連動させない）。
 */
(function () {
  const loginScreen = document.getElementById("login-screen");
  const mainScreen = document.getElementById("main-screen");
  const loginForm = document.getElementById("login-form");
  const passwordInput = document.getElementById("password-input");
  const loginError = document.getElementById("login-error");
  const editorList = document.getElementById("link-editor-list");
  const addLinkBtn = document.getElementById("add-link-btn");
  const saveBtn = document.getElementById("save-btn");
  const saveStatus = document.getElementById("save-status");
  const template = document.getElementById("link-editor-template");

  // ログイン成功時に入力されたパスワード（保存時の再暗号化に使用。localStorageには保存しない）
  let sessionPassword = null;

  function showLogin() {
    loginScreen.hidden = false;
    mainScreen.hidden = true;
    setTimeout(() => passwordInput.focus(), 0);
  }

  function showMain() {
    loginScreen.hidden = true;
    mainScreen.hidden = false;
  }

  function showLoginError(message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }

  function clearLoginError() {
    loginError.hidden = true;
    loginError.textContent = "";
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
        id: "link-" + Date.now() + "-" + index,
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
    try {
      const cipherText = SctvStorage.getCurrentCipherText();
      const data = await SctvCrypto.decryptJSON(password, cipherText);
      sessionPassword = password;
      renderEditor(data.links);
      showMain();
      passwordInput.value = "";
    } catch (err) {
      showLoginError("パスワードが違います。");
      passwordInput.value = "";
      passwordInput.focus();
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

    try {
      const cipherText = await SctvCrypto.encryptJSON(sessionPassword, { links });
      SctvStorage.saveLinksCipherText(cipherText);
      showStatus("保存しました。トップページに反映されます。", false);
    } catch (err) {
      showStatus("保存に失敗しました。もう一度お試しください。", true);
    }
  });

  showLogin();
})();
