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

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function canInstall() {
  return !isStandalone();
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
    if (show && deferredInstallPrompt && !sessionStorage.getItem("ib-hide")) {
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
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallUI();
    if (outcome === "accepted") toast("Устанавливаю…", "success");
    return;
  }
  if (isIOS()) {
    await confirmDialog(
      "Установка на iPhone / iPad",
      "Нажми «Поделиться» в Safari, выбери «На экран Домой» — приложение появится как иконка.",
      { confirmText: "Понятно", cancelText: "Отмена" }
    );
  } else {
    toast("Меню браузера → «Установить приложение»", "info", 5000);
  }
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallUI();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
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
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-icon ${danger ? "danger" : ""}">${danger ? "🗑" : "❔"}</div>
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        <p class="modal-text">${escapeHtml(message)}</p>
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
      history.forEach((m) => addMessage(m.role, m.content, m.role === "assistant"));
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
    bot.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;

    let acc = "";
    let first = true;
    try {
      for await (const chunk of API.streamChat(text)) {
        if (first) { bot.innerHTML = ""; first = false; }
        acc += chunk;
        bot.innerHTML = renderMarkdown(acc);
        messages.scrollTop = messages.scrollHeight;
      }
      if (first) bot.innerHTML = renderMarkdown("…");
    } catch (err) {
      bot.innerHTML = renderMarkdown("⚠️ " + (err.message || "Ошибка"));
    } finally {
      sendBtn.disabled = false;
      ta.focus();
    }
  };

  ta.focus();
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

async function renderDocs() {
  const isAdmin = CURRENT_USER.role === "admin";
  let allDocs = [];

  app.innerHTML = `
    <section class="page">
      <h1>${isAdmin ? "📚 Все документы" : "📚 Мои документы"}</h1>
      <p class="muted">${isAdmin
        ? "Публичные доступны всем. Личные — только владельцу и вам. Форматы: PDF, DOCX, XLSX, CSV, TXT, MD."
        : "Здесь только ваши документы. Форматы: PDF, DOCX, XLSX, CSV, TXT, MD."}</p>

      <div id="dropzone-host" style="margin:1rem 0"></div>

      <div class="docs-toolbar">
        <div class="search-box">
          <input type="search" id="docs-search"
                 placeholder="Поиск по названию или содержимому..."
                 autocomplete="off">
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
          ${isAdmin ? `
            <label class="switch">
              <input type="checkbox" id="docs-group" checked>
              <span>Группировать</span>
            </label>` : ""}
        </div>
      </div>

      <div class="docs-list" id="docs-list">
        <div class="skeleton" style="height:70px"></div>
        <div class="skeleton" style="height:70px; margin-top:.5rem"></div>
      </div>
    </section>`;

  const state = { filter: "all", search: "", sort: "new", group: true };

  document.getElementById("docs-search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderList();
  });
  document.getElementById("docs-sort").addEventListener("change", (e) => {
    state.sort = e.target.value; renderList();
  });
  const groupChk = document.getElementById("docs-group");
  if (groupChk) groupChk.addEventListener("change", (e) => { state.group = e.target.checked; renderList(); });

  const filtersEl = document.getElementById("docs-filters");
  if (filtersEl) {
    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state.filter = btn.dataset.filter;
      filtersEl.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
      renderList();
    });
  }

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
      renderList();
    } catch (e) {
      document.getElementById("docs-list").innerHTML =
        `<p class="error">Не удалось загрузить: ${escapeHtml(e.message)}</p>`;
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

  function applyFilters(docs) {
    let out = docs;
    if (state.filter === "public") out = out.filter((d) => d.public);
    else if (state.filter === "mine") out = out.filter((d) => d.mine);
    else if (state.filter === "others") out = out.filter((d) => !d.mine && !d.public);
    if (state.search) {
      const q = state.search;
      out = out.filter((d) =>
        (d.title || "").toLowerCase().includes(q) ||
        (d.preview || "").toLowerCase().includes(q)
      );
    }
    const sorters = {
      new: (a, b) => b.id - a.id,
      old: (a, b) => a.id - b.id,
      title: (a, b) => (a.title || "").localeCompare(b.title || "", "ru"),
    };
    return [...out].sort(sorters[state.sort] || sorters.new);
  }

  function renderList() {
    const list = document.getElementById("docs-list");
    const docs = applyFilters(allDocs);
    if (!allDocs.length) {
      list.innerHTML = `<p class="empty-hint">Пока пусто. Загрузите документ — я буду опираться на него в ответах.</p>`;
      return;
    }
    if (!docs.length) {
      list.innerHTML = `<p class="empty-hint">Ничего не найдено по фильтру.</p>`;
      return;
    }
    list.innerHTML = "";

    if (isAdmin && state.group) {
      const groups = new Map();
      docs.forEach((d) => {
        let key, label;
        if (d.public)      { key = "public"; label = "🌐 Публичные"; }
        else if (d.mine)   { key = "mine";   label = "🙋 Мои"; }
        else               { key = `u_${d.owner_id}`; label = `👤 ${d.owner_name || ("Пользователь " + d.owner_id)}`; }
        if (!groups.has(key)) groups.set(key, { label, items: [] });
        groups.get(key).items.push(d);
      });
      groups.forEach(({ label, items }) => {
        const section = document.createElement("div");
        section.className = "docs-group";
        section.innerHTML = `
          <div class="docs-group-head">
            <span class="docs-group-title">${escapeHtml(label)}</span>
            <span class="docs-group-count">${items.length}</span>
            <span class="docs-group-chevron">▾</span>
          </div>
          <div class="docs-group-body"></div>`;
        const body = section.querySelector(".docs-group-body");
        items.forEach((d) => body.appendChild(renderDocItem(d)));
        section.querySelector(".docs-group-head").onclick = () => section.classList.toggle("collapsed");
        list.appendChild(section);
      });
    } else {
      docs.forEach((d) => list.appendChild(renderDocItem(d)));
    }
  }

  function renderDocItem(d) {
    const badges = [];
    if (d.public) badges.push(`<span class="badge">🌐 публичный</span>`);
    if (d.mine) badges.push(`<span class="badge badge-mine">мой</span>`);
    if (isAdmin && !d.mine && !d.public && d.owner_name) {
      badges.push(`<span class="badge badge-other">👤 ${escapeHtml(d.owner_name)}</span>`);
    }
    const canDelete = d.mine || isAdmin;

    const item = el(`
      <div class="doc-item" data-id="${d.id}">
        <div class="doc-head">
          <b>${escapeHtml(d.title)}</b>
          <div class="badges">${badges.join("")}</div>
        </div>
        <p>${escapeHtml(d.preview)}…</p>
        ${canDelete ? `
          <button class="del-btn" title="Удалить документ" data-del aria-label="Удалить">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>
            </svg>
          </button>` : ""}
      </div>`);
    item.querySelector(".doc-head").onclick = () => openDoc(d.id);
    item.querySelector("p").onclick = () => openDoc(d.id);

    const delBtn = item.querySelector("[data-del]");
    if (delBtn) {
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        const ok = await confirmDialog(
          "Удалить документ?",
          `«${d.title}» будет удалён безвозвратно.`,
          { danger: true, confirmText: "Удалить", cancelText: "Отмена" }
        );
        if (!ok) return;
        try {
          await API.del(`/docs/${d.id}`);
          item.classList.add("removing");
          setTimeout(() => refreshDocs(), 220);
          toast("Документ удалён", "success");
        } catch (err) { toast("Ошибка: " + err.message, "error"); }
      };
    }
    return item;
  }

  await refreshDocs();
}

