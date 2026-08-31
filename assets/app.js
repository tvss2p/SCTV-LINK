/**
 * app.js - リンク集トップページのロジック
 */
(function () {
  const loginScreen = document.getElementById("login-screen");
  const mainScreen = document.getElementById("main-screen");
  const loginForm = document.getElementById("login-form");
  const passwordInput = document.getElementById("password-input");
  const loginError = document.getElementById("login-error");
  const linkList = document.getElementById("link-list");
  const logoutBtn = document.getElementById("logout-btn");

  function showLogin() {
    loginScreen.hidden = false;
    mainScreen.hidden = true;
    setTimeout(() => passwordInput.focus(), 0);
  }

  function showMain() {
    loginScreen.hidden = true;
    mainScreen.hidden = false;
  }

  function showError(message) {
    loginError.textContent = message;
    loginError.hidden = false;
  }

  function clearError() {
    loginError.hidden = true;
    loginError.textContent = "";
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

  async function tryUnlock(password) {
    const cipherText = SctvStorage.getCurrentCipherText();
    const data = await SctvCrypto.decryptJSON(password, cipherText);
    return data;
  }

  async function init() {
    const savedPassword = SctvStorage.getSavedPassword();
    if (savedPassword) {
      try {
        const data = await tryUnlock(savedPassword);
        renderLinks(data.links);
        showMain();
        return;
      } catch (err) {
        // 保存されていたパスワードでは復号できなかった場合はログイン画面へ
        SctvStorage.clearAuth();
      }
    }
    showLogin();
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const password = passwordInput.value;
    try {
      const data = await tryUnlock(password);
      SctvStorage.savePassword(password);
      renderLinks(data.links);
      showMain();
      passwordInput.value = "";
    } catch (err) {
      showError("パスワードが違います。");
      passwordInput.value = "";
      passwordInput.focus();
    }
  });

  logoutBtn.addEventListener("click", () => {
    SctvStorage.clearAuth();
    location.reload();
  });

  init();
})();
