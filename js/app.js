/* Router, global events and form handlers. */
(function () {
  const M = window.M, esc = M.esc;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  let first = true;

  const parse = () => {
    const h = (location.hash || "#/").slice(1); const [p, qs] = h.split("?");
    const q = Object.fromEntries(new URLSearchParams(qs || ""));
    return { parts: p.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).map(decodeURIComponent), q };
  };

  async function render() {
    if (!M.cache.articles) return;
    if (M.cleanup) { M.cleanup(); M.cleanup = null; }
    M.$("#nav") && M.$("#nav").classList.remove("open");
    const { parts, q } = parse(); const main = M.$("#view"); const key = parts[0] || "home";
    let v, route = key;
    try {
      if (key === "admin") { document.body.classList.add("is-admin"); v = await M.admin.view(parts.slice(1), q); route = "admin"; }
      else {
        document.body.classList.remove("is-admin");
        if (key === "home") v = M.views.home();
        else if (key === "a" && parts[1]) v = M.views.article(parts[1], q.preview === "1" && M.admin.isAuthed()), route = "article";
        else if (M.views[key] && parts.length === 1 && key !== "article" && key !== "notfound") v = M.views[key](q);
        else v = M.views.notfound();
      }
    } catch (e) { console.error(e); v = { title: "Something went wrong", html: '<div class="narrow page-head"><h1 id="h1">Something went wrong</h1><p>That page couldn’t be shown. Try reloading; if it keeps happening, your browser storage may be blocked.</p><a class="btn" href="#/">Home</a></div>' }; }
    const paint = () => {
      document.title = v.title || M.cache.settings.siteName;
      const md = M.$('meta[name="description"]'); if (md) md.content = v.desc || M.cache.settings.tagline;
      M.renderHeader(route); M.renderFooter();
      main.innerHTML = v.html;
      main.style.animation = "none"; void main.offsetWidth; main.style.animation = "";
      M.$("#footer").hidden = route === "admin";
      if (v.after) v.after(main);
      M.afterRender(main);
      if (!first) { const h1 = M.$("#h1", main); if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); } scrollTo(0, 0); }
      first = false;
    };
    const motionOff = document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !motionOff && !first) { const vt = document.startViewTransition(paint); vt.ready.catch(() => {}); vt.finished.catch(() => {}); vt.updateCallbackDone.catch(() => {}); } else paint();
  }
  M.render = render;

  // ---------- form helpers ----------
  const setMsg = (form, text, ok) => { const el = M.$(".hint[role=status]", form) || form.querySelector(".hint"); if (el) { el.textContent = text; el.style.color = ok ? "var(--burgundy)" : "#9b1c1c"; if (!ok && document.documentElement.dataset.mode === "dark") el.style.color = "#ff9b9b"; } };
  const tooFast = (key, ms) => { const t = M.lsGet(key, 0); if (Date.now() - t < ms) return true; M.lsSet(key, Date.now()); return false; };
  const val = (f, n) => (f.elements[n] ? f.elements[n].value.trim() : "");

  const forms = {
    async search(f) { const q = val(f, "q") || M.$("input", f).value.trim(); location.hash = "#/search?q=" + encodeURIComponent(q); },
    async newsletter(f) {
      const email = val(f, "email").toLowerCase();
      if (val(f, "website")) return setMsg(f, "Thank you!", true); // honeypot: pretend success, store nothing
      if (!EMAIL.test(email) || email.length > 120) return setMsg(f, "Please enter a valid email address, like name@example.com.", false);
      if (tooFast("lastSub", 4000)) return setMsg(f, "Please wait a moment before trying again.", false);
      const ex = await M.db.get("subscribers", email);
      if (ex && ex.status === "subscribed") return setMsg(f, "That address is already on the list.", true);
      await M.db.put("subscribers", { email, status: "subscribed", at: new Date().toISOString(), prefs: { weekly: true, monthly: true } });
      f.reset(); setMsg(f, "Added to this browser’s subscriber list. (No email is sent automatically — see the Newsletter page.)", true); M.toast("You’re on the list");
    },
    async contact(f) {
      const d = { name: val(f, "name"), email: val(f, "email"), subject: val(f, "subject"), message: val(f, "message") };
      if (val(f, "website")) return setMsg(f, "Thank you!", true);
      if (!d.name || !d.subject) return setMsg(f, "Please fill in your name and a subject.", false);
      if (!EMAIL.test(d.email)) return setMsg(f, "Please enter a valid email address.", false);
      if (d.message.length < 5) return setMsg(f, "Your message is a little short — please write at least a sentence.", false);
      if (tooFast("lastContact", 15000)) return setMsg(f, "Please wait a few seconds before sending another message.", false);
      await M.db.put("messages", Object.assign({ id: M.uid(), at: new Date().toISOString(), read: false }, d));
      f.reset(); setMsg(f, "Saved on this device for Mifrah’s dashboard. It has not been emailed anywhere.", true); M.toast("Message saved");
    },
    async comment(f) {
      const name = val(f, "name"), body = val(f, "body");
      if (val(f, "website")) return setMsg(f, "Thank you — your comment is waiting for approval.", true);
      if (!name || body.length < 2) return setMsg(f, "Please add your name and a comment.", false);
      if (/https?:\/\/.*https?:\/\//is.test(body)) return setMsg(f, "Please keep to one link at most.", false);
      if (tooFast("lastComment", 20000)) return setMsg(f, "Please wait a little before posting another comment.", false);
      await M.db.put("comments", { id: M.uid(), articleId: f.dataset.article, name: name.slice(0, 60), body: body.slice(0, 2000), status: "pending", at: new Date().toISOString() });
      await M.refresh(); f.reset(); setMsg(f, "Thank you! Your comment is waiting for approval and will appear once it’s approved.", true); M.toast("Comment submitted for approval");
    },
  };
  M.forms = Object.assign(M.forms || {}, forms);
  document.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-form]"); if (!f) return; e.preventDefault();
    const btn = M.$("button[type=submit]", f); if (btn) btn.disabled = true;
    try { await M.forms[f.dataset.form](f); } catch (err) { console.error(err); setMsg(f, "Sorry, that didn’t work: " + (err.message || "storage error"), false); }
    if (btn) btn.disabled = false;
  });

  // ---------- click actions ----------
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      try { const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; } catch (e2) { return false; }
    }
  };
  const isDark = () => { const m = document.documentElement.dataset.mode; return m === "dark" || (m === "auto" && matchMedia("(prefers-color-scheme: dark)").matches); };
  document.addEventListener("click", async (e) => {
    const sc = e.target.closest("[data-scroll]"); if (sc) { const t = M.$(sc.dataset.scroll); if (t) { t.scrollIntoView({ behavior: "smooth", block: "start" }); const h = t.querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } } return; }
    const b = e.target.closest("[data-act]"); if (!b) return; const act = b.dataset.act;
    if (act === "menu") { const n = M.$("#nav"), o = n.classList.toggle("open"); b.setAttribute("aria-expanded", o); b.setAttribute("aria-label", o ? "Close menu" : "Open menu"); }
    else if (act === "search") { const p = M.$("#searchPanel"), o = p.classList.toggle("open"); b.setAttribute("aria-expanded", o); if (o) M.$("#hq").focus(); }
    else if (act === "mode") { document.documentElement.classList.add("themed-transition"); M.lsSet("mode", isDark() ? "light" : "dark"); M.applyTheme(); setTimeout(() => document.documentElement.classList.remove("themed-transition"), 700); }
    else if (act === "fav") {
      const id = b.dataset.id; const on = M.toggleFav(id); const a = M.cache.articles.find((x) => x.id === id);
      M.$$('[data-act="fav"][data-id="' + id + '"]').forEach((x) => { x.setAttribute("aria-pressed", on); const sp = x.querySelector("span"); if (sp && x.classList.contains("tool")) sp.textContent = on ? "Saved" : "Save"; if (x.classList.contains("save-btn")) x.setAttribute("aria-label", (on ? "Remove from" : "Save to") + " reading list: " + (a ? a.title : "")); x.classList.remove("pop"); void x.offsetWidth; x.classList.add("pop"); });
      M.toast(on ? "Saved to your reading list (this browser only)" : "Removed from your reading list");
      if ((parse().parts[0] || "") === "favorites" && !on) render();
    }
    else if (act === "copylink") { M.toast((await copy(location.href)) ? "Link copied" : "Couldn’t copy — please copy the address bar instead", null); }
    else if (act === "share") {
      if (navigator.share) { try { await navigator.share({ title: document.title, url: location.href }); } catch (err) { if (err.name !== "AbortError") M.toast("Sharing didn’t work. Try Copy link.", "err"); } }
      else M.toast((await copy(location.href)) ? "Sharing isn’t supported here, so the link was copied" : "Couldn’t share or copy the link", null);
    }
    else if (act === "sizeup" || act === "sizedown") { const n = Math.min(4, Math.max(0, M.lsGet("readSize", 2) + (act === "sizeup" ? 1 : -1))); M.lsSet("readSize", n); M.applyReadSize(); }
    else if (act === "focus") { const o = document.body.classList.toggle("focus-mode"); b.setAttribute("aria-pressed", o); M.toast(o ? "Focus mode on — press Esc to leave" : "Focus mode off"); }
    else if (act === "react") {
      const on = await M.toggleReaction(b.dataset.id, b.dataset.kind); b.setAttribute("aria-pressed", on);
      b.querySelector(".n").textContent = (M.cache.reactions[b.dataset.id] || {})[b.dataset.kind] || 0;
    }
    else if (act === "report") { const c = M.cache.comments.find((x) => x.id === b.dataset.id); if (c) { c.reported = true; await M.db.put("comments", c); M.toast("Thanks — Mifrah will review this comment"); b.disabled = true; } }
    else if (M.admin && M.admin.act) M.admin.act(act, b, e);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (document.body.classList.contains("focus-mode")) { document.body.classList.remove("focus-mode"); const t = M.$('[data-act="focus"]'); if (t) t.setAttribute("aria-pressed", "false"); }
      const n = M.$("#nav.open"); if (n) { n.classList.remove("open"); const t = M.$('[data-act="menu"]'); t.setAttribute("aria-expanded", "false"); t.focus(); }
    }
  });
  addEventListener("hashchange", render);

  // ---------- boot ----------
  (async function boot() {
    try {
      await M.load(); M.applyTheme(); M.applyReadSize();
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", M.applyTheme);
      await render();
    } catch (e) {
      console.error(e);
      M.$("#view").innerHTML = '<div class="narrow page-head"><h1>We couldn’t open local storage</h1><p>This site keeps everything in your browser’s own storage. It looks blocked (private/incognito windows and some privacy settings do this). Try a normal window, allow site data, then reload.</p><p class="hint">Technical detail: ' + esc(e.message) + "</p></div>";
    }
  })();
})();
