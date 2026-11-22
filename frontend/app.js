// Copyright (c) 2026 Король Дмитрий. All rights reserved.
// Проект «Лицей GPT». Автор — Король Дмитрий.

const app = document.getElementById("app");
const drawer = document.getElementById("drawer");
const backdrop = document.getElementById("backdrop");
const userBadge = document.getElementById("user-badge");

let CURRENT_USER = null;

function syncViewportHeight() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-h", h + "px");
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncViewportHeight);
  window.visualViewport.addEventListener("scroll", syncViewportHeight);
}
window.addEventListener("orientationchange", () => setTimeout(syncViewportHeight, 120));
syncViewportHeight();

window.visualViewport?.addEventListener("resize", () => {
  const active = document.activeElement;
  if (!active || active.tagName !== "TEXTAREA") return;
  const messages = document.getElementById("messages");
  if (!messages) return;
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
});

let deferredInstallPrompt = null;
let appInstalled = false;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: fullscreen)").matches
      || window.matchMedia("(display-mode: minimal-ui)").matches
      || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}
function canInstall() {
  if (isStandalone()) return false;
  if (appInstalled) return false;
  return true;
}

function updateInstallUI() {
  const show = canInstall();
  const sideBtn = document.getElementById("install-btn-sidebar");
  if (sideBtn) {
    sideBtn.hidden = !show;
    sideBtn.style.display = show ? "" : "none";
  }
  const banner = document.getElementById("install-banner");
  if (banner) {
    if (show && !sessionStorage.getItem("ib-hide")) {
      banner.hidden = false;
      requestAnimationFrame(() => banner.classList.add("show"));
    } else {
      banner.classList.remove("show");
      setTimeout(() => { banner.hidden = true; }, 260);
    }
  }
}

async function installApp() {
  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      updateInstallUI();
      if (choice && choice.outcome === "accepted") {
        toast("Устанавливаю…", "success");
      }
    } catch {}
    return;
  }

  if (isIOS()) {
    await confirmDialog(
      "Установка на iPhone / iPad",
      "1. Нажми «Поделиться» внизу (квадрат со стрелкой вверх).\n2. Выбери «На экран Домой».\n3. Нажми «Добавить».",
      { confirmText: "Понятно", cancelText: "Отмена" }
    );
    return;
  }

  if (isAndroid()) {
    await confirmDialog(
      "Установка приложения",
      "1. Открой меню браузера (⋮ справа сверху).\n2. Выбери «Установить приложение» или «Добавить на главный экран».\n3. Подтверди установку.",
      { confirmText: "Понятно", cancelText: "Отмена" }
    );
    return;
  }

  await confirmDialog(
    "Установка приложения",
    "В Chrome или Edge нажми иконку установки (⊕) в адресной строке справа. В других браузерах — через меню «Установить приложение».",
    { confirmText: "Понятно", cancelText: "Отмена" }
  );
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallUI();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  appInstalled = true;
  updateInstallUI();
  toast("Лицей GPT установлен как приложение", "success", 4000);
});

const Notifications = {
  get supported() {
    return "Notification" in window && "serviceWorker" in navigator;
  },
  get permission() {
    return this.supported ? Notification.permission : "unsupported";
  },
  async request() {
    if (!this.supported) {
      toast("Уведомления не поддерживаются в этом браузере", "error");
      return "unsupported";
    }
    return await Notification.requestPermission();
  },
  async test() {
    const p = await this.request();
    if (p !== "granted") {
      toast("Разрешение на уведомления не выдано", "error");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("Лицей GPT", {
        body: "Уведомления включены. Это тестовое сообщение.",
        icon: "/static/icons/192.png",
        badge: "/static/icons/192.png",
        tag: "licey-test",
        vibrate: [120, 60, 120],
      });
      toast("Тестовое уведомление отправлено", "success");
    } catch (e) {
      toast("Ошибка: " + e.message, "error");
    }
  },
};

