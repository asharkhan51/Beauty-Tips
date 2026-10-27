/* Public site views. Each view returns { html, after(root) }. */
(function () {
  const M = window.M, esc = M.esc;
  const ICON = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  };
  M.ICON = ICON;
  const NAV = [["beauty", "Beauty & Self-Care", "#/beauty"], ["lifestyle", "Lifestyle", "#/lifestyle"], ["growth", "Personal Growth", "#/growth"], ["about", "About Hadiqa", "#/about"]];

  // ---------- chrome ----------
  M.wordmark = () => {
    const parts = M.cache.settings.siteName.trim().split(/\s+/); const last = parts.pop();
    return '<a class="wordmark" href="#/" aria-label="' + esc(M.cache.settings.siteName) + ' — home"><span class="w1" aria-hidden="true">' + esc(parts.join(" ")) + " <em>" + esc(last) + '</em></span><span class="w2" aria-hidden="true">a guidance to growth</span></a>';
  };
  M.renderHeader = (route) => {
    const nav = NAV.map((n) => '<a class="ulink" href="' + n[2] + '"' + (route === n[0] ? ' aria-current="page"' : "") + ">" + n[1] + "</a>").join("");
    M.$("#header").innerHTML = '<div class="wrap bar">' + M.wordmark() +
      '<nav class="nav" id="nav" aria-label="Main">' + nav + "</nav>" +
      '<div class="header-tools"><button class="icon-btn" data-act="search" aria-label="Search articles" aria-expanded="false" aria-controls="searchPanel">' + ICON.search + "</button>" +
      '<a class="icon-btn" href="#/favorites" aria-label="Saved articles"' + (route === "favorites" ? ' aria-current="page"' : "") + ">" + ICON.heart + "</a>" +
      '<button class="icon-btn" data-act="mode" aria-label="Switch light or dark mode">' + ICON.moon + "</button>" +
      '<button class="icon-btn menu-toggle" data-act="menu" aria-label="Open menu" aria-expanded="false" aria-controls="nav">' + ICON.menu + "</button></div></div>" +
      '<div class="search-panel" id="searchPanel"><div class="wrap"><form role="search" data-form="search"><label class="sr-only" for="hq">Search articles</label><div class="row"><input id="hq" type="search" placeholder="Search titles, articles, topics…" autocomplete="off" style="flex:1"><button class="btn" type="submit">Search</button></div></form></div></div>';
  };
  M.renderFooter = () => {
    const s = M.cache.settings;
    const ig = /^https?:\/\//i.test(s.instagram) ? '<li><a class="ulink" href="' + esc(s.instagram) + '" rel="noopener noreferrer" target="_blank">Instagram</a></li>' : "";
    M.$("#footer").innerHTML = '<div class="wrap"><div class="foot-grid"><div>' + M.wordmark() + '<p style="margin-top:.8rem;font-family:var(--font-serif);font-size:1.25rem">' + esc(s.tagline) + '</p><span class="hand signoff">' + esc(s.signoff) + "</span></div>" +
      '<nav aria-label="Footer"><h2 class="eyebrow" style="font-family:var(--font-sans)">Explore</h2><ul>' + NAV.map((n) => '<li><a class="ulink" href="' + n[2] + '">' + n[1] + "</a></li>").join("") + '<li><a class="ulink" href="#/favorites">Saved articles</a></li><li><a class="ulink" href="#/contact">Contact</a></li><li><a class="ulink" href="#/newsletter">Newsletter</a></li>' + ig + '<li><a class="ulink" href="#/privacy">Privacy</a></li></ul></nav>' +
      '<div><h2 class="eyebrow" style="font-family:var(--font-sans)">Newsletter</h2><p class="hint" style="margin-top:0">A weekly note, now and then a monthly roundup.</p>' + nlForm("foot") + "</div></div>" +
      '<div class="copy"><span>© ' + new Date().getFullYear() + " " + esc(s.siteName) + '</span><a class="ulink" href="#/admin">Admin</a></div></div>';
  };
  function nlForm(id) {
    return '<form class="nl-form" data-form="newsletter" novalidate><div style="flex:1 1 220px"><label class="sr-only" for="nl-' + id + '">Email address</label><input id="nl-' + id + '" name="email" type="email" placeholder="you@example.com" autocomplete="email" required aria-describedby="nl-' + id + '-m"></div><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="btn" type="submit">Subscribe</button><div id="nl-' + id + '-m" class="hint" role="status" style="flex-basis:100%"></div></form>';
  }
  M.nlForm = nlForm;

  // ---------- cards & feed ----------
  const catName = (slug) => M.cat(slug).short;
  const pct = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50; };
  M.coverStyle = (a) => (a.coverFit === "cover" || a.coverFit === "contain" ? "object-fit:" + a.coverFit + ";" : "") + "object-position:" + pct(a.coverX) + "% " + pct(a.coverY) + "%";
  M.cardHtml = (a, lead, i) => {
    const cover = a.coverId ? '<img data-cover="' + a.coverId + '" alt="' + esc(a.coverAlt) + '" style="' + M.coverStyle(a) + '" loading="lazy" decoding="async">' : M.placeholder(a.id);
    const saved = M.isFav(a.id);
    return '<article class="card reveal' + (lead ? " lead" : "") + '" style="--i:' + (i || 0) + '"><div class="cover-col"><div class="cover img-reveal">' + cover + "</div></div><div class=\"body\">" +
      '<div class="meta"><span class="cat">' + esc(catName(a.category)) + '</span><span class="m-date">' + M.fmtDate(a.publishedAt) + '</span><span class="m-read">' + M.cardMins(a) + ' min read</span>' + (a.demo ? '<span class="demo-badge">Demo</span>' : "") + "</div>" +
      '<h3><a href="#/a/' + esc(a.slug) + '">' + esc(a.title) + "</a></h3>" + (a.excerpt ? '<p class="excerpt">' + esc(a.excerpt) + "</p>" : "") +
      '<span class="more" aria-hidden="true">Read article <span>→</span></span></div>' +
      '<button class="icon-btn save-btn" data-act="fav" data-id="' + a.id + '" aria-pressed="' + saved + '" aria-label="' + (saved ? "Remove from" : "Save to") + " reading list: " + esc(a.title) + '">' + ICON.heart + "</button></article>";
  };
  M.hydrateCovers = async (root) => { for (const img of M.$$("img[data-cover]", root)) { const u = await M.imgUrl(img.dataset.cover); if (u) img.src = u; } };

  M.filterArticles = (f) => {
    let list = M.liveArticles();
    const q = (f.q || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (q.length) list = list.filter((a) => { const hay = (a.title + " " + a.subtitle + " " + a.excerpt + " " + a.content + " " + M.cat(a.category).name + " " + a.tags.join(" ")).toLowerCase(); return q.every((t) => hay.includes(t)); });
    if (f.cat) list = list.filter((a) => a.category === f.cat);
    if (f.beauty) list = list.filter((a) => a.category === "beauty-self-care" || a.tags.some((t) => /skin|beauty/.test(t)));
    if (f.saved) { const fv = M.favs(); list = list.filter((a) => fv.includes(a.id)); }
    if (f.time) list = list.filter((a) => { const m = M.cardMins(a); return f.time === "short" ? m <= 3 : f.time === "mid" ? m >= 4 && m <= 7 : m >= 8; });
    if (f.sort === "popular") list = [...list].sort((a, b) => M.popularity(b) - M.popularity(a) || b.publishedAt.localeCompare(a.publishedAt));
    else list = [...list].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return list;
  };

  function feedSection(init, opts) {
    const f = Object.assign({ q: "", cat: "", sort: "new", time: "", beauty: false, saved: false }, init);
    opts = opts || {};
    const html = '<section class="section" id="latest" aria-labelledby="latestH"><div class="wrap"><div class="section-head reveal"><h2 id="latestH">' + (opts.title || "Latest articles") + '</h2><span class="hint" id="feedCount" role="status" aria-live="polite"></span></div>' +
      '<div class="filters" role="group" aria-label="Filter articles">' +
      '<div class="field"><label for="fq">Search</label><input id="fq" type="search" value="' + esc(f.q) + '" placeholder="Search…" autocomplete="off"></div>' +
      (opts.noCat ? "" : '<div class="field"><label for="fc">Category</label><select id="fc"><option value="">All categories</option>' + M.CATS.map((c) => '<option value="' + c.slug + '"' + (f.cat === c.slug ? " selected" : "") + ">" + esc(c.short) + "</option>").join("") + "</select></div>") +
      '<div class="field"><label for="fs">Order</label><select id="fs"><option value="new">Newest first</option><option value="popular">Most popular</option></select></div>' +
      '<div class="field"><label for="ft">Reading time</label><select id="ft"><option value="">Any length</option><option value="short">Up to 3 min</option><option value="mid">4–7 min</option><option value="long">8+ min</option></select></div>' +
      '<button class="chip" data-chip="beauty" aria-pressed="false">Beauty &amp; skincare</button><button class="chip" data-chip="saved" aria-pressed="false">Saved</button><button class="chip" data-chip="reset" style="border-style:dashed">Reset</button></div>' +
      '<p class="hint" style="margin:-.8rem 0 1.4rem">“Most popular” = reactions + 2 × approved comments, counted on this site only. No visitor tracking.</p>' +
      '<div class="feed" id="feed" aria-live="polite"></div></div></section>';
    const after = (root) => {
      const feed = M.$("#feed", root), count = M.$("#feedCount", root);
      const paint = () => {
        const list = M.filterArticles(f); const plain = !f.q && !f.cat && !f.beauty && !f.saved && !f.time && f.sort === "new";
        count.textContent = list.length + (list.length === 1 ? " article" : " articles");
        if (!list.length) {
          feed.innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="hand">nothing here yet</span><p>' + (f.saved ? "You haven't saved any matching articles. Tap the heart on an article to save it." : "No articles match those filters.") + '</p><button class="btn ghost" data-chip="reset">Clear filters</button></div>'; return;
        }
        feed.innerHTML = list.map((a, i) => M.cardHtml(a, plain && i === 0 && !opts.noLead && M.cache.card.featureFirst, i % 3)).join("");
        M.afterRender(feed);
      };
      M.$("#fs", root).value = f.sort; M.$("#ft", root).value = f.time;
      const sync = () => { M.$$("[data-chip=beauty]", root)[0].setAttribute("aria-pressed", f.beauty); M.$$("[data-chip=saved]", root)[0].setAttribute("aria-pressed", f.saved); };
      const dq = M.debounce(() => { f.q = M.$("#fq", root).value; paint(); }, 160);
      M.$("#fq", root).addEventListener("input", dq);
      const fc = M.$("#fc", root); if (fc) fc.addEventListener("change", () => { f.cat = fc.value; paint(); });
      M.$("#fs", root).addEventListener("change", (e) => { f.sort = e.target.value; paint(); });
      M.$("#ft", root).addEventListener("change", (e) => { f.time = e.target.value; paint(); });
      // assigned (not added) so navigating between pages never stacks up old handlers
      root.onclick = (e) => {
        const c = e.target.closest("[data-chip]"); if (!c) return; const k = c.dataset.chip;
        if (k === "reset") { Object.assign(f, { q: "", cat: opts.fixedCat || "", sort: "new", time: "", beauty: false, saved: false }); M.$("#fq", root).value = ""; if (fc) fc.value = f.cat; M.$("#fs", root).value = "new"; M.$("#ft", root).value = ""; }
        else f[k] = !f[k];
        sync(); paint();
      };
      sync(); paint();
      M.refreshFeed = paint;
    };
    return { html, after };
  }

  // ---------- views ----------
  M.views = {};
  M.views.home = () => {
    const s = M.cache.settings;
    const feed = feedSection({});
    return { title: s.siteName + " — " + s.tagline, html: M.heroHtml(M.cache.hero) + feed.html,
      after: feed.after };
  };
  const catView = (route) => () => {
    const c = M.CATS.find((x) => x.route === route);
    const feed = feedSection({ cat: c.slug }, { title: "Articles", fixedCat: c.slug, noCat: true, noLead: true });
    const orig = feed.after;
    return { title: c.name + " — " + M.cache.settings.siteName, html: '<div class="wrap page-head"><p class="eyebrow enter">Category</p><h1 class="enter" style="--i:1" id="h1">' + esc(c.name) + '</h1><p class="lede enter" style="--i:2">' + esc(c.lede) + "</p></div>" + feed.html, after: orig };
  };
  M.views.beauty = catView("beauty"); M.views.lifestyle = catView("lifestyle"); M.views.growth = catView("growth");
  M.views.search = (q) => {
    const feed = feedSection({ q: q.q || "" }, { title: "Search results", noLead: true });
    return { title: "Search — " + M.cache.settings.siteName, html: '<div class="wrap page-head"><h1 id="h1" class="enter">Search</h1></div>' + feed.html, after: feed.after };
  };

  M.views.favorites = () => {
    const live = M.liveArticles(); const ids = M.favs(); const items = ids.map((id) => live.find((a) => a.id === id)).filter(Boolean);
    const gone = ids.length - items.length;
    if (gone > 0) M.lsSet("favs", items.map((a) => a.id));
    return { title: "Saved articles — " + M.cache.settings.siteName, html: '<div class="wrap page-head"><p class="eyebrow">Your reading list</p><h1 id="h1">Saved articles</h1><p class="lede">Saved on this device and in this browser only — they don’t sync to other devices, and clearing your browser data will empty the list.</p></div><div class="wrap section" style="padding-top:0">' +
      (gone > 0 ? '<p class="note-box" role="status">' + gone + (gone === 1 ? " saved article is" : " saved articles are") + " no longer available and was removed from your list.</p>" : "") +
      (items.length ? '<div class="feed">' + items.map((a, i) => M.cardHtml(a, false, i % 3)).join("") + "</div>" : '<div class="empty"><span class="hand">your list is empty</span><p>Tap the heart on any article to keep it here for later.</p><a class="btn" href="#/">Browse articles</a></div>') + "</div>" };
  };

  M.views.about = () => { const s = M.cache.settings; return { title: "About — " + s.siteName, html: '<div class="narrow page-head"><p class="eyebrow">About</p><h1 id="h1">' + esc(s.aboutTitle) + '</h1><div class="prose">' + M.md(s.aboutBody) + '</div><p class="hand" style="font-size:1.5rem;margin-top:2rem">' + esc(s.signoff) + "</p></div>" }; };

  M.views.contact = () => ({ title: "Contact — " + M.cache.settings.siteName, html: '<div class="narrow page-head"><p class="eyebrow">Say hello</p><h1 id="h1">Contact</h1><p class="lede">' + esc(M.cache.settings.contactIntro) + '</p>' +
    '<div class="note-box">This website runs entirely in your browser, so it can’t send email. Your message is saved on this device for Mifrah’s dashboard. To reach her from another device, use the Instagram link or email in the footer once she adds it.</div>' +
    '<form data-form="contact" novalidate><div class="field"><label for="cn">Name</label><input id="cn" name="name" maxlength="80" autocomplete="name" required></div><div class="field"><label for="ce">Email</label><input id="ce" name="email" type="email" maxlength="120" autocomplete="email" required></div><div class="field"><label for="cs">Subject</label><input id="cs" name="subject" maxlength="120" required></div><div class="field"><label for="cm">Message</label><textarea id="cm" name="message" maxlength="4000" required></textarea></div><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="btn" type="submit">Send message</button><div class="hint" role="status" style="margin-top:.6rem" id="cform-m"></div></form></div>' });

  M.views.newsletter = () => ({ title: "Newsletter — " + M.cache.settings.siteName, html: '<div class="narrow page-head"><p class="eyebrow">Newsletter</p><h1 id="h1">A weekly note, from my corner to yours</h1><p class="lede">A personal letter, a beauty and self-care edit, and a little growth and inspiration — weekly, with an occasional monthly roundup.</p>' + nlForm("page") +
    '<div class="note-box" style="margin-top:1.5rem">Honest note: this website has no email service, so signing up saves your address in this browser’s list only; no emails are sent automatically. Mifrah can export the list from her dashboard and send newsletters with her own email tool.</div></div>' });

  M.views.privacy = () => ({ title: "Privacy — " + M.cache.settings.siteName, html: '<div class="narrow page-head"><h1 id="h1">Privacy</h1><div class="prose"><p>This website has no analytics, no advertising, no tracking pixels and no accounts. It contacts no outside servers for ordinary use.</p><h2>What is stored, and where</h2><ul><li><strong>In this browser only:</strong> articles and images (IndexedDB), your saved-articles list, reactions you gave, your light/dark and text-size choices (localStorage).</li><li><strong>Comments, contact messages and newsletter sign-ups</strong> you submit are saved in this browser’s storage; they are not sent anywhere.</li></ul><p>No cookie banner is shown because no cookies are used. Clear your browser’s site data to remove everything.</p></div></div>' });

  M.views.notfound = () => ({ title: "Page not found", html: '<div class="narrow page-head" style="text-align:center"><span class="hand" style="font-size:2rem">oops</span><h1 id="h1">That page wandered off</h1><p class="lede" style="margin-inline:auto">The page or article you’re looking for isn’t here (it may be a draft, scheduled for later, or removed).</p><a class="btn" href="#/">Back to the latest articles</a></div>' });

  // ---------- article ----------
  const SIZES = [0.98, 1.05, 1.125, 1.25, 1.4];
  M.applyReadSize = () => document.documentElement.style.setProperty("--reading-size", SIZES[M.lsGet("readSize", 2)] + "rem");
  M.views.article = (slug, preview) => {
    const a = M.bySlug(slug);
    if (!a || (!M.isLive(a) && !preview)) return M.views.notfound();
    const s = M.cache.settings, cat = M.cat(a.category);
    const related = M.liveArticles().filter((x) => x.id !== a.id).map((x) => ({ x, sc: (x.category === a.category ? 2 : 0) + x.tags.filter((t) => a.tags.includes(t)).length })).filter((r) => r.sc > 0).sort((p, q) => q.sc - p.sc || q.x.publishedAt.localeCompare(p.x.publishedAt)).slice(0, 3).map((r) => r.x);
    const cover = a.coverId ? '<img data-cover="' + a.coverId + '" alt="' + esc(a.coverAlt) + '">' : M.placeholder(a.id);
    const mine = M.myReactions(), rc = M.cache.reactions[a.id] || {};
    const saved = M.isFav(a.id);
    const comments = M.approvedComments(a.id);
    const html = '<div class="progress" id="progress" aria-hidden="true"></div><article>' + (preview ? '<p class="note-box wrap" role="status"><strong>Preview.</strong> Only you can see this' + (a.status === "draft" ? " (it is a draft)" : "") + ".</p>" : "") +
      '<header class="article-head narrow"><p class="eyebrow"><a class="ulink" href="#/' + cat.route + '">' + esc(cat.name) + "</a></p><h1 id=\"h1\">" + esc(a.title) + "</h1>" + (a.subtitle && !a.demo ? '<p class="subtitle">' + esc(a.subtitle) + "</p>" : "") +
      '<div class="article-meta"><span>By Mifrah</span><span>·</span><time datetime="' + esc(a.publishedAt) + '">' + M.fmtDate(a.publishedAt || a.updatedAt) + "</time>" + (a.updatedAt.slice(0, 10) !== (a.publishedAt || "").slice(0, 10) && a.publishedAt ? "<span>·</span><span>Updated " + M.fmtDate(a.updatedAt) + "</span>" : "") + "<span>·</span><span>" + M.cardMins(a) + " min read</span>" + (a.demo ? '<span class="demo-badge">Demo outline</span>' : "") + "</div>" +
      '<div class="reader-tools" role="group" aria-label="Reading tools"><button class="tool" data-act="fav" data-id="' + a.id + '" aria-pressed="' + saved + '">' + ICON.heart.replace("<svg", '<svg width="16" height="16" fill="none" stroke="currentColor"') + ' <span>' + (saved ? "Saved" : "Save") + '</span></button><button class="tool" data-act="share">Share</button><button class="tool" data-act="copylink">Copy link</button><button class="tool" data-act="sizedown" aria-label="Smaller text">A−</button><button class="tool" data-act="sizeup" aria-label="Larger text">A+</button><button class="tool" data-act="mode">Dark / light</button><button class="tool" data-act="focus" aria-pressed="false">Focus mode</button></div></header>' +
      '<div class="article-cover img-reveal">' + cover + '</div><div class="narrow"><div class="prose" id="prose">' + M.md(a.content) + "</div>" +
      (a.authorNote ? '<aside class="author-note" aria-label="A note from Mifrah"><span class="hand">a note from Mifrah</span>' + M.md(a.authorNote) + "</aside>" : "") +
      (a.tags.length ? '<p class="hint">Tagged: ' + a.tags.map((t) => '<a class="ulink" href="#/search?q=' + encodeURIComponent(t) + '">#' + esc(t) + "</a>").join(", ") + "</p>" : "") +
      '<div class="reactions" role="group" aria-label="Reactions">' + M.REACTIONS.map((r) => '<button class="react" data-act="react" data-kind="' + r[0] + '" data-id="' + a.id + '" aria-pressed="' + !!mine[a.id + ":" + r[0]] + '"><span aria-hidden="true">' + r[2] + "</span> " + r[1] + ' <span class="n">' + (rc[r[0]] || 0) + "</span></button>").join("") + "</div>" +
      '<div class="nl-inline"><span class="hand" style="font-size:1.4rem">enjoyed this?</span><p style="margin:.2rem 0 .8rem">Get a weekly note from my corner to yours.</p>' + nlForm("art") + "</div>" +
      (s.commentsOn ? '<section class="comments-wrap" aria-labelledby="cH"><h2 id="cH" style="font-size:1.8rem">Comments</h2>' + (comments.length ? comments.map((c) => '<div class="comment"><span class="who">' + esc(c.name) + "</span><time>" + M.fmtDate(c.at) + "</time><p>" + esc(c.body) + '</p><button class="btn small ghost" data-act="report" data-id="' + c.id + '">Report</button></div>').join("") : '<p class="hint">No comments yet.</p>') +
        '<form data-form="comment" data-article="' + a.id + '" novalidate style="margin-top:1.2rem"><div class="field"><label for="cmn">Name</label><input id="cmn" name="name" maxlength="60" required autocomplete="nickname"></div><div class="field"><label for="cmb">Comment</label><textarea id="cmb" name="body" maxlength="2000" required style="min-height:100px"></textarea></div><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="btn" type="submit">Post comment</button><p class="hint" id="cmm" role="status">Comments are held for approval before they appear. Your email is not collected.</p></form></section>' : "") +
      "</div></article>" +
      (related.length ? '<section class="related wrap" aria-labelledby="rH"><h2 id="rH" style="font-size:1.9rem">Keep reading</h2><div class="feed">' + related.map((x, i) => M.cardHtml(x, false, i)).join("") + "</div></section>" : "");
    return { title: (a.seoTitle || a.title) + " — " + s.siteName, desc: a.seoDesc || a.excerpt, html, after: (root) => {
      const bar = M.$("#progress", root); let tick = false;
      const upd = () => { tick = false; const el = M.$("#prose"); if (!el) return; const r = el.getBoundingClientRect(); const total = r.height - innerHeight * 0.5; const p = total <= 0 ? 1 : Math.min(1, Math.max(0, (-r.top + innerHeight * 0.2) / total)); bar.style.transform = "scaleX(" + p + ")"; };
      M.onScroll = () => { if (!tick) { tick = true; requestAnimationFrame(upd); } };
      addEventListener("scroll", M.onScroll, { passive: true }); M.cleanup = () => { removeEventListener("scroll", M.onScroll); document.body.classList.remove("focus-mode"); }; upd();
      M.hydrateImages(root);
    } };
  };

  // ---------- reveal on scroll (IntersectionObserver; failsafe so content is never stuck hidden) ----------
  let io;
  M.afterRender = (root) => {
    M.hydrateCovers(root); M.hydrateImages(root);
    const els = M.$$(".reveal:not(.in), .img-reveal:not(.in)", root);
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    io = io || new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    els.forEach((e) => io.observe(e));
    setTimeout(() => els.forEach((e) => e.classList.add("in")), 2500); // failsafe
  };
})();
