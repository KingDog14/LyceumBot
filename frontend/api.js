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

  async upload(path, file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api${path}`, {
      method: "POST", body: fd, credentials: "include",
    });
    if (!res.ok) {
      let msg = "Upload failed";
      try { msg = (await res.json()).detail || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  /** SSE через fetch + ReadableStream */
  async *streamChat(message) {
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
        const line = block.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const data = line.slice(6);
        if (data === "[DONE]") return;
        yield data.replace(/\\n/g, "\n");
      }
    }
  },
};