function updateOnlineStatus() {
  document.body.classList.toggle("offline", !navigator.onLine);
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(message, type = "info", duration = 3000) {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const icons = { success: "✅", error: "⚠️", info: "ℹ️" };
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${icons[type] || ""}</span><span>${escapeHtml(message)}</span>`;
  host.appendChild(t);

  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 260);
  }, duration);
}

function mountDropzone(container, {
  onFile, onBatchDone,
  formats = [".txt", ".pdf", ".docx", ".xlsx", ".csv", ".md"],
  title = "Перетащите документ сюда",
  multiple = true,
} = {}) {
  container.innerHTML = `
    <div class="dropzone" tabindex="0" role="button" aria-label="Загрузить файлы">
      <input type="file" accept="${formats.join(",")}" ${multiple ? "multiple" : ""}>
      <div class="dropzone-icon">📄</div>
      <div class="dropzone-title">${escapeHtml(title)}</div>
      <div class="dropzone-hint">
        ${multiple ? "перетащите <b>несколько файлов</b> или " : ""}<b>выберите</b> с устройства
      </div>
      <div class="dropzone-formats">
        ${formats.map((f) => `<span>${escapeHtml(f)}</span>`).join("")}
      </div>
    </div>
    <div class="upload-progress"><div></div></div>
    <div class="upload-status"></div>
    <ul class="upload-list"></ul>
  `;

  const dz = container.querySelector(".dropzone");
  const input = dz.querySelector('input[type="file"]');
  const progress = container.querySelector(".upload-progress");
  const bar = progress.querySelector("div");
  const status = container.querySelector(".upload-status");
  const list = container.querySelector(".upload-list");

  const reset = () => {
    dz.classList.remove("dragover", "uploading", "done");
    progress.classList.remove("active");
    bar.style.width = "0%";
  };
  const setProgress = (current, total) => {
    progress.classList.add("active");
    bar.style.width = (total > 0 ? Math.round((current / total) * 100) : 0) + "%";
  };
  const addRow = (name) => {
    const li = document.createElement("li");
    li.className = "upload-row-item";
    li.innerHTML = `
      <span class="uli-icon">⏳</span>
      <span class="uli-name">${escapeHtml(name)}</span>
      <span class="uli-info"></span>`;
    list.appendChild(li);
    list.classList.add("active");
    return li;
  };
  const setRowDone = (li, info, ok = true) => {
    li.querySelector(".uli-icon").textContent = ok ? "✅" : "❌";
    li.querySelector(".uli-info").textContent = info;
    li.classList.toggle("err", !ok);
  };

  const handleFiles = async (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    const valid = [], invalid = [];
    arr.forEach((f) => {
      (formats.some((ext) => f.name.toLowerCase().endsWith(ext)) ? valid : invalid).push(f);
    });

    list.innerHTML = "";
    dz.classList.add("uploading");
    progress.classList.add("active");
    setProgress(0, arr.length);

    let okCount = 0, okChunks = 0, failCount = 0;
    invalid.forEach((f) => {
      const li = addRow(f.name);
      setRowDone(li, "формат не поддерживается", false);
      failCount++;
    });
    let done = invalid.length;
    setProgress(done, arr.length);

    for (const f of valid) {
      const li = addRow(f.name);
      try {
        const res = await onFile(f);
        setRowDone(li, `+${res.added}`);
        okCount++;
        okChunks += res.added || 0;
      } catch (e) {
        setRowDone(li, e.message || "ошибка", false);
        failCount++;
      }
      done++;
      setProgress(done, arr.length);
    }

    dz.classList.remove("uploading");
    bar.style.width = "100%";
    setTimeout(() => progress.classList.remove("active"), 400);

    if (failCount === 0) {
      dz.classList.add("done");
      status.className = "upload-status ok";
      status.textContent = okCount === 1
        ? `✅ Загружен 1 файл · фрагментов: ${okChunks}`
        : `✅ Загружено ${okCount} файлов · фрагментов: ${okChunks}`;
    } else if (okCount === 0) {
      status.className = "upload-status err";
      status.textContent = `❌ Не удалось загрузить: ${failCount}`;
    } else {
      status.className = "upload-status";
      status.textContent = `⚠️ Успешно: ${okCount} · Ошибок: ${failCount}`;
    }

    if (typeof onBatchDone === "function") {
      try { await onBatchDone({ okCount, okChunks, failCount }); } catch {}
    }

    setTimeout(() => {
      reset();
      status.textContent = "";
      list.innerHTML = "";
      list.classList.remove("active");
    }, 3500);
  };

  input.addEventListener("change", () => { handleFiles(input.files); input.value = ""; });
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (ev === "dragleave" && dz.contains(e.relatedTarget)) return;
      dz.classList.remove("dragover");
    })
  );
  dz.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length) handleFiles(files);
  });
  dz.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });

  const stopOnWindow = (e) => { e.preventDefault(); };
  window.addEventListener("dragover", stopOnWindow);
  window.addEventListener("drop", stopOnWindow);
}

const CODE_OPEN = "\uE000";
const CODE_CLOSE = "\uE001";

function renderMarkdown(text) {
  const escaped = escapeHtml(text);
  const codeBlocks = [];
  let t = escaped.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const cleanCode = code.replace(/\n$/, "");
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: (lang || "").trim(), code: cleanCode });
    return `${CODE_OPEN}${idx}${CODE_CLOSE}`;
  });
  t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/\n/g, "<br>");

  const re = new RegExp(`${CODE_OPEN}(\\d+)${CODE_CLOSE}`, "g");
  t = t.replace(re, (_, idx) => {
    const { lang, code } = codeBlocks[+idx];
    const label = lang || "code";
    return (
      `<div class="code-block">` +
        `<div class="code-head">` +
          `<span class="code-lang">${label}</span>` +
          `<button type="button" class="code-copy">📋 Копировать</button>` +
        `</div>` +
        `<pre><code>${code}</code></pre>` +
      `</div>`
    );
  });
  return t;
}

const ROLE_LABELS = {
  student: "🎒 Ученик",
  teacher: "📘 Учитель",
  parent: "👪 Родитель",
  admin: "🛠 Админ",
};

function confirmDialog(title, message, {
  confirmText = "OK", cancelText = "Отмена", danger = false,
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const lines = String(message).split("\n")
      .map((l) => escapeHtml(l))
      .join("<br>");
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-icon ${danger ? "danger" : ""}">${danger ? "🗑" : "❔"}</div>
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        <p class="modal-text">${lines}</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" type="button">${escapeHtml(cancelText)}</button>
          <button class="modal-btn ${danger ? "danger" : "primary"}" type="button">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));
    const close = (r) => {
      overlay.classList.remove("show");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => overlay.remove(), 220);
      resolve(r);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    document.addEventListener("keydown", onKey);
    overlay.querySelector(".modal-btn.cancel").onclick = () => close(false);
    overlay.querySelector(".modal-btn.primary, .modal-btn.danger").onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    setTimeout(() => {
      overlay.querySelector(".modal-btn.danger, .modal-btn.primary")?.focus();
    }, 120);
  });
}

function applyTheme() {
  const saved = localStorage.getItem("theme");
  const dark = saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = dark ? "☀️ Светлая тема" : "🌙 Тёмная тема";
}
document.getElementById("theme-toggle").onclick = () => {
  const cur = document.documentElement.dataset.theme;
  localStorage.setItem("theme", cur === "dark" ? "light" : "dark");
  applyTheme();
};

document.getElementById("menu-btn").onclick = () => {
  drawer.classList.toggle("open");
  backdrop.classList.toggle("show");
};
backdrop.onclick = () => closeDrawer();
function closeDrawer() {
  drawer.classList.remove("open");
  backdrop.classList.remove("show");
}

document.getElementById("install-yes")?.addEventListener("click", installApp);
document.getElementById("install-no")?.addEventListener("click", () => {
  sessionStorage.setItem("ib-hide", "1");
  const b = document.getElementById("install-banner");
  if (b) {
    b.classList.remove("show");
    setTimeout(() => { b.hidden = true; }, 260);
  }
});
document.getElementById("install-btn-sidebar")?.addEventListener("click", installApp);

async function loadUser() {
  try { CURRENT_USER = await API.get("/auth/me"); }
  catch { CURRENT_USER = null; }
  updateChrome();
}

function updateChrome() {
  if (!CURRENT_USER) return;
  const isAdmin = CURRENT_USER.role === "admin";
  userBadge.textContent = CURRENT_USER.name + (isAdmin ? " · админ" : "");
  userBadge.classList.toggle("admin", isAdmin);
  const chip = document.getElementById("role-chip");
  if (chip) chip.hidden = !isAdmin;
  drawer.querySelectorAll("[data-admin]").forEach((el) => {
    el.hidden = !isAdmin;
    el.style.display = isAdmin ? "" : "none";
  });
}

function renderOnboard() {
  document.body.classList.add("onboarding");
  app.innerHTML = `
    <section class="page narrow onboard">
      <h1>👋 Добро пожаловать!</h1>
      <p class="muted">Представься — это займёт 5 секунд. Никаких email и паролей.</p>
      <form id="onboard-form" class="form">
        <label>Как тебя зовут?</label>
        <input name="name" placeholder="Имя" required maxlength="80" autofocus>
        <label>Кто ты?</label>
        <select name="role">
          <option value="student">🎒 Ученик</option>
          <option value="teacher">📘 Учитель</option>
          <option value="parent">👪 Родитель</option>
        </select>
        <button type="submit">Начать →</button>
      </form>
      <p class="muted" style="margin-top:1.25rem; text-align:center">
        Уже пользовался(ась)? <a href="#" id="to-login">Войти по коду</a>
      </p>
    </section>`;
  document.getElementById("onboard-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      CURRENT_USER = await API.post("/auth/onboard", fd);
      updateChrome();
      document.body.classList.remove("onboarding");
      location.hash = "/chat";
      router();
    } catch (err) { toast("Ошибка: " + err.message, "error"); }
  };
  document.getElementById("to-login").onclick = (e) => { e.preventDefault(); renderOnboardLogin(); };
}

function renderOnboardLogin() {
  document.body.classList.add("onboarding");
  app.innerHTML = `
    <section class="page narrow onboard">
      <h1>🔑 Вход по коду</h1>
      <p class="muted">Введи свой код вида <code>XXXX-XXXX-XXXX</code>.</p>
      <form id="code-form" class="form">
        <input name="code" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autofocus
               style="text-align:center; letter-spacing:2px; font-family:ui-monospace, monospace; text-transform:uppercase">
        <button type="submit">Войти</button>
        <div class="error" id="err"></div>
      </form>
      <p class="muted" style="margin-top:1.25rem; text-align:center">
        <a href="#" id="to-onboard">← Назад</a>
      </p>
    </section>`;
  const inp = document.querySelector('#code-form input[name="code"]');
  inp.addEventListener("input", () => {
    let v = inp.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
    inp.value = v.replace(/(.{4})(?=.)/g, "$1-");
  });
  document.getElementById("code-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      CURRENT_USER = await API.post("/auth/login-code", { code: e.target.code.value });
      updateChrome();
      document.body.classList.remove("onboarding");
      location.hash = "/chat";
      router();
    } catch (err) {
      document.getElementById("err").textContent = err.message;
    }
  };
  document.getElementById("to-onboard").onclick = (e) => { e.preventDefault(); renderOnboard(); };
}

const routes = {
  "/chat": renderChat,
  "/docs": renderDocs,
  "/admin": renderAdmin,
  "/profile": renderProfile,
};

async function router() {
  if (!CURRENT_USER) { renderOnboard(); return; }
  document.body.classList.remove("onboarding");
  const path = location.hash.slice(1) || "/chat";
  closeDrawer();
  drawer.querySelectorAll("a[data-route]").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === "#" + path);
  });
  if (path === "/admin" && CURRENT_USER.role !== "admin") {
    location.hash = "/chat";
    return;
  }
  const view = routes[path] || renderChat;
  app.innerHTML = "";
  await view();
}
window.addEventListener("hashchange", router);

async function renderChat() {
  app.innerHTML = `
    <section class="chat">
      <div class="chat-main">
        <button id="clear-chat" class="chat-clear" type="button" title="Очистить диалог" aria-label="Очистить диалог">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
          <span>Очистить</span>
        </button>
        <div class="messages" id="messages">
          <div class="skeleton" style="width:60%"></div>
          <div class="skeleton" style="width:40%; margin-top:.75rem"></div>
        </div>
        <form class="composer" id="chat-form">
          <div class="wrap">
            <button type="button" id="attach-btn" title="Прикрепить файл" aria-label="Прикрепить">📎</button>
            <textarea name="text" placeholder="Спросите что-нибудь…" rows="1"></textarea>
            <button type="submit" aria-label="Отправить">➤</button>
          </div>
          <input type="file" id="attach-input" accept=".txt,.pdf,.docx,.xlsx,.csv,.md" hidden>
        </form>
      </div>
      <aside class="chat-toc">
        <div class="toc-title">В диалоге</div>
        <div class="toc-list" id="toc-list"></div>
      </aside>
    </section>`;

  const messages = document.getElementById("messages");
  const form = document.getElementById("chat-form");
  const ta = form.text;
  const sendBtn = form.querySelector('button[type="submit"]');
  const attachBtn = document.getElementById("attach-btn");
  const attachInput = document.getElementById("attach-input");

  messages.addEventListener("click", (e) => {
    const btn = e.target.closest(".code-copy");
    if (!btn) return;
    const codeEl = btn.closest(".code-block")?.querySelector("pre code");
    if (!codeEl) return;
    navigator.clipboard.writeText(codeEl.textContent).then(() => {
      btn.textContent = "✓ Скопировано";
      btn.classList.add("copied");
      setTimeout(() => { btn.textContent = "📋 Копировать"; btn.classList.remove("copied"); }, 1500);
    }).catch(() => {});
  });

  messages.innerHTML = "";
  try {
    const history = await API.get("/chat/history");
    if (!history.length) {
      messages.appendChild(el(
        `<div class="empty-hint">👋 Привет, ${escapeHtml(CURRENT_USER.name)}! Задай вопрос или прикрепи файл кнопкой 📎.</div>`
      ));
    } else {
      history.forEach((m) => {
        const content = addMessage(m.role, m.content, m.role === "assistant");
        if (m.role === "assistant" && Array.isArray(m.sources) && m.sources.length) {
          renderSources(content, m.sources);
        }
      });
    }
  } catch {
    messages.appendChild(el(`<div class="empty-hint">Не удалось загрузить историю.</div>`));
  }

  buildToc();

  ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  document.getElementById("clear-chat").onclick = async () => {
    const ok = await confirmDialog(
      "Очистить историю диалога?",
      "Все сообщения будут удалены. Документы в базе знаний останутся.",
      { danger: true, confirmText: "Очистить", cancelText: "Отмена" }
    );
    if (!ok) return;
    try {
      await API.del("/chat/history");
      messages.innerHTML = "";
      buildToc();
      messages.appendChild(el(`<div class="empty-hint">👋 История очищена. Задай новый вопрос.</div>`));
      ta.focus();
      toast("История очищена", "success");
    } catch (err) { toast("Не удалось очистить: " + err.message, "error"); }
  };

  attachBtn.onclick = () => attachInput.click();
  attachInput.onchange = async () => {
    const f = attachInput.files[0];
    if (!f) return;
    attachInput.value = "";
    messages.querySelector(".empty-hint")?.remove();
    const info = addMessage("assistant", "", true);
    info.innerHTML = `<span class="muted">📎 Загружаю «${escapeHtml(f.name)}»…</span>`;
    try {
      const res = await API.upload("/docs/upload", f);
      info.innerHTML = renderMarkdown(
        `✅ Файл «${f.name}» добавлен в вашу базу знаний (${res.added} док.). Теперь я смогу опираться на него в ответах.`
      );
    } catch (e) {
      info.innerHTML = renderMarkdown("❌ Не удалось загрузить: " + e.message);
    }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text || sendBtn.disabled) return;
    ta.value = "";
    ta.style.height = "auto";
    sendBtn.disabled = true;
    messages.querySelector(".empty-hint")?.remove();
    addMessage("user", text);
    buildToc();
    messages.scrollTop = messages.scrollHeight;

    const bot = addMessage("assistant", "", true);
    
    bot.innerHTML = `
      <div class="typing-status">
        <div class="ts-dots"><span></span><span></span><span></span></div>
        <span class="ts-text">Анализирую базу знаний...</span>
      </div>
    `;

    let acc = "";
    let first = true;
    let botSources = [];

    const shouldAutoScroll = () => {
      return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100;
    };

    try {
      for await (const chunk of API.streamChat(text, {
        onSources: (docs) => { botSources = docs; },
        onStatus: (statusText) => {
          if (first) {
            const tsText = bot.querySelector(".ts-text");
            if (tsText) tsText.textContent = statusText;
          }
        }
      })) {
        if (first) { bot.innerHTML = ""; first = false; }
        acc += chunk;
        bot.innerHTML = renderMarkdown(acc);
        
        if (shouldAutoScroll()) {
          messages.scrollTop = messages.scrollHeight;
        }
      }
      if (first) bot.innerHTML = renderMarkdown("…");
    } catch (err) {
      bot.innerHTML = renderMarkdown("⚠️ " + (err.message || "Ошибка"));
    } finally {
      if (botSources.length) renderSources(bot, botSources);
      sendBtn.disabled = false;
      ta.focus();
    }
  };

  ta.focus();
}

function renderSources(contentEl, sources) {
  if (!sources || !sources.length) return;
  const bubble = contentEl.closest(".bubble");
  if (!bubble) return;

  bubble.querySelector(".sources-accordion")?.remove();

  const count = sources.length;
  
  const block = document.createElement("details");
  block.className = "sources-accordion";
  block.innerHTML = `
    <summary>📎 Источники (${count})</summary>
    <div class="sources-list">
      ${sources.map((s) =>
        `<button type="button" class="source-chip" data-id="${s.id}">${escapeHtml(s.title)}</button>`
      ).join("")}
    </div>
  `;
  block.querySelectorAll(".source-chip").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id, 10);
      if (!isNaN(id)) openDoc(id, false);
    };
  });
  bubble.appendChild(block);
}

function buildToc() {
  const toc = document.getElementById("toc-list");
  const messages = document.getElementById("messages");
  if (!toc || !messages) return;
  toc.innerHTML = "";
  const userMsgs = messages.querySelectorAll(".msg.user");
  if (!userMsgs.length) { toc.innerHTML = `<div class="toc-empty">Пока пусто</div>`; return; }
  userMsgs.forEach((m) => {
    const raw = (m.querySelector(".content")?.textContent || "").trim();
    if (!raw) return;
    const item = document.createElement("div");
    item.className = "toc-item";
    item.textContent = raw;
    item.title = raw;
    item.onclick = () => {
      m.scrollIntoView({ behavior: "smooth", block: "start" });
      toc.querySelectorAll(".toc-item").forEach((x) => x.classList.remove("active"));
      item.classList.add("active");
    };
    toc.appendChild(item);
  });
}

function addMessage(role, text = "", markdown = false) {
  const box = document.getElementById("messages");
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const avatar = role === "user" ? "🙋" : "🤖";
  wrap.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="bubble">
      <div class="content"></div>
      <div class="actions">
        <button type="button" data-copy title="Скопировать ответ">
          <span class="ico">📋</span>
          <span class="lbl">Копировать</span>
        </button>
      </div>
    </div>`;
  const content = wrap.querySelector(".content");
  if (markdown) content.innerHTML = renderMarkdown(text);
  else content.textContent = text;

  const copyBtn = wrap.querySelector("[data-copy]");
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(wrap, copyBtn);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); flashCopied(wrap, copyBtn); } catch {}
      ta.remove();
    }
  };
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
  return content;
}

