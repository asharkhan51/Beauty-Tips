/* Dashboard pages: "Homepage Hero Editor" and "Article Card Designer".
   Both edit a DRAFT, show it live, and only store it when you press "Save changes".
   Settings are kept in this browser (IndexedDB, via js/design.js); pictures go in the same
   IndexedDB "images" store the article covers use (never in localStorage). */
(function () {
  const M = window.M, A = M.admin, esc = M.esc, PAGES = A.PAGES, busy = A.busy;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // ---------- generic form pieces, built from M.HERO_SCHEMA / M.CARD_SCHEMA ----------
  const fieldHtml = (f, val, pre) => {
    const id = pre + "-" + f.k, lab = esc(f.label || f.k);
    if (f.type === "color") {
      const shown = val || M.resolveColor(f.css);
      return '<div class="field"><label for="' + id + '">' + lab + '</label><div class="row"><input type="color" id="' + id + '" data-k="' + f.k + '" value="' + shown + '"><button type="button" class="btn small ghost" data-d="cdef" data-k="' + f.k + '"' + (val ? "" : " disabled") + '>Use theme default</button><span class="hint" id="' + id + '-n">' + (val ? "Custom colour" : "Following the theme") + "</span></div></div>";
    }
    if (f.type === "range") return '<div class="field"><label for="' + id + '">' + lab + ' <output class="rv" id="' + id + '-o">' + val + esc(f.unit || "") + '</output></label><input type="range" id="' + id + '" data-k="' + f.k + '" min="' + f.min + '" max="' + f.max + '" step="' + (f.step || 1) + '" value="' + val + '"></div>';
    if (f.type === "select") return '<div class="field"><label for="' + id + '">' + lab + '</label><select id="' + id + '" data-k="' + f.k + '">' + f.options.map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === val ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select></div>";
    if (f.type === "check") return '<div class="field"><label class="chk" for="' + id + '"><input type="checkbox" id="' + id + '" data-k="' + f.k + '"' + (val ? " checked" : "") + "> " + lab + "</label></div>";
    return '<div class="field"><label for="' + id + '">' + lab + '</label><input id="' + id + '" data-k="' + f.k + '" maxlength="' + (f.max || 200) + '" value="' + esc(val) + '">' + (f.hint ? '<div class="hint">' + esc(f.hint) + "</div>" : "") + "</div>";
  };
  const groupsHtml = (schema, draft, pre) => {
    let out = "", open = false;
    for (const f of schema) { if (f.g) { if (open) out += "</div>"; out += '<div class="panel"><h2>' + esc(f.g) + "</h2>"; open = true; } out += fieldHtml(f, draft[f.k], pre); }
    return out + (open ? "</div>" : "");
  };
  // copy an edited control's value into the draft; returns the field description (or null)
  const readEl = (schema, draft, el, root) => {
    const f = schema.find((x) => x.k === el.dataset.k); if (!f) return null;
    const v = f.type === "range" ? Number(el.value) : f.type === "check" ? el.checked : el.value;
    draft[f.k] = v;
    if (f.type === "range") { const o = M.$("#" + el.id + "-o", root); if (o) o.textContent = v + (f.unit || ""); }
    if (f.type === "color") { const n = M.$("#" + el.id + "-n", root), b = M.$('[data-d="cdef"][data-k="' + f.k + '"]', root); if (n) n.textContent = "Custom colour"; if (b) b.disabled = false; }
    return f;
  };
  const useDefaultColour = (schema, draft, k, root, pre) => {
    const f = schema.find((x) => x.k === k); if (!f) return; draft[k] = null;
    const el = M.$("#" + pre + "-" + k, root), n = M.$("#" + pre + "-" + k + "-n", root), b = M.$('[data-d="cdef"][data-k="' + k + '"]', root);
    if (el) el.value = M.resolveColor(f.css); if (n) n.textContent = "Following the theme"; if (b) b.disabled = true;
  };

  // ---------- picture library (pictures already stored in this browser) ----------
  const pickImage = async () => {
    const imgs = (await M.db.all("images")).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return new Promise((res) => {
      const d = document.createElement("dialog"); d.className = "lib"; d.setAttribute("aria-labelledby", "libT"); let picked = null;
      d.innerHTML = '<div class="dlg-body"><h2 id="libT" style="font-size:1.6rem">Choose from your pictures</h2>' + (imgs.length ? '<p class="hint">Pictures already saved in this browser: article covers and earlier uploads.</p><div class="lib-grid">' + imgs.map((im) => '<button type="button" class="lib-item" data-id="' + esc(im.id) + '" aria-label="Use picture ' + esc(im.name) + '"><img alt="" data-lib="' + esc(im.id) + '"><span>' + esc(im.name) + "</span></button>").join("") + "</div>" : "<p>There are no pictures yet. Upload one from your computer first.</p>") + '</div><div class="dlg-actions"><button type="button" class="btn ghost" value="no">Cancel</button></div>';
      document.body.appendChild(d);
      d.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; if (b.classList.contains("lib-item")) { picked = b.dataset.id; d.close("yes"); } else d.close("no"); });
      d.addEventListener("close", () => { d.remove(); res(picked); });
      d.showModal();
      M.$$("img[data-lib]", d).forEach(async (img) => { const u = await M.imgUrl(img.dataset.lib); if (u) img.src = u; });
    });
  };
  // pictures uploaded while editing but never saved are removed again (so nothing piles up)
  const sweep = async (uploads, keep) => { for (const id of [...uploads]) { if (!keep.has(id)) { try { await M.db.del("images", id); M.forgetImg(id); } catch (e) { /* ignore */ } } uploads.delete(id); } };

  const barHtml = '<div class="actionbar" role="group" aria-label="Save, cancel or reset"><button class="btn" data-d="save">Save changes</button><button class="btn ghost" data-d="cancel">Cancel</button><button class="btn ghost" data-d="reset">Reset to default</button><span class="save-state" id="dstate" role="status" aria-live="polite"></span></div>';
  const noteHtml = '<div class="note-box"><strong>Where this is saved:</strong> in this browser on this computer only. It won’t appear in another browser or on another computer until you restore it there from <a href="#/admin/backup">Backup &amp; reset</a> (“Download design file”). Colours you choose apply in light and dark mode; “Use theme default” makes a colour follow the theme again. The dashboard passcode is a privacy screen, not strong security.</div>';

  // ================= HOMEPAGE HERO EDITOR =================
  PAGES.hero = async () => {
    const saved = M.cache.hero; let draft = { ...clone(saved), heroNote: M.cache.settings.heroNote };
    const controls = () => '<div class="panel"><h2>Hero photo</h2><div class="cover-pick hero-pick" id="hpick"></div><div class="field"><label for="hero-file">Upload a photo from my computer</label><input type="file" id="hero-file" accept="image/jpeg,image/png,image/webp,image/gif"></div><div class="row"><button class="btn small ghost" data-d="hlib">Choose from my saved pictures</button><button class="btn small ghost" data-d="hrm" id="hrm">Remove photo</button></div><p class="hint">JPG, PNG, WebP or GIF up to 12 MB. Big photos are shrunk to 1600 pixels so the site stays fast. A removed or replaced photo stays in your saved pictures, so you can bring it back.</p></div>' + groupsHtml(M.HERO_SCHEMA, draft, "hero");
    const html = '<div class="row between"><h1 id="h1">Homepage Hero Editor</h1></div><p>Edit the big arch at the top of your homepage. The preview shows exactly what visitors will see — nothing changes on the website until you press <strong>Save changes</strong>.</p>' + noteHtml +
      '<div class="design-layout"><div id="controls">' + controls() + '</div><aside class="design-aside"><div class="panel"><h2>Live preview</h2><div class="hero-preview" id="heroWrap" inert><div class="hero-stage" id="heroStage"></div></div></div></aside></div>' + barHtml;
    const after = (root) => {
      const $ = (s) => M.$(s, root); const uploads = new Set(); let dirty = false;
      const STRUCT = new Set(["heading", "subtitle", "btn1", "btn2", "heroNote", "showOuter", "showCircle", "showLine", "noImage"]);
      const setDirty = (v) => { dirty = v; $("#dstate").textContent = v ? "● Unsaved changes — press Save changes" : $("#dstate").dataset.msg || ""; window.onbeforeunload = v ? () => "You have unsaved changes." : null; };
      const fit = () => { const w = $("#heroWrap").clientWidth || 600, k = Math.min(1, w / 1000), st = $("#heroStage"); st.style.transform = "scale(" + k + ")"; $("#heroWrap").style.height = Math.ceil(st.offsetHeight * k) + "px"; };
      const markup = () => M.heroHtml(M.normHero(draft), { preview: true, note: draft.heroNote });
      const paint = (structural) => {
        const st = $("#heroStage");
        if (structural || !st.firstElementChild) { st.innerHTML = markup(); M.hydrateCovers(st); }
        else { const t = document.createElement("div"); t.innerHTML = markup(); const ns = t.firstElementChild, cs = st.firstElementChild; ["style", "data-align", "data-valign", "data-side"].forEach((a) => cs.setAttribute(a, ns.getAttribute(a))); }
        fit();
      };
      const paintPick = async () => {
        const el = $("#hpick");
        if (draft.imageId) { el.innerHTML = '<img data-cover="' + esc(draft.imageId) + '" alt="Your chosen hero photo">'; await M.hydrateCovers(el); }
        else el.innerHTML = '<p class="hint" style="padding:1rem;margin:0">No photo chosen. The arch shows ' + (draft.noImage === "placeholder" ? "the soft placeholder picture" : "the original solid colour") + ".</p>";
        $("#hrm").disabled = !draft.imageId;
      };
      const setImage = (id) => { draft.imageId = id; paintPick(); paint(true); setDirty(true); };
      const ro = window.ResizeObserver ? new ResizeObserver(fit) : null; if (ro) ro.observe($("#heroWrap"));
      paintPick(); paint(true);

      root.oninput = (e) => {
        const f = readEl(M.HERO_SCHEMA, draft, e.target, root); if (!f) return;
        if (f.k === "noImage") paintPick();
        paint(STRUCT.has(f.k)); setDirty(true);
      };
      root.onchange = async (e) => {
        if (e.target.id !== "hero-file") return;
        const file = e.target.files[0]; e.target.value = ""; if (!file) return;
        await busy(null, async () => { const id = await M.addImage(file); uploads.add(id); setImage(id); M.toast("Photo added to the preview — press Save changes to keep it"); });
      };
      root.onclick = async (e) => {
        const b = e.target.closest("[data-d]"); if (!b) return; const act = b.dataset.d;
        if (act === "cdef") { useDefaultColour(M.HERO_SCHEMA, draft, b.dataset.k, root, "hero"); paint(false); setDirty(true); }
        else if (act === "hlib") { const id = await pickImage(); if (id) setImage(id); }
        else if (act === "hrm") setImage("");
        else if (act === "cancel") { if (!dirty || (await M.confirm("Discard your changes?", "Everything you changed since the last save will be thrown away.", "Discard changes"))) { await sweep(uploads, new Set([saved.imageId])); setDirty(false); M.toast("Changes cancelled"); M.render(); } }
        else if (act === "reset") {
          if (!(await M.confirm("Reset to the original design?", "The arch, colours, words and spacing go back to how the site first looked, and the photo is removed. Nothing is saved until you press Save changes.", "Reset"))) return;
          draft = { ...M.defaultHero(), heroNote: M.DEFAULT_SETTINGS.heroNote }; $("#controls").innerHTML = controls(); paintPick(); paint(true); setDirty(true); M.toast("Original design loaded in the preview — press Save changes to keep it");
        }
        else if (act === "save") await busy(b, async () => {
          const { heroNote, ...rest } = draft;
          await M.saveHero(rest); await M.saveSettings({ heroNote: heroNote.trim() });
          await sweep(uploads, new Set([M.cache.hero.imageId]));
          const msg = "Saved at " + clock() + " — your homepage now shows this."; $("#dstate").dataset.msg = msg; $("#dstate").className = "save-state saved"; setDirty(false);
        }, "Homepage hero saved. Open the website, or refresh it, to see it.");
      };
      M.cleanup = () => { window.onbeforeunload = null; if (ro) ro.disconnect(); if (dirty) M.toast("Unsaved hero changes were discarded"); sweep(uploads, new Set([M.cache.hero.imageId])); root.oninput = root.onchange = root.onclick = null; };
    };
    return { title: "Homepage Hero Editor", html, after };
  };

  // ================= ARTICLE CARD DESIGNER =================
  const statusOf = (a) => (a.status === "draft" ? "draft" : M.isLive(a) ? "published" : "scheduled");
  PAGES.cards = async () => {
    const saved = M.cache.card; let draft = clone(saved);
    const SAMPLE = { id: "sample", slug: "sample", title: "A sample article title", excerpt: "A short summary appears here, so you can judge the spacing and text size.", category: M.CATS[0].slug, content: "word ".repeat(700), publishedAt: new Date().toISOString(), coverId: "", coverAlt: "", tags: [], demo: false };
    const controls = () => groupsHtml(M.CARD_SCHEMA, draft, "card");
    const rowForm = (d, a) => '<div class="cr-prev" inert></div><div class="cr-form">' +
      '<div class="field"><label for="t-' + a.id + '">Title</label><input id="t-' + a.id + '" data-cf="title" maxlength="200" value="' + esc(d.title) + '"></div>' +
      '<div class="field"><label for="x-' + a.id + '">Summary</label><textarea id="x-' + a.id + '" data-cf="excerpt" maxlength="300" style="min-height:80px">' + esc(d.excerpt) + "</textarea></div>" +
      '<div class="grid2"><div class="field"><label for="c-' + a.id + '">Category</label><select id="c-' + a.id + '" data-cf="category">' + M.CATS.map((c) => '<option value="' + c.slug + '"' + (c.slug === d.category ? " selected" : "") + ">" + esc(c.name) + "</option>").join("") + '</select></div>' +
      '<div class="field"><label for="m-' + a.id + '">Reading time (minutes)</label><input id="m-' + a.id + '" data-cf="readMins" type="number" min="0" max="240" value="' + (d.readMins || "") + '" placeholder="Automatic: ' + M.readingMinutes(a.content) + '"><div class="hint">Leave empty to count the words automatically.</div></div></div>' +
      '<div class="field"><label for="f-' + a.id + '">Cover picture</label><input type="file" id="f-' + a.id + '" data-cfile="' + a.id + '" accept="image/jpeg,image/png,image/webp,image/gif"></div><div class="row" style="margin-bottom:1rem"><button class="btn small ghost" data-d="rlib" data-id="' + a.id + '">Choose from my saved pictures</button><button class="btn small ghost" data-d="rrm" data-id="' + a.id + '"' + (d.coverId ? "" : " disabled") + '>Remove cover (use placeholder)</button></div>' +
      '<div class="field"><label for="a-' + a.id + '">Describe the picture (alt text)</label><input id="a-' + a.id + '" data-cf="coverAlt" maxlength="200" value="' + esc(d.coverAlt) + '"></div>' +
      '<div class="grid2"><div class="field"><label for="ft-' + a.id + '">Picture fitting</label><select id="ft-' + a.id + '" data-cf="coverFit"><option value=""' + (!d.coverFit ? " selected" : "") + '>Use the card default</option><option value="cover"' + (d.coverFit === "cover" ? " selected" : "") + '>Fill (cover — may crop)</option><option value="contain"' + (d.coverFit === "contain" ? " selected" : "") + '>Show whole picture (contain)</option></select></div><div></div></div>' +
      '<div class="grid2"><div class="field"><label for="px-' + a.id + '">Picture position: left ↔ right <output class="rv">' + d.coverX + '%</output></label><input type="range" id="px-' + a.id + '" data-cf="coverX" min="0" max="100" value="' + d.coverX + '"></div><div class="field"><label for="py-' + a.id + '">Picture position: top ↔ bottom <output class="rv">' + d.coverY + '%</output></label><input type="range" id="py-' + a.id + '" data-cf="coverY" min="0" max="100" value="' + d.coverY + '"></div></div>' +
      '<div class="row"><button class="btn small" data-d="rsave" data-id="' + a.id + '">Save this card</button><button class="btn small ghost" data-d="rundo" data-id="' + a.id + '">Undo changes</button><span class="save-state" role="status" data-st="' + a.id + '"></span></div>' +
      '<p class="hint">The link to the article never changes when you edit its card.</p></div>';
    const fromArticle = (a) => ({ title: a.title, excerpt: a.excerpt || "", category: a.category, readMins: a.readMins || 0, coverId: a.coverId || "", coverAlt: a.coverAlt || "", coverFit: a.coverFit || "", coverX: Number.isFinite(+a.coverX) ? +a.coverX : 50, coverY: Number.isFinite(+a.coverY) ? +a.coverY : 50 });
    const rows = M.cache.articles.map((a) => '<details class="panel cardrow" data-aid="' + a.id + '"><summary><strong>' + esc(a.title || "Untitled") + '</strong> <span class="pill ' + statusOf(a) + '">' + statusOf(a) + '</span>' + (a.demo ? ' <span class="demo-badge">Demo</span>' : "") + '</summary><div class="cr-body">' + rowForm(fromArticle(a), a) + "</div></details>").join("");
    const html = '<div class="row between"><h1 id="h1">Article Card Designer</h1></div><p>Design the card used for <strong>every</strong> article list: the homepage, Beauty &amp; Self-Care, Lifestyle, Personal Growth, search results, Saved articles and “Keep reading”. Nothing changes for visitors until you press <strong>Save changes</strong>.</p>' + noteHtml +
      '<div class="design-layout wide"><div id="controls">' + controls() + '</div><aside class="design-aside"><div class="panel"><h2>Live preview</h2><div class="row" role="group" aria-label="Preview size" style="margin-bottom:.8rem"><button class="chip" data-d="dev" data-v="D" aria-pressed="true">Desktop</button><button class="chip" data-d="dev" data-v="T" aria-pressed="false">Tablet</button><button class="chip" data-d="dev" data-v="M" aria-pressed="false">Mobile</button></div><div class="card-wrap" id="cwrap" inert><div class="card-stage" id="cprev"><div class="feed" id="cfeed"></div></div></div><p class="hint">Real articles from your site. Clicking is switched off in the preview.</p></div></aside></div>' + barHtml +
      '<h2 style="margin-top:2rem">Edit individual cards</h2><p>Open an article to change its card picture, position, title, summary, category or reading time. Each card has its own Save button.</p>' + (rows || '<p class="hint">No articles yet.</p>');
    const after = (root) => {
      const $ = (s) => M.$(s, root); let dirty = false, dev = "D"; const uploads = new Set(); const rd = {};
      const keepIds = (withDrafts) => { const k = new Set(M.cache.articles.map((a) => a.coverId).filter(Boolean)); if (M.cache.hero.imageId) k.add(M.cache.hero.imageId); if (withDrafts) Object.values(rd).forEach((d) => d.coverId && k.add(d.coverId)); return k; };
      const setDirty = (v) => { dirty = v; $("#dstate").textContent = v ? "● Unsaved changes — press Save changes" : $("#dstate").dataset.msg || ""; window.onbeforeunload = v ? () => "You have unsaved changes." : null; };
      const live = (el) => { el.querySelectorAll(".reveal,.img-reveal").forEach((x) => x.classList.add("in")); M.hydrateCovers(el); };
      // the preview is drawn at the real desktop/tablet/mobile width and shrunk to fit the panel
      const fitC = () => { const st = $("#cprev"), w = $("#cwrap").clientWidth || 400, k = Math.min(1, w / (parseFloat(st.style.width) || 1000)); st.style.transform = "scale(" + k + ")"; $("#cwrap").style.height = Math.ceil(st.offsetHeight * k) + "px"; };
      const ro = window.ResizeObserver ? new ResizeObserver(fitC) : null; if (ro) { ro.observe($("#cwrap")); ro.observe($("#cprev")); }
      const paint = () => {
        const cols = { D: draft.colsD, T: draft.colsT, M: draft.colsM }[dev];
        const feed = $("#cfeed"); feed.style.gridTemplateColumns = "repeat(" + cols + ", minmax(0, 1fr))";
        $("#cprev").style.width = { D: 1000, T: 700, M: 360 }[dev] + "px";
        let list = M.liveArticles().slice(0, Math.max(cols, 2)); if (!list.length) list = M.cache.articles.slice(0, Math.max(cols, 2)); if (!list.length) list = [SAMPLE];
        feed.innerHTML = list.map((a, i) => M.cardHtml(a, false, i)).join(""); live(feed);
        M.applyCardDesign(draft); fitC();
      };
      const rowDraft = (id) => { if (!rd[id]) { const a = M.cache.articles.find((x) => x.id === id); rd[id] = fromArticle(a); } return rd[id]; };
      const rowPrev = (id) => {
        const el = M.$('.cardrow[data-aid="' + id + '"] .cr-prev', root); if (!el) return;
        const a = { ...M.cache.articles.find((x) => x.id === id), ...rowDraft(id) }; el.innerHTML = M.cardHtml(a, false, 0); live(el);
      };
      const rowFill = (id) => { const row = M.$('.cardrow[data-aid="' + id + '"]', root), a = M.cache.articles.find((x) => x.id === id); delete rd[id]; M.$(".cr-body", row).innerHTML = rowForm(rowDraft(id), a); rowPrev(id); };
      const rowMsg = (id, t) => { const s = M.$('[data-st="' + id + '"]', root); if (s) s.textContent = t; };
      paint();
      M.$$(".cardrow", root).forEach((r) => rowPrev(r.dataset.aid));

      root.oninput = (e) => {
        const t = e.target;
        if (t.dataset.cf) {
          const id = t.closest(".cardrow").dataset.aid, d = rowDraft(id), k = t.dataset.cf;
          d[k] = k === "coverX" || k === "coverY" ? Number(t.value) : k === "readMins" ? Math.max(0, Math.min(240, Math.round(Number(t.value) || 0))) : t.value;
          if (t.type === "range" && t.previousElementSibling) { const o = t.parentElement.querySelector("output"); if (o) o.textContent = t.value + "%"; }
          rowPrev(id); rowMsg(id, "● Unsaved — press Save this card"); return;
        }
        const f = readEl(M.CARD_SCHEMA, draft, t, root); if (!f) return;
        paint(); setDirty(true);
      };
      root.onchange = async (e) => {
        const t = e.target; if (!t.dataset.cfile) return;
        const id = t.dataset.cfile, file = t.files[0]; t.value = ""; if (!file) return;
        await busy(null, async () => { const img = await M.addImage(file); uploads.add(img); rowDraft(id).coverId = img; M.$('[data-d="rrm"][data-id="' + id + '"]', root).disabled = false; rowPrev(id); rowMsg(id, "● Unsaved — press Save this card"); M.toast("Picture added to the preview — press Save this card to keep it"); });
      };
      root.onclick = async (e) => {
        const b = e.target.closest("[data-d]"); if (!b) return; const act = b.dataset.d, id = b.dataset.id;
        if (act === "cdef") { useDefaultColour(M.CARD_SCHEMA, draft, b.dataset.k, root, "card"); paint(); setDirty(true); }
        else if (act === "dev") { dev = b.dataset.v; M.$$('[data-d="dev"]', root).forEach((x) => x.setAttribute("aria-pressed", x === b)); paint(); }
        else if (act === "cancel") { if (!dirty || (await M.confirm("Discard your changes?", "Everything you changed in the card design since the last save will be thrown away.", "Discard changes"))) { setDirty(false); M.toast("Changes cancelled"); M.render(); } }
        else if (act === "reset") {
          if (!(await M.confirm("Reset to the Modern Magazine design?", "Colours, shape, spacing, text, hover and layout go back to the original card design. Nothing is saved until you press Save changes.", "Reset"))) return;
          draft = M.defaultCard(); $("#controls").innerHTML = controls(); paint(); setDirty(true); M.toast("Original card design loaded in the preview — press Save changes to keep it");
        }
        else if (act === "save") await busy(b, async () => {
          await M.saveCard(draft);
          const msg = "Saved at " + clock() + " — all article lists now use this design."; $("#dstate").dataset.msg = msg; $("#dstate").className = "save-state saved"; setDirty(false);
        }, "Card design saved. It now applies everywhere on the website.");
        else if (act === "rlib") { const pid = await pickImage(); if (pid) { rowDraft(id).coverId = pid; M.$('[data-d="rrm"][data-id="' + id + '"]', root).disabled = false; rowPrev(id); rowMsg(id, "● Unsaved — press Save this card"); } }
        else if (act === "rrm") { rowDraft(id).coverId = ""; b.disabled = true; rowPrev(id); rowMsg(id, "● Unsaved — press Save this card"); }
        else if (act === "rundo") { rowFill(id); rowMsg(id, "Changes undone"); await sweep(uploads, keepIds(true)); }
        else if (act === "rsave") await busy(b, async () => {
          const cur = M.cache.articles.find((x) => x.id === id), d = rowDraft(id);
          if (!cur) throw new M.UserError("That article no longer exists.");
          if (!d.title.trim()) throw new M.UserError("The title can’t be empty.");
          const auto = await A.kvGet("autosave:" + id);
          if (auto && auto.at > cur.updatedAt) throw new M.UserError("This article has unsaved text in the article editor. Open it under Articles, press Save (or discard it), then come back.");
          const a = clone(cur); Object.assign(a, { title: d.title.trim(), excerpt: d.excerpt, category: d.category, readMins: d.readMins, coverId: d.coverId, coverAlt: d.coverAlt, coverFit: d.coverFit, coverX: d.coverX, coverY: d.coverY });
          await M.saveArticle(a, "Card edited"); // the web address (slug) is kept as it is
          const sm = M.$('.cardrow[data-aid="' + id + '"] summary strong', root); if (sm) sm.textContent = a.title;
          rowMsg(id, "Saved at " + clock() + " — this card is updated everywhere."); delete rd[id]; rowDraft(id); await sweep(uploads, keepIds(true)); paint();
        }, "Card saved. The article link is unchanged.");
      };
      M.cleanup = () => { window.onbeforeunload = null; if (ro) ro.disconnect(); M.applyCardDesign(M.cache.card); if (dirty) M.toast("Unsaved card design changes were discarded"); sweep(uploads, keepIds(false)); root.oninput = root.onchange = root.onclick = null; };
    };
    return { title: "Article Card Designer", html, after };
  };
})();
