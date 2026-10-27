/* Visual admin dashboard. Everything is stored in this browser (IndexedDB). */
(function () {
  const M = window.M, esc = M.esc;
  const A = (M.admin = {});
  const enc = new TextEncoder();
  const b64e = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  A.isAuthed = () => sessionStorage.getItem("adminOK") === "1" && !!(M.cloud && M.cloud.isAdmin && M.cloud.isAdmin());
  const kvGet = async (k) => { const r = await M.db.get("kv", k); return r ? r.value : null; };
  const kvSet = (k, v) => M.db.put("kv", { key: k, value: v });
  const hashPass = async (pass, salt) => {
    const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
    return b64e(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64d(salt), iterations: 150000, hash: "SHA-256" }, key, 256));
  };
  const hasCrypto = () => !!(window.crypto && crypto.subtle);

  const NAVI = [["", "Dashboard"], ["articles", "Articles"], ["edit/new", "New article"], ["comments", "Comments"], ["inbox", "Messages & subscribers"], ["look", "Look & feel"], ["hero", "Homepage Hero Editor"], ["cards", "Article Card Designer"], ["content", "Site content"], ["backup", "Backup & reset"]];

  // ---------- authentication (Firebase admin account) ----------
  const authScreen = async () => {
    await M.cloud.ready();
    if (M.cloud.isAdmin()) { sessionStorage.setItem("adminOK", "1"); return null; }
    return { title: "Dashboard sign-in", html: '<div class="narrow page-head"><p class="eyebrow">Dashboard</p><h1 id="h1">Admin sign-in</h1><p>Sign in with the Firebase admin account for this website.</p><div class="note-box"><strong>Secure cloud access:</strong> only the Firebase admin UID configured for this site can publish, edit or delete cloud articles.</div><form data-form="adminlogin" novalidate><div class="field"><label for="admin-email">Email</label><input id="admin-email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="admin-pw">Password</label><input id="admin-pw" name="password" type="password" autocomplete="current-password" required></div><button class="btn" type="submit">Sign in</button><div class="hint" role="status" id="am" style="margin-top:.6rem"></div></form></div>' };
  };
  M.forms = M.forms || {};
  M.forms.adminlogin = async (f) => {
    const m = M.$("#am");
    try {
      await M.cloud.signIn(f.elements.email.value, f.elements.password.value);
      sessionStorage.setItem("adminOK", "1"); M.toast("Signed in"); M.render();
    } catch (e) { m.textContent = e && e.code === "auth/invalid-credential" ? "Email or password is incorrect." : (e.message || "Sign-in failed."); }
  };

  // ---------- shell ----------
  const shell = (cur, inner) => '<button class="btn small ghost admin-toggle" data-act="ad-toggle" aria-expanded="false" aria-controls="aside">Menu</button><div class="admin"><nav class="admin-side" id="aside" aria-label="Dashboard">' +
    NAVI.map((n) => '<a href="#/admin' + (n[0] ? "/" + n[0] : "") + '"' + (cur === (n[0].split("/")[0] || "") ? ' aria-current="page"' : "") + ">" + n[1] + (n[0] === "comments" && pending() ? ' <span class="pill pending">' + pending() + "</span>" : "") + "</a>").join("") +
    '<hr style="border:0;border-top:1px solid var(--line);margin:.8rem 0"><a href="#/">View website ↗</a><a href="#/admin" data-act="ad-lock">Lock dashboard</a></nav><main class="admin-main" id="amain">' + inner + "</main></div>";
  const pending = () => M.cache.comments.filter((c) => c.status === "pending").length;
  const busy = async (btn, fn, okMsg) => {
    const old = btn ? btn.innerHTML : ""; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Working…'; }
    try { const r = await fn(); if (okMsg) M.toast(okMsg); return r; } catch (e) { if (!(e instanceof M.UserError)) console.error(e); M.toast(e.message || "That didn’t work.", "err"); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } }
  };

  A.view = async (parts, q) => {
    if (!A.isAuthed()) { const s = await authScreen(); if (s) return s; }
    const page = parts[0] || "";
    const fn = PAGES[page];
    if (!fn) return { title: "Dashboard", html: shell("", '<h1 id="h1">Not found</h1><p>That dashboard page doesn’t exist.</p>') };
    const r = await fn(parts.slice(1), q);
    return { title: (r.title || "Dashboard") + " — Dashboard", html: shell(page, r.html), after: r.after };
  };

  // ---------- pages ----------
  const PAGES = {};
  A.PAGES = PAGES; A.busy = busy; A.kvGet = kvGet;
  const daysAgo = (iso) => Math.floor((Date.now() - new Date(iso)) / 86400000);

  PAGES[""] = async () => {
    const all = M.cache.articles; const subs = await M.db.all("subscribers"), msgs = await M.db.all("messages");
    const live = all.filter(M.isLive).length, sched = all.filter((a) => a.status !== "draft" && !M.isLive(a)).length, drafts = all.filter((a) => a.status === "draft").length;
    const lastBackup = M.lsGet("lastBackup", ""); const stale = !lastBackup || daysAgo(lastBackup) >= 14;
    const stat = (n, l, i) => '<div class="stat" style="--i:' + i + '"><b data-count="' + n + '">' + n + "</b><span>" + l + "</span></div>";
    return { title: "Dashboard", html: '<h1 id="h1">Dashboard</h1><div class="row"><a class="btn" href="#/admin/edit/new">Write a new article</a><a class="btn ghost" href="#/admin/hero">Edit homepage hero</a><a class="btn ghost" href="#/admin/cards">Design article cards</a><a class="btn ghost" href="#/">View website</a></div>' +
      (stale ? '<div class="note-box" role="status"><strong>Back up your work.</strong> ' + (lastBackup ? "Your last backup was " + daysAgo(lastBackup) + " days ago." : "You haven’t downloaded a backup yet.") + ' Everything lives in this browser, so clearing site data would erase it. <a href="#/admin/backup">Download a backup</a></div>' : "") +
      '<div class="stats">' + stat(live, "Published", 0) + stat(drafts, "Drafts", 1) + stat(sched, "Scheduled", 2) + stat(pending(), "Comments to review", 3) + stat(subs.length, "Subscribers", 4) + stat(msgs.filter((m) => !m.read).length, "Unread messages", 5) + "</div>" +
      '<div class="panel"><h2>Recent articles</h2>' + articleTable(all.slice(0, 6)) + "</div>" };
  };

  const statusOf = (a) => (a.status === "draft" ? "draft" : M.isLive(a) ? "published" : "scheduled");
  function articleTable(list) {
    if (!list.length) return '<p class="hint">No articles yet. <a href="#/admin/edit/new">Write your first one.</a></p>';
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' + list.map((a) => '<tr><td><a href="#/admin/edit/' + a.id + '"><strong>' + esc(a.title || "Untitled") + "</strong></a>" + (a.demo ? ' <span class="demo-badge">Demo</span>' : "") + "</td><td>" + esc(M.cat(a.category).short) + '</td><td><span class="pill ' + statusOf(a) + '">' + statusOf(a) + "</span>" + (statusOf(a) === "scheduled" ? "<br><small>" + M.fmtTime(a.publishedAt) + "</small>" : "") + "</td><td>" + M.fmtDate(a.updatedAt) + '</td><td class="row"><a class="btn small ghost" href="#/admin/edit/' + a.id + '">Edit</a><button class="btn small danger" data-act="ad-del" data-id="' + a.id + '" aria-label="Delete ' + esc(a.title) + '">Delete</button></td></tr>').join("") + "</tbody></table></div>";
  }
  PAGES.articles = async () => ({ title: "Articles", html: '<div class="row between"><h1 id="h1">Articles</h1><a class="btn" href="#/admin/edit/new">New article</a></div><div class="panel">' + articleTable(M.cache.articles) + "</div>" });

  // ---------- editor ----------
  const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  PAGES.edit = async (parts) => {
    const id = parts[0]; let a = id === "new" ? M.newArticle() : M.cache.articles.find((x) => x.id === id);
    if (!a) return { title: "Not found", html: '<h1 id="h1">Article not found</h1><a class="btn" href="#/admin/articles">Back to articles</a>' };
    a = JSON.parse(JSON.stringify(a)); const isNew = id === "new";
    const auto = await kvGet("autosave:" + a.id); let restored = false;
    if (auto && (!isNew ? auto.at > a.updatedAt : true) && auto.data) { Object.assign(a, auto.data); restored = true; }
    const revs = isNew ? [] : await M.revisions(a.id);
    const coverUrl = a.coverId ? await M.imgUrl(a.coverId) : null;
    const html = '<div class="row between"><h1 id="h1">' + (isNew ? "New article" : "Edit article") + '</h1><span class="save-state" id="saveState" role="status">' + (restored ? "Restored your unsaved autosaved draft" : "") + "</span></div>" +
      (restored ? '<div class="note-box">We restored text you hadn’t saved yet. Press Save to keep it, or <button class="btn small ghost" data-act="ad-discard-auto" data-id="' + a.id + '">discard it</button>.</div>' : "") +
      '<div class="editor-layout"><div><div class="panel"><div class="field"><label for="f-title">Title</label><input id="f-title" data-f="title" maxlength="200" value="' + esc(a.title) + '"></div><div class="grid2"><div class="field"><label for="f-subtitle">Subtitle</label><input id="f-subtitle" data-f="subtitle" maxlength="200" value="' + esc(a.subtitle) + '"></div><div class="field"><label for="f-slug">URL name (slug)</label><input id="f-slug" data-f="slug" maxlength="80" value="' + esc(a.slug) + '" aria-describedby="slugh"><div class="hint" id="slugh">Letters, numbers and dashes. Filled in from the title.</div></div></div>' +
      '<div class="field"><label for="f-excerpt">Short excerpt (shown on cards)</label><textarea id="f-excerpt" data-f="excerpt" maxlength="300" style="min-height:70px">' + esc(a.excerpt) + '</textarea></div>' +
      '<div class="field"><div class="row between"><label for="f-content" style="margin:0">Article (Markdown)</label><span class="hint" id="wc"></span></div><div class="row" style="margin:.4rem 0"><button class="btn small ghost" type="button" data-md="## ">Heading</button><button class="btn small ghost" type="button" data-md="**|**">Bold</button><button class="btn small ghost" type="button" data-md="_|_">Italic</button><button class="btn small ghost" type="button" data-md="> ">Quote</button><button class="btn small ghost" type="button" data-md="- ">List</button><label class="btn small ghost" style="margin:0;cursor:pointer">Insert image<input type="file" id="inline-img" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only"></label></div><textarea id="f-content" class="editor-area" data-f="content">' + esc(a.content) + '</textarea><div class="hint">Use ## for headings. Blank line = new paragraph. Page title is the only top-level heading.</div></div>' +
      '<div class="field"><label for="f-note">Personal note from Hadiqa (optional)</label><textarea id="f-note" data-f="authorNote" style="min-height:90px">' + esc(a.authorNote) + "</textarea></div></div>" +
      '<div class="panel"><h2>Search & sharing</h2><div class="field"><label for="f-seot">SEO title (max 70)</label><input id="f-seot" data-f="seoTitle" maxlength="70" value="' + esc(a.seoTitle) + '"></div><div class="field"><label for="f-seod">SEO description (max 200)</label><textarea id="f-seod" data-f="seoDesc" maxlength="200" style="min-height:70px">' + esc(a.seoDesc) + "</textarea></div></div></div>" +
      '<aside><div class="panel"><h2>Publish</h2><div class="field"><label for="f-status">Status</label><select id="f-status" data-f="status"><option value="draft">Draft (private)</option><option value="published">Published</option><option value="scheduled">Scheduled</option></select></div><div class="field" id="dateField"><label for="f-date">Publish date & time</label><input id="f-date" type="datetime-local" data-f="publishedAt" value="' + toLocalInput(a.publishedAt) + '"><div class="hint">A future date keeps it hidden until that time (while this site is open).</div></div>' +
      '<div class="row"><button class="btn" data-act="ad-save">Save</button><button class="btn ghost" data-act="ad-publish">Publish now</button></div><div class="row" style="margin-top:.6rem"><button class="btn small ghost" data-act="ad-preview">Save & preview</button></div></div>' +
      '<div class="panel"><h2>Category & tags</h2><div class="field"><label for="f-cat">Category</label><select id="f-cat" data-f="category">' + M.CATS.map((c) => '<option value="' + c.slug + '">' + esc(c.name) + "</option>").join("") + '</select></div><div class="field"><label for="f-tags">Tags (comma separated)</label><input id="f-tags" data-f="tags" value="' + esc(a.tags.join(", ")) + '"></div></div>' +
      '<div class="panel"><h2>Cover image</h2><div class="cover-pick" id="coverPick">' + (coverUrl ? '<img src="' + coverUrl + '" alt="">' : M.placeholder(a.id)) + '</div><p class="hint">' + (coverUrl ? "" : "This is a generated placeholder — upload your own photo. ") + 'JPG, PNG, WebP or GIF, up to 12 MB.</p><input type="file" id="cover-file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Choose cover image"><div class="field" style="margin-top:.6rem"><label for="f-alt">Describe the image (alt text)</label><input id="f-alt" data-f="coverAlt" maxlength="200" value="' + esc(a.coverAlt) + '"></div>' + (a.coverId ? '<button class="btn small ghost" data-act="ad-rmcover">Remove cover</button>' : "") + "</div>" +
      (isNew ? "" : '<div class="panel"><h2>Version history</h2>' + (revs.length ? '<ul style="padding-left:1rem;margin:0">' + revs.slice(0, 15).map((r, i) => "<li style=\"margin-bottom:.5rem\">" + M.fmtTime(r.at) + "<br><small>" + esc(r.note) + "</small> " + (i === 0 ? '<span class="hint">(current)</span>' : '<button class="btn small ghost" data-act="ad-restore" data-id="' + r.id + '">Restore</button>') + "</li>").join("") + "</ul><p class=\"hint\">Restoring adds a new version; nothing is lost.</p>" : '<p class="hint">No versions yet.</p>') + "</div>") + "</aside></div>";
    const after = (root) => {
      const $ = (s) => M.$(s, root); let dirty = false;
      $("#f-status").value = a.status; $("#f-cat").value = a.category;
      const showDate = () => { $("#dateField").style.display = $("#f-status").value === "draft" ? "none" : ""; };
      const wc = () => { const w = M.words($("#f-content").value); $("#wc").textContent = w + " words · " + M.readingMinutes($("#f-content").value) + " min read"; };
      showDate(); wc();
      const collect = () => {
        const o = {}; M.$$("[data-f]", root).forEach((el) => (o[el.dataset.f] = el.value));
        a.title = o.title; a.subtitle = o.subtitle; a.slug = o.slug; a.excerpt = o.excerpt; a.content = o.content; a.authorNote = o.authorNote; a.seoTitle = o.seoTitle; a.seoDesc = o.seoDesc; a.category = o.category; a.coverAlt = o.coverAlt; a.status = o.status;
        a.tags = o.tags.split(",").map((t) => M.slugify(t)).filter(Boolean).slice(0, 12);
        a.publishedAt = o.publishedAt ? new Date(o.publishedAt).toISOString() : a.publishedAt;
        return a;
      };
      const stampSaved = (txt) => { const s = $("#saveState"); s.className = "save-state saved"; s.textContent = txt; };
      const autosave = M.debounce(async () => { try { collect(); await kvSet("autosave:" + a.id, { at: new Date().toISOString(), data: JSON.parse(JSON.stringify(a)) }); stampSaved("Draft autosaved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " (not published)"); } catch (e) { $("#saveState").textContent = "Autosave failed — " + e.message; } }, 1200);
      let slugTouched = !!a.slug;
      root.oninput = (e) => {
        if (!e.target.dataset.f && e.target.id !== "inline-img") return; dirty = true; window.onbeforeunload = () => "You have unsaved changes.";
        if (e.target.dataset.f === "title" && !slugTouched) $("#f-slug").value = M.slugify(e.target.value);
        if (e.target.dataset.f === "slug") slugTouched = true;
        if (e.target.dataset.f === "content") wc(); autosave();
      };
      root.onchange = async (e) => {
        if (e.target.id === "f-status") { showDate(); if (e.target.value !== "draft" && !$("#f-date").value) $("#f-date").value = toLocalInput(new Date().toISOString()); dirty = true; autosave(); }
        if (e.target.id === "cover-file" || e.target.id === "inline-img") {
          const file = e.target.files[0]; e.target.value = ""; if (!file) return;
          await busy(null, async () => {
            const imgId = await M.addImage(file);
            if (e.target.id === "cover-file") { if (a.coverId) { await M.db.del("images", a.coverId); M.forgetImg(a.coverId); } a.coverId = imgId; const u = await M.imgUrl(imgId); $("#coverPick").innerHTML = '<img src="' + u + '" alt="">'; if (!isNew || true) { collect(); await persist("Cover image saved"); } }
            else { const ta = $("#f-content"), alt = $("#f-alt").value || "Image"; const ins = "\n\n![" + alt.replace(/[\[\]]/g, "") + "](img:" + imgId + ")\n\n"; ta.setRangeText(ins, ta.selectionStart, ta.selectionEnd, "end"); dirty = true; wc(); autosave(); M.toast("Image added to the article"); }
          });
        }
      };
      root.onclick = (e) => { const b = e.target.closest("[data-md]"); if (!b) return; const ta = $("#f-content"); const t = b.dataset.md; const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); const rep = t.includes("|") ? t.replace("|", sel) : t + sel; ta.setRangeText(rep, ta.selectionStart, ta.selectionEnd, "end"); ta.focus(); dirty = true; wc(); autosave(); };
      const persist = async (msg, note) => { collect(); const saved = await M.saveArticle(a, note); window.onbeforeunload = null; dirty = false; stampSaved("Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })); if (msg) M.toast(msg); if (isNew) { history.replaceState(null, "", "#/admin/edit/" + saved.id); } return saved; };
      A.editor = { collect, persist, a, isNew, discard: () => (dirty = false), setDirty: (v) => (dirty = v) };
      M.cleanup = () => { window.onbeforeunload = null; autosave.cancel(); A.editor = null; root.oninput = root.onchange = root.onclick = null; };
    };
    return { title: isNew ? "New article" : "Edit", html, after };
  };

  // ---------- comments ----------
  PAGES.comments = async (parts, q) => {
    const f = q.f || "pending"; let list = [...M.cache.comments].sort((a, b) => b.at.localeCompare(a.at));
    list = f === "all" ? list : f === "reported" ? list.filter((c) => c.reported) : list.filter((c) => c.status === f);
    const title = (id) => { const a = M.cache.articles.find((x) => x.id === id); return a ? a.title : "(deleted article)"; };
    return { title: "Comments", html: '<h1 id="h1">Comments</h1><div class="tabs" role="group" aria-label="Filter comments">' + ["pending", "approved", "rejected", "reported", "all"].map((t) => '<a href="#/admin/comments?f=' + t + '" class="chip" aria-pressed="' + (t === f) + '" style="text-decoration:none;display:inline-flex;align-items:center;margin-right:.3rem">' + t + "</a>").join("") + "</div>" +
      (list.length ? list.map((c) => '<div class="panel"><div class="row between"><div><strong>' + esc(c.name) + '</strong> <span class="pill ' + c.status + '">' + c.status + "</span>" + (c.reported ? ' <span class="pill rejected">reported</span>' : "") + '<br><small>on “' + esc(title(c.articleId)) + "” · " + M.fmtTime(c.at) + "</small></div></div><p style=\"white-space:pre-wrap\">" + esc(c.body) + '</p><div class="row"><button class="btn small" data-act="ad-cstat" data-s="approved" data-id="' + c.id + '">Approve</button><button class="btn small ghost" data-act="ad-cstat" data-s="rejected" data-id="' + c.id + '">Reject</button><button class="btn small danger" data-act="ad-cdel" data-id="' + c.id + '">Delete</button></div></div>').join("") : '<div class="empty"><span class="hand">all clear</span><p>No ' + esc(f) + " comments.</p></div>") };
  };

  // ---------- inbox ----------
  PAGES.inbox = async (parts, q) => {
    const tab = q.t === "subs" ? "subs" : "msgs"; const msgs = (await M.db.all("messages")).sort((a, b) => b.at.localeCompare(a.at)); const subs = (await M.db.all("subscribers")).sort((a, b) => b.at.localeCompare(a.at));
    const tabs = '<div class="tabs" role="tablist"><a role="tab" href="#/admin/inbox" class="chip" aria-selected="' + (tab === "msgs") + '" aria-pressed="' + (tab === "msgs") + '" style="text-decoration:none;display:inline-flex;align-items:center;margin-right:.3rem">Messages (' + msgs.length + ')</a><a role="tab" href="#/admin/inbox?t=subs" class="chip" aria-selected="' + (tab === "subs") + '" aria-pressed="' + (tab === "subs") + '" style="text-decoration:none;display:inline-flex;align-items:center">Subscribers (' + subs.length + ")</a></div>";
    const body = tab === "msgs" ? (msgs.length ? msgs.map((m) => '<div class="panel"><strong>' + esc(m.subject) + "</strong>" + (m.read ? "" : ' <span class="pill pending">new</span>') + "<br><small>" + esc(m.name) + " &lt;" + esc(m.email) + "&gt; · " + M.fmtTime(m.at) + '</small><p style="white-space:pre-wrap">' + esc(m.message) + '</p><div class="row"><a class="btn small ghost" href="mailto:' + encodeURIComponent(m.email) + "?subject=" + encodeURIComponent("Re: " + m.subject) + '">Reply by email</a><button class="btn small ghost" data-act="ad-mread" data-id="' + m.id + '">' + (m.read ? "Mark unread" : "Mark read") + '</button><button class="btn small danger" data-act="ad-mdel" data-id="' + m.id + '">Delete</button></div></div>').join("") : '<div class="empty"><span class="hand">quiet for now</span><p>No messages yet.</p></div>') :
      '<div class="note-box">This list is stored in this browser. No emails are sent from this website — export the list and use your own email tool for newsletters.</div><div class="row" style="margin-bottom:1rem"><button class="btn" data-act="ad-subcsv"' + (subs.length ? "" : " disabled") + '>Download CSV</button><button class="btn ghost" data-act="ad-subcopy"' + (subs.length ? "" : " disabled") + ">Copy all emails</button></div>" + (subs.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Email</th><th>Joined</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' + subs.map((s) => "<tr><td>" + esc(s.email) + "</td><td>" + M.fmtDate(s.at) + '</td><td><button class="btn small danger" data-act="ad-subdel" data-id="' + esc(s.email) + '">Remove & delete data</button></td></tr>').join("") + "</tbody></table></div>" : '<div class="empty"><span class="hand">no subscribers yet</span></div>');
    return { title: "Messages & subscribers", html: '<h1 id="h1">Messages & subscribers</h1>' + tabs + body };
  };

  // ---------- look & feel ----------
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  PAGES.look = async () => {
    const t = M.cache.theme; const pick = (id, label) => '<div class="field"><label for="' + id + '">' + label + '</label><input type="color" id="' + id + '" data-th="' + id + '" value="' + t[id] + '"></div>';
    return { title: "Look & feel", html: '<h1 id="h1">Look & feel</h1><p>Changes appear on the whole website straight away. Colours apply to light mode; dark mode keeps its own readable palette.</p>'+(document.documentElement.dataset.mode==="dark"||(document.documentElement.dataset.mode==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches)?'<div class="note-box" role="status">You’re currently viewing dark mode, so colour changes won’t show here. Use the moon button in the top bar to switch to light mode.</div>':'')+'<div class="editor-layout"><div class="panel"><h2>Colours</h2><div class="swatches">' + pick("burgundy", "Main colour (headings, buttons)") + pick("rose", "Accent") + pick("cream", "Background") + pick("ink", "Text") + '</div><p id="contrast" class="hint" role="status"></p>' +
      '<div class="grid2"><div class="field"><label for="serif">Heading font</label><select id="serif" data-th="serif"><option value="cormorant">Cormorant Garamond (falls back to Georgia)</option><option value="georgia">Georgia</option><option value="palatino">Palatino</option><option value="didot">Didot / Bodoni</option></select><div class="hint">Only fonts already on your computer are used, so nothing is downloaded.</div></div>' +
      '<div class="field"><label for="mode">Default theme</label><select id="mode" data-th="mode"><option value="auto">Match device</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="field"><label for="motion">Motion</label><select id="motion" data-th="motion"><option value="auto">Animations on (follows device setting)</option><option value="reduced">Reduced motion (minimal animation)</option></select></div></div><button class="btn ghost" data-act="ad-resettheme">Reset to brand colours</button><div class="note-box">Card style and the number of article columns now live in the <a href="#/admin/cards">Article Card Designer</a>, and the arch on the homepage in the <a href="#/admin/hero">Homepage Hero Editor</a>.</div></div>' +
      '<aside class="panel"><h2>Preview</h2><div class="preview-card"><p class="eyebrow">Beauty & Self-Care</p><h3 style="font-size:1.6rem">A title in your heading font</h3><p>Body text in your chosen text colour on the background.</p><span class="btn small">A button</span></div></aside></div>', after: (root) => {
        M.$$("[data-th]", root).forEach((el) => { if (el.tagName === "SELECT") el.value = t[el.dataset.th]; });
        const check = () => { const r = ratio(t.burgundy, t.cream), r2 = ratio(t.ink, t.cream); M.$("#contrast", root).textContent = "Heading colour contrast: " + r.toFixed(1) + ":1, text contrast: " + r2.toFixed(1) + ":1. " + (r < 4.5 || r2 < 4.5 ? "⚠ Below 4.5:1 can be hard to read — consider darker text or lighter background." : "Good — readable."); };
        const save = M.debounce(() => M.db.put("kv", { key: "theme", value: M.cache.theme }), 300);
        root.oninput = root.onchange = (e) => { const k = e.target.dataset.th; if (!k) return; if (k === "mode") localStorage.removeItem("mode"); document.documentElement.classList.add("themed-transition"); t[k] = k === "cols" ? +e.target.value : e.target.value; M.applyTheme(); check(); save(); setTimeout(() => document.documentElement.classList.remove("themed-transition"), 500); };
        check();
      } };
  };

  // ---------- site content ----------
  PAGES.content = async () => {
    const s = M.cache.settings; const fld = (id, label, val, area, hint) => '<div class="field"><label for="' + id + '">' + label + "</label>" + (area ? '<textarea id="' + id + '" data-s="' + id + '" style="min-height:130px">' + esc(val) + "</textarea>" : '<input id="' + id + '" data-s="' + id + '" value="' + esc(val) + '">') + (hint ? '<div class="hint">' + hint + "</div>" : "") + "</div>";
    return { title: "Site content", html: '<h1 id="h1">Site content</h1><div class="panel"><h2>Homepage & footer</h2>' + fld("siteName", "Website name", s.siteName) + fld("tagline", "Tagline", s.tagline) + fld("heroNote", "Handwritten hero note", s.heroNote) + fld("signoff", "Footer sign-off", s.signoff) + fld("instagram", "Instagram link (full https:// address)", s.instagram, false, "Leave empty to hide the link. Not filled in for you.") + '</div><div class="panel"><h2>About page</h2>' + fld("aboutTitle", "Heading", s.aboutTitle) + fld("aboutBody", "Your words (Markdown allowed)", s.aboutBody, true) + '</div><div class="panel"><h2>Other</h2>' + fld("contactIntro", "Contact page introduction", s.contactIntro) + '<div class="field"><label><input type="checkbox" id="commentsOn" data-s="commentsOn"' + (s.commentsOn ? " checked" : "") + '> Allow reader comments</label></div></div><button class="btn" data-act="ad-savecontent">Save site content</button>' };
  };

  // ---------- backup & reset ----------
  PAGES.backup = async () => {
    let est = ""; try { const e = await navigator.storage.estimate(); est = "Using about " + (e.usage / 1048576).toFixed(1) + " MB of roughly " + Math.round(e.quota / 1048576) + " MB available to this site."; } catch (e) {}
    const last = M.lsGet("lastBackup", "");
    return { title: "Backup & reset", html: '<h1 id="h1">Backup & reset</h1><div class="note-box">All of your articles, images, settings, comments and subscribers live <strong>only in this browser</strong>. Clearing site data, switching browser or computer, or a failed disk would remove them. Download a backup regularly and keep it somewhere safe. Backups contain subscriber emails, so treat the file as private.</div>' +
      '<div class="panel"><h2>Download a backup</h2><p>' + (last ? "Last backup: " + M.fmtTime(last) + "." : "No backup downloaded yet.") + " " + esc(est) + '</p><button class="btn" data-act="ad-export">Download backup file</button> <button class="btn ghost" data-act="ad-persist">Ask the browser to protect this data</button></div>' +
      '<div class="panel"><h2>Restore from a backup</h2><p>This <strong>replaces</strong> everything currently here with the contents of the file.</p><label for="restore-file" class="sr-only">Backup file</label><input type="file" id="restore-file" accept=".json,application/json"></div>' +
      '<div class="panel"><h2>Back up or restore only the design</h2><p>Your homepage hero (with its photo), article card design, colours and fonts in one small file. <strong>Restoring a design file changes only the look</strong> — articles, comments and subscribers are not touched. Article text, cover photos and each card’s own picture settings are saved in the full backup above.</p><div class="row"><button class="btn ghost" data-act="ad-dexport">Download design file</button><label class="btn ghost" for="design-file" style="margin:0;cursor:pointer">Restore a design file…</label><input type="file" id="design-file" accept=".json,application/json" class="sr-only"></div></div><div class="panel"><h2>Demo content</h2><p>The nine starter articles are labelled “Demo”. Remove them when you’re ready to publish your own.</p><button class="btn ghost" data-act="ad-rmdemo">Remove demo articles</button></div>' +
      '<div class="panel"><h2>Reset everything</h2><p>Erases all your content, settings, comments and subscribers on this browser and restores the starter demo content. Download a backup first.</p><button class="btn danger" data-act="ad-reset">Reset everything</button></div>',
      after: (root) => { root.onchange = async (e) => {
        if (e.target.id === "design-file") { const file = e.target.files[0]; e.target.value = ""; if (!file) return;
          if (!(await M.confirm("Replace the current design?", "The homepage hero, article card design, colours and fonts will be replaced with the ones in “" + file.name + "”. Your articles are not touched.", "Replace design"))) return;
          await busy(null, async () => { await M.importDesign(await file.text()); M.toast("Design restored"); M.render(); }); return; }
        if (e.target.id !== "restore-file") return; const file = e.target.files[0]; e.target.value = ""; if (!file) return;
        if (!(await M.confirm("Replace everything?", "This will replace all current content with “" + file.name + "”. This can’t be undone.", "Replace", true))) return;
        await busy(null, async () => { await M.importAll(await file.text()); M.toast("Backup restored"); M.render(); }); }; } };
  };

  // ---------- actions ----------
  const find = (id) => M.cache.articles.find((x) => x.id === id);
  A.act = async (act, b) => {
    if (!act.startsWith("ad-")) return; const id = b.dataset.id; const ed = A.editor;
    switch (act) {
      case "ad-toggle": { const s = M.$("#aside"), o = s.classList.toggle("open"); b.setAttribute("aria-expanded", o); break; }
      case "ad-lock": sessionStorage.removeItem("adminOK"); if (M.cloud && M.cloud.signOut) await M.cloud.signOut(); M.toast("Dashboard locked"); setTimeout(M.render, 0); break;
      case "ad-nopass": await kvSet("auth", { mode: "none" }); sessionStorage.setItem("adminOK", "1"); M.render(); break;
      case "ad-forgot": if (await M.confirm("Reset the passcode?", "Your content is kept. Only the dashboard passcode is removed so you can set a new one.", "Reset passcode")) { await M.db.del("kv", "auth"); M.lsSet(failKey, { n: 0, t: 0 }); M.render(); } break;
      case "ad-save": if (ed) await busy(b, () => ed.persist("Saved")); break;
      case "ad-publish": if (ed) await busy(b, async () => { const a = ed.collect(); a.status = "published"; a.publishedAt = new Date().toISOString(); M.$("#f-status").value = "published"; M.$("#f-date").value = toLocalInput(a.publishedAt); M.$("#dateField").style.display = ""; const s = await ed.persist(null, "Published"); M.toast("Published — it’s live on the site"); return s; }); break;
      case "ad-preview": if (ed) { const s = await busy(b, () => ed.persist(null)); if (s) location.hash = "#/a/" + s.slug + "?preview=1"; } break;
      case "ad-discard-auto": await M.db.del("kv", "autosave:" + id); M.toast("Discarded"); M.render(); break;
      case "ad-rmcover": if (ed) { const a = ed.a; if (a.coverId) { await M.db.del("images", a.coverId); M.forgetImg(a.coverId); a.coverId = ""; await ed.persist("Cover removed"); M.render(); } } break;
      case "ad-restore": { if (!ed || !(await M.confirm("Restore this version?", "The current text will be saved as a version first, so you can always come back.", "Restore"))) break; await busy(b, async () => { await M.restoreRevision(ed.a.id, id); ed.discard(); M.render(); }, "Version restored"); break; }
      case "ad-del": { const a = find(id); if (a && (await M.confirm("Delete this article?", "“" + a.title + "” and its comments and versions will be permanently deleted.", "Delete", true))) { await busy(null, () => M.deleteArticle(id), "Article deleted"); M.render(); } break; }
      case "ad-cstat": { const c = M.cache.comments.find((x) => x.id === id); c.status = b.dataset.s; await M.db.put("comments", c); await M.refresh(); M.toast("Comment " + c.status); M.render(); break; }
      case "ad-cdel": if (await M.confirm("Delete comment?", "This permanently removes it.", "Delete", true)) { await M.db.del("comments", id); await M.refresh(); M.render(); } break;
      case "ad-mread": { const m = await M.db.get("messages", id); m.read = !m.read; await M.db.put("messages", m); M.render(); break; }
      case "ad-mdel": if (await M.confirm("Delete message?", "This permanently removes it.", "Delete", true)) { await M.db.del("messages", id); M.render(); } break;
      case "ad-subdel": if (await M.confirm("Remove subscriber?", id + " will be removed and their data deleted from this list.", "Remove", true)) { await M.db.del("subscribers", id); M.toast("Subscriber removed"); M.render(); } break;
      case "ad-subcsv": { const subs = await M.db.all("subscribers"); M.download("subscribers.csv", M.csv([["email", "joined", "status"], ...subs.map((s) => [s.email, s.at, s.status])]), "text/csv"); M.toast("Subscribers downloaded — keep this file private"); break; }
      case "ad-subcopy": { const subs = await M.db.all("subscribers"); try { await navigator.clipboard.writeText(subs.map((s) => s.email).join(", ")); M.toast("Emails copied"); } catch (e) { M.toast("Couldn’t copy automatically — use Download CSV", "err"); } break; }
      case "ad-savecontent": await busy(b, async () => {
        const o = {}; M.$$("[data-s]").forEach((el) => (o[el.dataset.s] = el.type === "checkbox" ? el.checked : el.value.trim()));
        if (!o.siteName) throw new M.UserError("The website name can’t be empty.");
        if (o.instagram && !/^https?:\/\/\S+$/i.test(o.instagram)) throw new M.UserError("The Instagram link must start with https://");
        await M.saveSettings(o); M.renderHeader("admin"); M.renderFooter();
      }, "Site content saved"); break;
      case "ad-resettheme": await M.saveTheme(M.DEFAULT_THEME); M.toast("Brand colours restored"); M.render(); break;
      case "ad-export": await busy(b, async () => { const txt = await M.exportAll(); M.download("blogs-by-mifrah-backup-" + new Date().toISOString().slice(0, 10) + ".json", txt, "application/json"); M.lsSet("lastBackup", new Date().toISOString()); }, "Backup downloaded — keep it somewhere safe"); break;
      case "ad-dexport": await busy(b, async () => { M.download("blogs-by-mifrah-design-" + new Date().toISOString().slice(0, 10) + ".json", await M.exportDesign(), "application/json"); }, "Design file downloaded — keep it somewhere safe"); break;
      case "ad-persist": { try { const ok = await navigator.storage.persist(); M.toast(ok ? "The browser will try to keep this data" : "The browser didn’t grant extra protection — keep backups"); } catch (e) { M.toast("Not supported in this browser", "err"); } break; }
      case "ad-rmdemo": if (await M.confirm("Remove demo articles?", "The nine starter articles will be deleted. Your own articles are not touched.", "Remove", true)) { await busy(null, async () => { for (const a of M.cache.articles.filter((x) => x.demo)) await M.deleteArticle(a.id); }, "Demo articles removed"); M.render(); } break;
      case "ad-reset": if (await M.confirm("Reset everything?", "All content, settings, comments and subscribers on this browser will be erased. Starter demo content comes back.", "Erase everything", true)) { await busy(null, () => M.resetAll(), "Reset complete"); location.hash = "#/"; M.render(); } break;
    }
  };
})();