function flashCopied(wrap, btn) {
  const bubble = wrap.querySelector(".bubble");
  bubble.classList.remove("copy-flash");
  void bubble.offsetWidth;
  bubble.classList.add("copy-flash");
  setTimeout(() => bubble.classList.remove("copy-flash"), 1200);

  if (btn.classList.contains("copied")) return;
  btn.classList.add("copied");
  const ico = btn.querySelector(".ico");
  const lbl = btn.querySelector(".lbl");
  const prevIco = ico.textContent;
  const prevLbl = lbl.textContent;
  ico.textContent = "✅";
  lbl.textContent = "Скопировано";

  const t = document.createElement("div");
  t.className = "copy-toast";
  t.textContent = "Скопировано в буфер обмена";
  bubble.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, 1400);

  setTimeout(() => {
    btn.classList.remove("copied");
    ico.textContent = prevIco;
    lbl.textContent = prevLbl;
  }, 1500);
}

async function downloadDoc(docId, title) {
  try {
    const res = await fetch(`/api/docs/${docId}/download`, {
      credentials: "include",
    });
    if (!res.ok) {
      let msg = "Не удалось скачать";
      try { msg = (await res.json()).detail || msg; } catch {}
      throw new Error(msg);
    }

    let filename = (title || `document_${docId}`).trim();
    const cd = res.headers.get("content-disposition") || "";
    const mStar = cd.match(/filename\*=UTF-8''([^;]+)/i);
    const mPlain = cd.match(/filename="([^"]+)"/i) || cd.match(/filename=([^;]+)/i);
    if (mStar) {
      try { filename = decodeURIComponent(mStar[1]); } catch {}
    } else if (mPlain) {
      filename = mPlain[1].trim();
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("Скачивание началось", "success", 1800);
  } catch (e) {
    toast("Ошибка: " + e.message, "error");
  }
}

