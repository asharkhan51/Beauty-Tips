/* Core helpers + IndexedDB wrapper. Everything lives in the visitor's own browser. */
(function () {
  const M = (window.M = {});

  // Expected, user-facing problems (bad file, empty title...). Shown as a message, not logged as a bug.
  M.UserError = class UserError extends Error {};
  // ---------- small helpers ----------
  M.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  M.$ = (sel, root = document) => root.querySelector(sel);
  M.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  M.uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  M.slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
  M.fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "");
  M.fmtTime = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  M.words = (md) => (String(md || "").trim().match(/\S+/g) || []).length;
  M.readingMinutes = (md) => Math.max(1, Math.ceil(M.words(md) / 200));
  M.debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; };
  M.lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  M.lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  // ---------- toasts (announced to screen readers) ----------
  M.toast = (msg, type) => {
    let box = M.$(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast" + (type === "err" ? " err" : "");
    t.innerHTML = (type === "err" ? "" : '<svg class="tick" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>') + "<span>" + M.esc(msg) + "</span>";
    box.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, type === "err" ? 6000 : 3200);
  };

  // ---------- accessible confirm dialog ----------
  M.confirm = (title, body, okLabel, danger) => new Promise((res) => {
    const d = document.createElement("dialog");
    d.setAttribute("aria-labelledby", "dlgT");
    d.innerHTML = '<div class="dlg-body"><h2 id="dlgT" style="font-size:1.6rem">' + M.esc(title) + "</h2><p>" + M.esc(body) + '</p></div><div class="dlg-actions"><button class="btn ghost" value="no">Cancel</button><button class="btn ' + (danger ? "danger" : "") + '" value="yes">' + M.esc(okLabel || "OK") + "</button></div>";
    document.body.appendChild(d);
    d.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { d.close(b.value); } });
    d.addEventListener("close", () => { const ok = d.returnValue === "yes"; d.remove(); res(ok); });
    d.showModal();
  });

  M.download = (name, text, type) => {
    const blob = new Blob([text], { type: type || "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  M.csv = (rows) => rows.map((r) => r.map((c) => { let s = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; /* stop spreadsheet formula injection */ return '"' + s.replace(/"/g, '""') + '"'; }).join(",")).join("\r\n");

  // ---------- IndexedDB ----------
  const STORES = ["articles", "revisions", "comments", "messages", "subscribers", "images", "kv"];
  const KEYS = { subscribers: "email", kv: "key" };
  let dbp;
  M.db = {
    open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error("IndexedDB is not available in this browser."));
        const r = indexedDB.open("blogs-by-mifrah", 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) { const st = db.createObjectStore(s, { keyPath: KEYS[s] || "id" }); if (s === "revisions" || s === "comments") st.createIndex("articleId", "articleId"); } });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error || new Error("Could not open local storage."));
        r.onblocked = () => rej(new Error("Storage is blocked by another open tab. Close other tabs of this site and reload."));
      });
      return dbp;
    },
    async tx(store, mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode); const st = t.objectStore(store);
        let out; try { out = fn(st); } catch (e) { rej(e); return; }
        t.oncomplete = () => res(out && "result" in out ? out.result : out);
        t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("Storage write failed (disk full or blocked?)."));
      });
    },
    all: (s) => M.db.tx(s, "readonly", (st) => st.getAll()),
    get: (s, k) => M.db.tx(s, "readonly", (st) => st.get(k)),
    put: (s, v) => M.db.tx(s, "readwrite", (st) => { st.put(v); }),
    del: (s, k) => M.db.tx(s, "readwrite", (st) => { st.delete(k); }),
    clear: (s) => M.db.tx(s, "readwrite", (st) => { st.clear(); }),
  };

  // ---------- safe Markdown (escape first, then format) ----------
  const imgCache = new Map();
  M.imgUrl = async (id) => {
    if (!id) return null;
    if (imgCache.has(id)) return imgCache.get(id);
    const rec = await M.db.get("images", id);
    const url = rec ? URL.createObjectURL(rec.blob) : null;
    imgCache.set(id, url); return url;
  };
  M.forgetImg = (id) => { const u = imgCache.get(id); if (u) URL.revokeObjectURL(u); imgCache.delete(id); };
  const safeUrl = (u) => (/^(https?:\/\/|\/|#|mailto:)/i.test(u) ? u : "#");
  const inline = (s) => {
    s = M.esc(s);
    s = s.replace(/!\[([^\]]*)\]\(img:([\w-]+)\)/g, (m, alt, id) => '<img data-img="' + id + '" alt="' + alt + '" loading="lazy">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => '<a href="' + safeUrl(u.replace(/&amp;/g, "&")) + '" rel="noopener noreferrer">' + t + "</a>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>").replace(/_([^_\n]+)_/g, "<em>$1</em>");
    return s;
  };
  M.md = (src) => {
    const lines = String(src || "").replace(/\r/g, "").split("\n"); const out = []; let list = null, para = [];
    const flushP = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };
    const flushL = () => { if (list) { out.push("</" + list + ">"); list = null; } };
    for (const raw of lines) {
      const l = raw.trimEnd(); let m;
      if (!l.trim()) { flushP(); flushL(); continue; }
      if ((m = l.match(/^(#{1,3})\s+(.*)$/))) { flushP(); flushL(); const n = Math.max(2, m[1].length); out.push("<h" + n + ">" + inline(m[2]) + "</h" + n + ">"); continue; } // # and ## both become h2, ### becomes h3: the page title is the only h1
      if (/^(-{3,}|\*{3,})$/.test(l.trim())) { flushP(); flushL(); out.push("<hr>"); continue; }
      if ((m = l.match(/^>\s?(.*)$/))) { flushP(); flushL(); out.push("<blockquote>" + inline(m[1]) + "</blockquote>"); continue; }
      if ((m = l.match(/^[-*]\s+(.*)$/))) { flushP(); if (list !== "ul") { flushL(); out.push("<ul>"); list = "ul"; } out.push("<li>" + inline(m[1]) + "</li>"); continue; }
      if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { flushP(); if (list !== "ol") { flushL(); out.push("<ol>"); list = "ol"; } out.push("<li>" + inline(m[1]) + "</li>"); continue; }
      flushL(); para.push(l.trim());
    }
    flushP(); flushL(); return out.join("\n");
  };
  M.hydrateImages = async (root) => { for (const img of M.$$("img[data-img]", root)) { const u = await M.imgUrl(img.dataset.img); if (u) img.src = u; else { img.alt = (img.alt || "Image") + " (missing)"; } } };
})();
