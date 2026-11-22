// Copyright (c) 2026 Король Дмитрий. All rights reserved.
// Проект «Лицей GPT». Автор — Король Дмитрий.

const VERSION = "v20";
const APP_CACHE = `licey-app-${VERSION}`;
const API_CACHE = `licey-api-${VERSION}`;

const APP_SHELL = [
  "/", "/static/styles.css", "/static/app.js", "/static/api.js",
  "/manifest.json", "/static/icons/192.png", "/static/icons/512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => Promise.all(APP_SHELL.map((a) => c.add(a).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== APP_CACHE && k !== API_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => { try { c.navigate(c.url); } catch {} });
  })());
});

function isApiGet(url) {
  return url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/")
      && !url.pathname.startsWith("/api/chat/stream") && !url.pathname.startsWith("/api/admin/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).then((r) => {
      caches.open(APP_CACHE).then((c) => c.put("/", r.clone())).catch(() => {});
      return r;
    }).catch(() => caches.match("/")));
    return;
  }

  if (isApiGet(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(API_CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh.status === 200) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(req);
        return cached || new Response("{}", { status: 503 });
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/static/") || url.pathname === "/manifest.json") {
    event.respondWith(fetch(req).then((res) => {
      if (res.status === 200) caches.open(APP_CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
      return res;
    }).catch(() => caches.match(req)));
  }
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "CLEAR_API_CACHE") caches.delete(API_CACHE);
  if (msg.type === "SKIP_WAITING") self.skipWaiting();
});