// =====================================================
// DOCS PAGE (С ТАБЛИЦЕЙ И ПАГИНАЦИЕЙ)
// =====================================================
async function renderDocs() {
  const isAdmin = CURRENT_USER.role === "admin";
  let allDocs = [];
  
  const state = { 
    filter: "all", 
    search: "", 
    sort: "new", 
    page: 1, 
    limit: 20 
  };

  app.innerHTML = `
    <section class="page">
      <h1>${isAdmin ? "📚 Все документы" : "📚 Мои документы"}</h1>
      
      <div id="dropzone-host" style="margin:1rem 0"></div>

      <div class="docs-toolbar">
        <div class="search-box">
          <input type="search" id="docs-search" placeholder="Поиск по названию или содержимому..." autocomplete="off">
        </div>
        ${isAdmin ? `
          <div class="filter-chips" id="docs-filters">
            <button type="button" class="chip active" data-filter="all">Все <span class="chip-count"></span></button>
            <button type="button" class="chip" data-filter="public">🌐 Публичные <span class="chip-count"></span></button>
            <button type="button" class="chip" data-filter="mine">👤 Мои <span class="chip-count"></span></button>
            <button type="button" class="chip" data-filter="others">Другие <span class="chip-count"></span></button>
          </div>` : ""}
        <div class="toolbar-right">
          <select id="docs-sort" class="sort-select">
            <option value="new">Сначала новые</option>
            <option value="old">Сначала старые</option>
            <option value="title">По названию</option>
          </select>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th class="td-id">ID</th>
              <th>Документ</th>
              ${isAdmin ? '<th class="td-owner">Владелец</th>' : ""}
              <th class="td-actions">Действия</th>
            </tr>
          </thead>
          <tbody id="docs-tbody">
            <tr><td colspan="4" style="text-align:center; padding: 2rem;">Загрузка...</td></tr>
          </tbody>
        </table>
      </div>
      
      <div class="pagination">
        <span id="page-info">Стр. 1</span>
        <div class="pagination-controls">
          <button class="page-btn" id="prev-page" disabled>← Назад</button>
          <button class="page-btn" id="next-page" disabled>Вперед →</button>
        </div>
      </div>
    </section>`;

  document.getElementById("docs-search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    state.page = 1;
    renderTable();
  });
  
  document.getElementById("docs-sort").addEventListener("change", (e) => {
    state.sort = e.target.value; 
    renderTable();
  });

  const filtersEl = document.getElementById("docs-filters");
  if (filtersEl) {
    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state.filter = btn.dataset.filter;
      state.page = 1;
      filtersEl.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
      renderTable();
    });
  }

  document.getElementById("prev-page").onclick = () => {
    if (state.page > 1) { state.page--; renderTable(); }
  };
  document.getElementById("next-page").onclick = () => {
    state.page++; renderTable();
  };

  mountDropzone(document.getElementById("dropzone-host"), {
    formats: [".txt", ".pdf", ".docx", ".xlsx", ".csv", ".md"],
    title: "Перетащите документ или выберите файлы",
    onFile: (file) => API.upload("/docs/upload", file),
    onBatchDone: async () => { await refreshDocs(); },
  });

  async function refreshDocs() {
    try {
      allDocs = await API.get("/docs/list");
      updateChipCounts();
      renderTable();
    } catch (e) {
      document.getElementById("docs-tbody").innerHTML = 
        `<tr><td colspan="4" style="color:#ef4444; text-align:center;">Ошибка: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function updateChipCounts() {
    const container = document.getElementById("docs-filters");
    if (!container) return;
    const counts = {
      all: allDocs.length,
      public: allDocs.filter((d) => d.public).length,
      mine: allDocs.filter((d) => d.mine).length,
      others: allDocs.filter((d) => !d.mine && !d.public).length,
    };
    container.querySelectorAll(".chip").forEach((c) => {
      const n = counts[c.dataset.filter] ?? 0;
      const el = c.querySelector(".chip-count");
      if (el) el.textContent = n ? `(${n})` : "";
    });
  }

  function renderTable() {
    const tbody = document.getElementById("docs-tbody");
    
    let filtered = allDocs;
    if (state.filter === "public") filtered = filtered.filter((d) => d.public);
    else if (state.filter === "mine") filtered = filtered.filter((d) => d.mine);
    else if (state.filter === "others") filtered = filtered.filter((d) => !d.mine && !d.public);
    
    if (state.search) {
      const q = state.search;
      filtered = filtered.filter((d) =>
        (d.title || "").toLowerCase().includes(q) || (d.preview || "").toLowerCase().includes(q)
      );
    }

    const sorters = {
      new: (a, b) => b.id - a.id,
      old: (a, b) => a.id - b.id,
      title: (a, b) => (a.title || "").localeCompare(b.title || "", "ru"),
    };
    filtered.sort(sorters[state.sort] || sorters.new);

    const totalPages = Math.ceil(filtered.length / state.limit) || 1;
    if (state.page > totalPages) state.page = totalPages;
    
    const start = (state.page - 1) * state.limit;
    const pageDocs = filtered.slice(start, start + state.limit);

    document.getElementById("page-info").textContent = `Стр. ${state.page} из ${totalPages} (всего ${filtered.length})`;
    document.getElementById("prev-page").disabled = state.page <= 1;
    document.getElementById("next-page").disabled = state.page >= totalPages;

    if (!pageDocs.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem;">Ничего не найдено.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    pageDocs.forEach(d => {
      const canDelete = d.mine || isAdmin;
      const badge = d.public ? "🌐" : (d.mine ? "👤" : "🔒");
      const ownerText = d.public ? "Все" : (d.mine ? "Я" : (d.owner_name || d.owner_id));
      
      const tr = el(`
        <tr>
          <td class="td-id">${d.id}</td>
          <td class="td-main">
            <div class="doc-title" title="${escapeHtml(d.title)}">${escapeHtml(d.title)}</div>
            <div class="doc-preview-text">${escapeHtml(d.preview)}…</div>
          </td>
          ${isAdmin ? `<td class="td-owner">${badge} ${escapeHtml(ownerText)}</td>` : ""}
          <td class="td-actions">
            <button class="table-btn" title="Скачать" data-dl>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            </button>
            <button class="table-btn" title="Открыть" data-open>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${canDelete ? `
            <button class="table-btn danger" title="Удалить" data-del>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>` : ""}
          </td>
        </tr>
      `);

      tr.querySelector("[data-dl]").onclick = () => downloadDoc(d.id, d.title);
      tr.querySelector("[data-open]").onclick = () => openDoc(d.id, canDelete);
      
      if (canDelete) {
        tr.querySelector("[data-del]").onclick = async () => {
          const ok = await confirmDialog("Удалить документ?", `«${d.title}» будет удалён безвозвратно.`, { danger: true, confirmText: "Удалить" });
          if (!ok) return;
          try {
            await API.del(`/docs/${d.id}`);
            toast("Документ удалён", "success");
            refreshDocs();
          } catch (err) { toast("Ошибка: " + err.message, "error"); }
        };
      }

      tbody.appendChild(tr);
    });
  }

  await refreshDocs();
}

async function openDoc(id, canDelete = false) {
  app.innerHTML = `<section class="page"><div class="skeleton" style="height:200px"></div></section>`;
  try {
    const d = await API.get(`/docs/${id}`);
    app.innerHTML = `
      <section class="page">
        <div class="doc-actions">
          <button class="back" id="doc-back" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span>Назад</span>
          </button>
          <button class="doc-download" id="doc-download" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            <span>Скачать</span>
          </button>
          ${canDelete ? `
            <button class="doc-delete" id="doc-delete" type="button" title="Удалить документ" aria-label="Удалить документ">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>
              </svg>
              <span>Удалить</span>
            </button>` : ""}
        </div>
        <h1>${escapeHtml(d.title)}</h1>
        <pre class="doc-content">${escapeHtml(d.content)}</pre>
      </section>`;

    document.getElementById("doc-back").onclick = () => router();
    document.getElementById("doc-download").onclick = () => downloadDoc(id, d.title);

    const delBtn = document.getElementById("doc-delete");
    if (delBtn) {
      delBtn.onclick = async () => {
        const ok = await confirmDialog(
          "Удалить документ?",
          `«${d.title}» будет удалён безвозвратно.`,
          { danger: true, confirmText: "Удалить", cancelText: "Отмена" }
        );
        if (!ok) return;
        try {
          await API.del(`/docs/${id}`);
          toast("Документ удалён", "success");
          router();
        } catch (err) {
          toast("Ошибка: " + err.message, "error");
        }
      };
    }
  } catch (e) {
    app.innerHTML = `<section class="page">
      <button class="back" id="doc-back" type="button">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>Назад</span>
      </button>
      <p class="error">${escapeHtml(e.message)}</p>
    </section>`;
    document.getElementById("doc-back").onclick = () => router();
  }
}

// =====================================================
// ADMIN PAGE (ВКЛАДКИ)
// =====================================================
async function renderAdmin() {
  if (CURRENT_USER?.role !== "admin") { location.hash = "/chat"; return; }

  app.innerHTML = `
    <section class="page">
      <h1>⚙️ Админ-панель</h1>
      
      <div class="stats" id="stats" style="margin-bottom: 1.5rem;">
        <div class="skeleton" style="width:120px; height:1.2rem"></div>
      </div>

      <div class="tabs">
        <button class="tab-btn active" data-tab="docs">📄 Документы</button>
        <button class="tab-btn" data-tab="users">👥 Пользователи</button>
        <button class="tab-btn" data-tab="settings">⚙️ Настройки</button>
      </div>

      <div id="tab-content"></div>
    </section>`;

  async function refreshStats() {
    try {
      const s = await API.get("/admin/stats");
      document.getElementById("stats").innerHTML = `
        <span>👥 Юзеров: <b>${s.users}</b></span>
        <span>📄 Документов: <b>${s.docs}</b></span>
        <span>🌐 Публичных: <b>${s.public_docs}</b></span>`;
    } catch {}
  }

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderTab(btn.dataset.tab);
    };
  });

  async function renderTab(tab) {
    const content = document.getElementById("tab-content");
    content.innerHTML = `<div class="skeleton" style="height:200px; border-radius:12px;"></div>`;

    if (tab === "docs") {
      content.innerHTML = `
        <div id="admin-dropzone" style="margin-bottom: 1rem;"></div>
        <p class="muted">Загруженные здесь файлы станут публичными и будут доступны всем пользователям.</p>
      `;
      mountDropzone(document.getElementById("admin-dropzone"), {
        formats: [".txt", ".pdf", ".docx", ".xlsx", ".csv", ".md"],
        title: "Перетащите публичный документ",
        onFile: (file) => API.upload("/docs/upload", file, { public: true }),
        onBatchDone: refreshStats,
      });
    } 
    
    else if (tab === "users") {
      content.innerHTML = `
        <div class="search-box" style="margin-bottom: 1rem;">
          <input type="search" id="users-search" placeholder="Поиск по имени или коду...">
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 50px;">ID</th>
                <th>Имя</th>
                <th>Код</th>
                <th style="width: 130px;">Роль</th>
                <th style="width: 100px; text-align:right;">Действия</th>
              </tr>
            </thead>
            <tbody id="users-tbody"></tbody>
          </table>
        </div>
      `;

      let allUsers = await API.get("/admin/users");
      
      function renderUsersTable(filter = "") {
        const tbody = document.getElementById("users-tbody");
        let filtered = allUsers.filter(u => 
          u.name.toLowerCase().includes(filter) || u.code_formatted.toLowerCase().includes(filter)
        );

        if (!filtered.length) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Не найдено</td></tr>`;
          return;
        }

        tbody.innerHTML = "";
        filtered.forEach(u => {
          const tr = el(`
            <tr style="${u.is_banned ? 'opacity: 0.5; background: rgba(239,68,68,0.05);' : ''}">
              <td>${u.id}</td>
              <td><b>${escapeHtml(u.name)}</b> ${u.is_banned ? '🚫' : ''}</td>
              <td><code>${escapeHtml(u.code_formatted)}</code></td>
              <td>
                <select data-uid="${u.id}" style="width:100%; padding:0.3rem;">
                  ${["student", "teacher", "parent", "admin"].map(r =>
                    `<option value="${r}" ${r === u.role ? "selected" : ""}>${ROLE_LABELS[r]}</option>`
                  ).join("")}
                </select>
              </td>
              <td class="td-actions">
                <button class="table-btn ${u.is_banned ? '' : 'danger'}" title="${u.is_banned ? 'Разбанить' : 'Забанить'}" data-ban>
                  ${u.is_banned ? '🔓' : '🔒'}
                </button>
              </td>
            </tr>
          `);

          tr.querySelector("select").onchange = async (e) => {
            try {
              await API.post(`/admin/users/${u.id}/role`, { role: e.target.value });
              toast("Роль обновлена", "success");
            } catch(err) { toast("Ошибка: " + err.message, "error"); e.target.value = u.role; }
          };

          tr.querySelector("[data-ban]").onclick = async () => {
            try {
              await API.post(`/admin/users/${u.id}/ban`, { is_banned: !u.is_banned });
              toast(`Пользователь ${u.is_banned ? 'разбанен' : 'забанен'}`, "success");
              renderTab("users");
            } catch(err) { toast("Ошибка: " + err.message, "error"); }
          };

          tbody.appendChild(tr);
        });
      }

      renderUsersTable();
      document.getElementById("users-search").oninput = (e) => renderUsersTable(e.target.value.toLowerCase());
    } 
    
    else if (tab === "settings") {
      const cfg = await API.get("/admin/config");
      
      content.innerHTML = `
        <form id="settings-form" class="form" style="max-width: 800px;">
          <label>Системный промпт агента (поведение ИИ)</label>
          <textarea name="system_prompt" rows="8" style="font-family: monospace; font-size: 0.9rem;" placeholder="Оставьте пустым для использования стандартного промпта...">${escapeHtml(cfg.system_prompt)}</textarea>
          <p class="muted" style="font-size:0.8rem; margin-top:0.2rem;">Здесь можно задать характер ИИ. Например: "Отвечай как строгий учитель" или "Будь максимально кратким".</p>

          <label style="margin-top:1.5rem;">Максимальный размер контекста (символов)</label>
          <input type="number" name="max_context_chars" value="${cfg.max_context_chars}">
          <p class="muted" style="font-size:0.8rem;">Сколько текста из базы знаний ИИ может прочитать за один раз.</p>

          <button type="submit" style="margin-top:1.5rem;">Сохранить настройки</button>
        </form>
      `;

      document.getElementById("settings-form").onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        try {
          await API.post("/admin/config", {
            system_prompt: fd.system_prompt,
            max_context_chars: parseInt(fd.max_context_chars) || 120000
          });
          toast("Настройки сохранены", "success");
        } catch (err) { toast("Ошибка: " + err.message, "error"); }
      };
    }
  }

  await refreshStats();
  renderTab("docs");
}

