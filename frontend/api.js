// Copyright (c) 2026 Король Дмитрий. All rights reserved.
// Проект «Лицей GPT». Автор — Король Дмитрий.

const API = {
  async request(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).detail || msg; } catch {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  },

  get: (p) => API.request(p),
  post: (p, body) => API.request(p, { method: "POST", body }),
  del: (p) => API.request(p, { method: "DELETE" }),

  async upload(path, file, { public: asPublic = false } = {}) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `/api${path}${asPublic ? sep + "public=true" : ""}`;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(url, {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    if (!res.ok) {
      let msg = "Upload failed";
      try { msg = (await res.json()).detail || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  async *streamChat(message, { onSources, onStatus } = {}) {
    const res = await fetch("/api/chat/stream", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error("Stream failed");

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop();

      for (const block of parts) {
        if (!block.trim()) continue;

        let dataLine = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("data: ")) {
            dataLine = line.slice(6).trim();
            break;
          }
        }

        if (!dataLine) continue;
        if (dataLine === "[DONE]") return;

        try {
          const data = JSON.parse(dataLine);
          
          if (data.type === "sources") {
            if (typeof onSources === "function") onSources(data.docs);
          } else if (data.type === "status") {
            if (typeof onStatus === "function") onStatus(data.text);
          } else if (data.type === "chunk") {
            yield data.text;
          }
        } catch (e) {
          console.error("SSE Parse error:", e, dataLine);
        }
      }
    }
  },
};