async function openDoc(id) {
  app.innerHTML = `<section class="page"><div class="skeleton" style="height:200px"></div></section>`;
  try {
    const d = await API.get(`/docs/${id}`);
    app.innerHTML = `
      <section class="page">
        <button class="back" id="doc-back" type="button">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>Назад к списку</span>
        </button>
        <h1>${escapeHtml(d.title)}</h1>
        <pre class="doc-content">${escapeHtml(d.content)}</pre>
      </section>`;
    document.getElementById("doc-back").onclick = () => renderDocs();
  } catch (e) {
    app.innerHTML = `<section class="page">
      <button class="back" id="doc-back" type="button">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>Назад к списку</span>
      </button>
      <p class="error">${escapeHtml(e.message)}</p>
    </section>`;
    document.getElementById("doc-back").onclick = () => renderDocs();
  }
}

async function renderAdmin() {
  if (CURRENT_USER?.role !== "admin") { location.hash = "/chat"; return; }

  app.innerHTML = `
    <section class="page">
      <h1>⚙️ Админ-панель</h1>
      <div class="stats" id="stats">
        <div class="skeleton" style="width:120px; height:1.2rem"></div>
        <div class="skeleton" style="width:120px; height:1.2rem"></div>
        <div class="skeleton" style="width:120px; height:1.2rem"></div>
      </div>

      <h2>Загрузить документ как публичный</h2>
      <p class="muted">Файл будет виден всем пользователям и попадёт в общую базу знаний.</p>
      <div id="admin-dropzone"></div>

      <h2>Пользователи</h2>
      <div class="users-toolbar">
        <div class="search-box">
          <input type="search" id="users-search" placeholder="Поиск по имени или коду..." autocomplete="off">
        </div>
        <div class="filter-chips" id="users-filters">
          <button type="button" class="chip active" data-role="all">Все <span class="chip-count"></span></button>
          <button type="button" class="chip" data-role="student">🎒 Ученики <span class="chip-count"></span></button>
          <button type="button" class="chip" data-role="teacher">📘 Учителя <span class="chip-count"></span></button>
          <button type="button" class="chip" data-role="parent">👪 Родители <span class="chip-count"></span></button>
          <button type="button" class="chip" data-role="admin">🛠 Админы <span class="chip-count"></span></button>
        </div>
      </div>
      <div class="users-list" id="users-list">
        <div class="skeleton" style="height:40px"></div>
      </div>
    </section>`;

  let allUsers = [];
  const state = { role: "all", search: "" };

  async function refreshStats() {
    try {
      const s = await API.get("/admin/stats");
      document.getElementById("stats").innerHTML = `
        <span>👥 Юзеров: <b>${s.users}</b></span>
        <span>📄 Документов: <b>${s.docs}</b></span>
        <span>🌐 Публичных: <b>${s.public_docs}</b></span>`;
    } catch {}
  }

  async function loadUsers() {
    try {
      allUsers = await API.get("/admin/users");
      updateUserCounts();
      renderUsers();
    } catch (e) {
      document.getElementById("users-list").innerHTML =
        `<p class="error">${escapeHtml(e.message)}</p>`;
    }
  }

  function updateUserCounts() {
    const counts = {
      all: allUsers.length,
      student: allUsers.filter((u) => u.role === "student").length,
      teacher: allUsers.filter((u) => u.role === "teacher").length,
      parent: allUsers.filter((u) => u.role === "parent").length,
      admin: allUsers.filter((u) => u.role === "admin").length,
    };
    document.querySelectorAll("#users-filters .chip").forEach((c) => {
      const n = counts[c.dataset.role] ?? 0;
      const el = c.querySelector(".chip-count");
      if (el) el.textContent = n ? `(${n})` : "";
    });
  }

  function applyUserFilters(users) {
    let out = users;
    if (state.role !== "all") out = out.filter((u) => u.role === state.role);
    if (state.search) {
      const q = state.search;
      out = out.filter((u) =>
        (u.name || "").toLowerCase().includes(q) ||
        (u.code_formatted || "").toLowerCase().includes(q) ||
        (u.access_code || "").toLowerCase().includes(q)
      );
    }
    return out;
  }

  function renderUsers() {
    const list = document.getElementById("users-list");
    const users = applyUserFilters(allUsers);
    if (!allUsers.length) { list.innerHTML = `<p class="empty-hint">Пока нет пользователей.</p>`; return; }
    if (!users.length) { list.innerHTML = `<p class="empty-hint">Ничего не найдено.</p>`; return; }
    list.innerHTML = "";
    users.forEach((u) => {
      const row = el(`
        <div class="user-row">
          <div class="user-info">
            <b>${escapeHtml(u.name)}</b>
            <div class="muted"><code>${escapeHtml(u.code_formatted)}</code></div>
          </div>
          <select data-uid="${u.id}">
            ${["student", "teacher", "parent", "admin"].map((r) =>
              `<option value="${r}" ${r === u.role ? "selected" : ""}>${ROLE_LABELS[r] || r}</option>`
            ).join("")}
          </select>
        </div>`);
      row.querySelector("select").onchange = async (e) => {
        try {
          await API.post(`/admin/users/${u.id}/role`, { role: e.target.value });
          u.role = e.target.value;
          updateUserCounts();
          toast(`Роль обновлена: ${u.name} → ${e.target.value}`, "success");
        } catch (err) { toast("Ошибка: " + err.message, "error"); }
      };
      list.appendChild(row);
    });
  }

  document.getElementById("users-search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderUsers();
  });
  document.getElementById("users-filters").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.role = btn.dataset.role;
    document.querySelectorAll("#users-filters .chip").forEach((c) => c.classList.toggle("active", c === btn));
    renderUsers();
  });

  await Promise.all([refreshStats(), loadUsers()]);

  mountDropzone(document.getElementById("admin-dropzone"), {
    formats: [".txt", ".pdf", ".docx", ".xlsx", ".csv", ".md"],
    title: "Перетащите документ для публичной базы",
    onFile: (file) => API.upload("/docs/upload", file, { public: true }),
    onBatchDone: refreshStats,
  });
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
      <p class="muted">Установите Лицей GPT на главный экран — он будет работать как обычное приложение, включая оффлайн-просмотр ранее загруженных данных.</p>
      <button id="install-btn" class="secondary">📲 Установить на устройство</button>

      <h2>Уведомления</h2>
      <p class="muted">Модуль готов. Уведомления можно получать от администратора (рассылки, события). Пока — тестовое, для проверки.</p>
      <div class="notif-row">
        <span id="notif-status" class="muted">Статус: —</span>
        <button id="notif-enable" class="secondary">🔔 Включить / проверить</button>
      </div>

      <hr>
      <button id="logout-btn" class="secondary">🚪 Выйти</button>
      <hr>
      <h2>Войти другим кодом</h2>
      <p class="muted">Сменить аккаунт на этом устройстве.</p>
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
      const reg = await navigator.serviceWorker.register("/sw.js");
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            sw.postMessage({ type: "SKIP_WAITING" });
            toast("Обновление готово. Перезагрузите страницу.", "info", 6000);
          }
        });
      });
    } catch {}
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