async function renderProfile() {
  if (!CURRENT_USER) { location.hash = "/chat"; return; }
  const isAdmin = CURRENT_USER.role === "admin";

  app.innerHTML = `
    <section class="page narrow">
      <h1>👤 Профиль</h1>

      <div class="profile-card">
        <p><b>Имя:</b> ${escapeHtml(CURRENT_USER.name)}</p>
        <p><b>Роль:</b> ${ROLE_LABELS[CURRENT_USER.role] || CURRENT_USER.role}${isAdmin ? " <span class='role-chip' style='margin:0; padding:.15rem .5rem; font-size:.65rem; display:inline-flex; vertical-align:middle'>🛠 АДМИН</span>" : ""}</p>
      </div>

      <h2>Ваш код доступа</h2>
      <p class="muted">Сохраните код — по нему можно войти с другого устройства и вернуть историю и документы.</p>
      <div class="code-box">
        <code id="my-code">${escapeHtml(CURRENT_USER.code_formatted)}</code>
        <button id="copy-code" title="Скопировать">📋</button>
      </div>

      <hr>
      <h2>Приложение</h2>
      <p class="muted">Установите Лицей GPT на главный экран — он будет работать как обычное приложение.</p>
      <button id="install-btn" class="secondary">📲 Установить на устройство</button>

      <h2>Уведомления</h2>
      <div class="notif-row">
        <span id="notif-status" class="muted">Статус: —</span>
        <button id="notif-enable" class="secondary">🔔 Включить / проверить</button>
      </div>

      <hr>
      <button id="logout-btn" class="secondary">🚪 Выйти</button>
      <hr>
      <h2>Войти другим кодом</h2>
      <form id="switch-form" class="form">
        <input name="code" placeholder="XXXX-XXXX-XXXX" autocomplete="off"
               style="text-align:center; letter-spacing:2px; font-family:ui-monospace, monospace; text-transform:uppercase">
        <button type="submit" class="secondary">Войти по коду</button>
        <div class="error" id="switch-err"></div>
      </form>
    </section>`;

  const inp = document.querySelector('#switch-form input[name="code"]');
  inp.addEventListener("input", () => {
    let v = inp.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
    inp.value = v.replace(/(.{4})(?=.)/g, "$1-");
  });

  document.getElementById("copy-code").onclick = () => {
    navigator.clipboard.writeText(CURRENT_USER.code_formatted).then(() => {
      const b = document.getElementById("copy-code");
      b.textContent = "✓";
      setTimeout(() => (b.textContent = "📋"), 1200);
      toast("Код скопирован", "success", 1800);
    });
  };

  updateInstallUI();
  document.getElementById("install-btn").onclick = installApp;

  const nbtn = document.getElementById("notif-enable");
  const nstat = document.getElementById("notif-status");
  const permLabels = {
    granted: "включены", denied: "запрещены в браузере",
    default: "не запрошены", unsupported: "не поддерживаются",
  };
  const refreshNotifStatus = () => {
    nstat.textContent = "Статус: " + (permLabels[Notifications.permission] || "—");
  };
  refreshNotifStatus();
  nbtn.onclick = async () => { await Notifications.test(); refreshNotifStatus(); };

  document.getElementById("logout-btn").onclick = async () => {
    const ok = await confirmDialog(
      "Выйти из аккаунта?",
      "Код сохранён — сможете войти обратно в любой момент.",
      { confirmText: "Выйти", cancelText: "Отмена" }
    );
    if (!ok) return;
    await API.post("/auth/logout");
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_API_CACHE" });
    CURRENT_USER = null;
    updateChrome();
    document.body.classList.add("onboarding");
    location.hash = "/";
    renderOnboard();
  };

  document.getElementById("switch-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      CURRENT_USER = await API.post("/auth/login-code", { code: e.target.code.value });
      updateChrome();
      toast(`Вы вошли как ${CURRENT_USER.name}`, "success");
      location.hash = "/chat";
      router();
    } catch (err) {
      document.getElementById("switch-err").textContent = err.message;
    }
  };
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      const checkUpdate = () => reg.update().catch(() => {});
      setInterval(checkUpdate, 15 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkUpdate();
      });
    } catch {}
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}

(async () => {
  applyTheme();
  syncViewportHeight();
  await loadUser();
  updateInstallUI();
  if (!CURRENT_USER) renderOnboard();
  else router();
})();