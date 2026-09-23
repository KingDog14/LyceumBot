// Copyright (c) 2026 Король Дмитрий. All rights reserved.
// Проект «Лицей GPT». Автор — Король Дмитрий.

const VERSION = "v3";
const APP_CACHE = `licey-app-${VERSION}`;
const API_CACHE = `licey-api-${VERSION}`;

const APP_SHELL = [
  "/",
  "/static/styles.css",
  "/static/app.js",
  "/static/api.js",
  "/manifest.json",
  "/static/icons/192.png",
  "/static/icons/512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then((c) =>
      Promise.all(APP_SHELL.map((a) => c.add(a).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isApiGet(url) {
  return url.pathname.startsWith("/api/")
      && !url.pathname.startsWith("/api/auth/")
      && !url.pathname.startsWith("/api/chat/stream")
      && !url.pathname.startsWith("/api/admin/");
}

async function networkFirstCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.status === 200) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ offline: true, detail: "Нет соединения" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(APP_CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return r;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  if (isApiGet(url)) {
    event.respondWith(networkFirstCache(req, API_CACHE));
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/static/") || url.pathname === "/manifest.json") {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && req.method === "GET") {
              const copy = res.clone();
              caches.open(APP_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data?.text() || "" }; }

  const title = data.title || "Лицей GPT";
  const options = {
    body: data.body || "Новое уведомление",
    icon: data.icon || "/static/icons/192.png",
    badge: data.badge || "/static/icons/192.png",
    tag: data.tag || "licey-default",
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url: data.url || "/#/chat" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/#/chat";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "CLEAR_API_CACHE") {
    caches.delete(API_CACHE);
  }
  if (msg.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "licey-pending") {
  }
});