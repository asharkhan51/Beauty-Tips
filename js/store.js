/* Data layer: categories, settings, articles, revisions, comments, reactions, backup. */
(function () {
  const M = window.M;

  M.CATS = [
    { slug: "beauty-self-care", name: "Beauty, Skincare & Self-Care", short: "Beauty & Self-Care", route: "beauty", lede: "Gentle routines, honest label-reading and rituals that fit real life." },
    { slug: "lifestyle", name: "Lifestyle & Daily Life", short: "Lifestyle", route: "lifestyle", lede: "Making ordinary days feel a little more intentional." },
    { slug: "personal-growth", name: "Motivation & Personal Growth", short: "Personal Growth", route: "growth", lede: "Small habits, realistic goals and progress without comparison." },
  ];
  M.cat = (slug) => M.CATS.find((c) => c.slug === slug) || M.CATS[0];
  M.REACTIONS = [["love", "Love", "♡"], ["helpful", "Helpful", "✓"], ["inspiring", "Inspiring", "✦"], ["relatable", "Relatable", "☺"]];

  M.DEFAULT_SETTINGS = {
    siteName: "Blogs By Mifrah",
    tagline: "Your little corner of beauty, growth, and everyday life.",
    heroNote: "welcome in",
    signoff: "With love, Mifrah",
    instagram: "",
    aboutTitle: "Hello, I'm Mifrah.",
    aboutBody: "This page is waiting for Mifrah's own words.\n\nOpen the dashboard → Site content to write your introduction, in your own voice. Nothing here has been written for you on purpose.",
    contactIntro: "Questions, ideas or just a hello — write to me below.",
    commentsOn: true,
  };
  M.DEFAULT_THEME = { burgundy: "#6F263D", rose: "#D9A6AA", cream: "#F8F3ED", ink: "#302B2B", serif: "cormorant", card: "flat", cols: 3, mode: "auto", motion: "auto" };
  M.SERIFS = {
    cormorant: '"Cormorant Garamond", "Playfair Display", Georgia, "Times New Roman", serif',
    georgia: 'Georgia, "Times New Roman", serif',
    palatino: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
    didot: 'Didot, "Bodoni MT", "Playfair Display", Georgia, serif',
  };

  const cache = { articles: [], comments: [], reactions: {}, settings: { ...M.DEFAULT_SETTINGS }, theme: { ...M.DEFAULT_THEME } };
  M.cache = cache;

  const DEMO = [
    ["beauty-self-care", "Building a simple, consistent skincare routine", "Outline: what a basic routine needs and how to keep it going.", ["skincare", "routine", "beauty"], "> **Demo outline — replace with your own words.** General information only, not medical advice.\n\n## Introduction\n_Your angle: why simple routines are easier to keep._\n\n## The basics most routines share\n_Cleanse, moisturise, sun protection — explain each in your own words. Cite sources for any claims._\n\n## Making it consistent\n_Habit ideas; when to add a product, when not to._\n\n## When to see a professional\n_A short, honest note that this is general information._\n\n## Sources\n_List any research you use._"],
    ["beauty-self-care", "Creating a self-care ritual that fits everyday life", "Outline: small rituals that are realistic on a busy day.", ["self-care", "routine"], "> **Demo outline — replace with your own words.**\n\n## What a ritual is (and is not)\n## Choosing something small\n## Anchoring it to your day\n## When a day goes off-plan\n## A closing thought"],
    ["beauty-self-care", "Understanding skincare product labels", "Outline: how to read an ingredient list without the jargon.", ["skincare", "ingredients", "beauty"], "> **Demo outline — replace with your own words.** Do not present opinions as medical facts; cite sources.\n\n## Why labels feel confusing\n## Reading an ingredient list\n## Common terms explained\n## Marketing claims vs. what a label can tell you\n## Sources"],
    ["lifestyle", "Making ordinary days feel more intentional", "Outline: tiny choices that change the feel of a normal day.", ["daily-life", "intentional-living"], "> **Demo outline — replace with your own words.**\n\n## What intentional means to you\n## Morning\n## Midday\n## Evening\n## Keeping it gentle"],
    ["lifestyle", "Creating a comfortable personal routine", "Outline: a routine that supports you instead of pressuring you.", ["routine", "daily-life", "habits"], "> **Demo outline — replace with your own words.**\n\n## Why routines help\n## Start from how you actually live\n## Flexible anchors\n## Adjusting over time"],
    ["lifestyle", "Finding inspiration in small everyday moments", "Outline: noticing the small things worth keeping.", ["inspiration", "daily-life", "reflection"], "> **Demo outline — replace with your own words.**\n\n## Noticing\n## Collecting small moments\n## Turning them into creative fuel\n## A prompt for the week"],
    ["personal-growth", "Building confidence through manageable habits", "Outline: confidence as something practised in small steps.", ["confidence", "habits"], "> **Demo outline — replace with your own words.**\n\n## Confidence as a skill\n## Choosing one small habit\n## Tracking without pressure\n## When motivation dips"],
    ["personal-growth", "Setting gentle, realistic personal goals", "Outline: goals that stretch you without overwhelming you.", ["goals", "habits"], "> **Demo outline — replace with your own words.**\n\n## What makes a goal gentle\n## Sizing a goal\n## Checking in\n## Adjusting without guilt"],
    ["personal-growth", "Reflecting on progress without comparing yourself to others", "Outline: measuring growth against your own past.", ["reflection", "confidence", "goals"], "> **Demo outline — replace with your own words.**\n\n## Why comparison is so easy\n## A personal progress review\n## Journalling prompts\n## Closing note"],
  ];

  M.newArticle = (over) => {
    const now = new Date().toISOString();
    return Object.assign({ id: M.uid(), slug: "", title: "", subtitle: "", excerpt: "", content: "", authorNote: "", category: M.CATS[0].slug, tags: [], coverId: "", coverAlt: "", status: "draft", publishedAt: "", createdAt: now, updatedAt: now, seoTitle: "", seoDesc: "", demo: false, coverFit: "", coverX: 50, coverY: 50, readMins: 0 }, over || {});
  };

  M.seedDemo = async () => {
    const base = Date.now();
    for (let i = 0; i < DEMO.length; i++) {
      const d = DEMO[i];
      const a = M.newArticle({ slug: M.slugify(d[1]), title: d[1], subtitle: "Demo outline", excerpt: d[2], content: d[4], category: d[0], tags: d[3], status: "published", demo: true, coverAlt: "", publishedAt: new Date(base - (DEMO.length - i) * 86400000 * 2).toISOString() });
      await M.db.put("articles", a);
    }
  };

  M.load = async () => {
    await M.db.open();
    const saved = await M.db.get("kv", "settings"); if (saved) Object.assign(cache.settings, saved.value);
    const th = await M.db.get("kv", "theme"); if (th) Object.assign(cache.theme, th.value);
    const rx = await M.db.get("kv", "reactions"); cache.reactions = (rx && rx.value) || {};
    const seeded = await M.db.get("kv", "seeded");
    if (!seeded) { await M.seedDemo(); await M.db.put("kv", { key: "seeded", value: true }); }
    await M.refresh();
    if (M.loadDesign) await M.loadDesign(); // hero + card design (js/design.js)
  };
  M.refresh = async () => {
    cache.articles = (await M.db.all("articles")).sort((a, b) => (b.publishedAt || b.updatedAt).localeCompare(a.publishedAt || a.updatedAt));
    cache.comments = await M.db.all("comments");
  };
  M.saveSettings = async (s) => { Object.assign(cache.settings, s); await M.db.put("kv", { key: "settings", value: cache.settings }); };
  M.saveTheme = async (t) => { Object.assign(cache.theme, t); await M.db.put("kv", { key: "theme", value: cache.theme }); M.applyTheme(); };

  // theme -> CSS variables
  M.applyTheme = () => {
    const t = cache.theme, r = document.documentElement;
    const mode = M.lsGet("mode", t.mode || "auto");
    r.dataset.mode = mode; r.dataset.card = t.card; r.dataset.motion = t.motion === "reduced" ? "reduced" : "auto";
    r.style.setProperty("--grid-cols", t.cols);
    r.style.setProperty("--font-serif", M.SERIFS[t.serif] || M.SERIFS.cormorant);
    // custom colours apply to the light theme only; dark mode keeps its own readable palette
    const dark = mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    ["burgundy", "rose", "cream", "ink"].forEach((k) => {
      if (dark) r.style.removeProperty("--" + k);
      else r.style.setProperty("--" + k, t[k]);
    });
    if (!dark) { r.style.setProperty("--rose-soft", "color-mix(in srgb, " + t.rose + " 35%, " + t.cream + ")"); r.style.setProperty("--line", "color-mix(in srgb, " + t.ink + " 14%, " + t.cream + ")"); r.style.setProperty("--surface", "color-mix(in srgb, #fff 55%, " + t.cream + ")"); }
    else ["--rose-soft", "--line", "--surface"].forEach((k) => r.style.removeProperty(k));
  };

  // ---------- visibility ----------
  M.isLive = (a) => a.status !== "draft" && a.publishedAt && new Date(a.publishedAt) <= new Date();
  M.liveArticles = () => cache.articles.filter(M.isLive);
  M.bySlug = (slug) => cache.articles.find((a) => a.slug === slug);

  // ---------- popularity (documented): reactions + 2 x approved comments. Local engagement only; no tracking. ----------
  M.reactionTotal = (id) => { const r = cache.reactions[id] || {}; return Object.values(r).reduce((s, n) => s + n, 0); };
  M.approvedComments = (id) => cache.comments.filter((c) => c.articleId === id && c.status === "approved");
  M.popularity = (a) => M.reactionTotal(a.id) + 2 * M.approvedComments(a.id).length;

  // ---------- saving with revision history ----------
  const TRACK = ["title", "subtitle", "excerpt", "content", "authorNote", "seoTitle", "seoDesc"];
  M.uniqueSlug = (slug, id) => { let s = slug || "untitled", n = 2; while (cache.articles.some((a) => a.slug === s && a.id !== id)) s = slug + "-" + n++; return s; };
  M.saveArticle = async (a, note) => {
    if (!a.title.trim()) throw new M.UserError("Please give the article a title.");
    a.slug = M.uniqueSlug(M.slugify(a.slug || a.title), a.id);
    if (a.status !== "draft" && !a.publishedAt) a.publishedAt = new Date().toISOString();
    if (a.status === "draft") a.publishedAt = a.publishedAt || "";
    const prev = await M.db.get("articles", a.id);
    a.updatedAt = new Date().toISOString();
    const changed = !prev || TRACK.some((k) => (prev[k] || "") !== (a[k] || ""));
    await M.db.put("articles", a);
    if (changed) await M.db.put("revisions", { id: M.uid(), articleId: a.id, at: a.updatedAt, note: note || (prev ? "Saved" : "Created"), snap: Object.fromEntries(TRACK.map((k) => [k, a[k] || ""])) });
    await M.db.del("kv", "autosave:" + a.id);
    await M.refresh(); return a;
  };
  M.revisions = async (id) => (await M.db.tx("revisions", "readonly", (s) => s.index("articleId").getAll(id))).sort((x, y) => y.at.localeCompare(x.at));
  M.restoreRevision = async (articleId, revId) => {
    const rev = await M.db.get("revisions", revId); const a = await M.db.get("articles", articleId);
    if (!rev || !a) throw new M.UserError("That version could not be found.");
    Object.assign(a, rev.snap); // restoring is itself saved as a new revision, so nothing is lost
    return M.saveArticle(a, "Restored from " + M.fmtTime(rev.at));
  };
  M.deleteArticle = async (id) => {
    const a = await M.db.get("articles", id);
    if (a && a.coverId) { await M.db.del("images", a.coverId); M.forgetImg(a.coverId); }
    await M.db.del("articles", id);
    for (const r of await M.revisions(id)) await M.db.del("revisions", r.id);
    for (const c of cache.comments.filter((c) => c.articleId === id)) await M.db.del("comments", c.id);
    await M.refresh();
  };

  // ---------- images: validate by actual decoding, resize, store ----------
  M.addImage = async (file) => {
    if (!file) throw new M.UserError("No file chosen.");
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new M.UserError("Please choose a JPG, PNG, WebP or GIF image.");
    if (file.size > 12 * 1024 * 1024) throw new M.UserError("That image is over 12 MB. Please choose a smaller one.");
    const bmp = await createImageBitmap(file).catch(() => { throw new M.UserError("That file isn't a readable image."); });
    const max = 1600, s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.86));
    const id = M.uid();
    await M.db.put("images", { id, blob, name: String(file.name || "image").replace(/[^\w.\- ]/g, "_").slice(0, 80), w: c.width, h: c.height, at: new Date().toISOString() });
    return id;
  };

  // ---------- generated cover placeholder (labelled as a placeholder in admin) ----------
  M.placeholder = (seedStr) => {
    let h = 0; for (const ch of String(seedStr)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const v = h % 4, cols = ["var(--rose)", "var(--burgundy)", "var(--rose-soft)", "var(--taupe)"];
    const a = cols[h % 4], b = cols[(h >> 3) % 4], c = cols[(h >> 5) % 4];
    const shapes = [
      '<circle cx="62%" cy="45%" r="28%" fill="' + b + '" opacity=".85"/><rect x="8%" y="58%" width="40%" height="30%" fill="' + c + '" opacity=".8"/>',
      '<path d="M0 100 Q 50 20 100 100Z" transform="scale(4 3)" fill="' + b + '" opacity=".8"/><circle cx="78%" cy="26%" r="9%" fill="' + c + '"/>',
      '<rect x="12%" y="14%" width="34%" height="72%" rx="17%" fill="' + b + '" opacity=".85"/><rect x="54%" y="30%" width="30%" height="56%" rx="15%" fill="' + c + '" opacity=".85"/>',
      '<circle cx="30%" cy="60%" r="22%" fill="' + b + '" opacity=".8"/><circle cx="62%" cy="42%" r="16%" fill="' + c + '" opacity=".9"/><circle cx="74%" cy="72%" r="9%" fill="' + b + '"/>',
    ];
    return '<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="400" height="300" fill="' + a + '" opacity=".35"/>' + shapes[v] + "</svg>";
  };

  // ---------- reactions (one of each kind per browser; documented limitation: clearing site data resets it) ----------
  M.myReactions = () => M.lsGet("myReactions", {});
  M.toggleReaction = async (articleId, kind) => {
    const mine = M.myReactions(); const key = articleId + ":" + kind; const had = !!mine[key];
    const r = (cache.reactions[articleId] = cache.reactions[articleId] || {});
    r[kind] = Math.max(0, (r[kind] || 0) + (had ? -1 : 1));
    if (had) delete mine[key]; else mine[key] = 1;
    M.lsSet("myReactions", mine);
    await M.db.put("kv", { key: "reactions", value: cache.reactions });
    return !had;
  };

  // ---------- favourites (this browser only) ----------
  M.favs = () => M.lsGet("favs", []);
  M.isFav = (id) => M.favs().includes(id);
  M.toggleFav = (id) => { let f = M.favs(); const on = !f.includes(id); f = on ? [...f, id] : f.filter((x) => x !== id); M.lsSet("favs", f); return on; };

  // ---------- backup / restore ----------
  const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  M.exportAll = async () => {
    const out = { app: "blogs-by-mifrah", version: 1, exportedAt: new Date().toISOString(), data: {} };
    for (const s of ["articles", "revisions", "comments", "messages", "subscribers", "kv"]) out.data[s] = await M.db.all(s);
    out.data.images = [];
    for (const im of await M.db.all("images")) out.data.images.push({ id: im.id, name: im.name, w: im.w, h: im.h, at: im.at, dataUrl: await toB64(im.blob) });
    return JSON.stringify(out);
  };
  M.importAll = async (text) => {
    let o; try { o = JSON.parse(text); } catch (e) { throw new M.UserError("That file isn't a valid backup (it couldn't be read)."); }
    if (!o || o.app !== "blogs-by-mifrah" || !o.data || !Array.isArray(o.data.articles)) throw new M.UserError("That file isn't a Blogs By Mifrah backup.");
    // validate everything before touching existing data
    for (const a of o.data.articles) if (!a || typeof a.id !== "string" || typeof a.title !== "string" || typeof a.slug !== "string") throw new M.UserError("The backup contains a damaged article. Nothing was changed.");
    const imgs = [];
    for (const im of o.data.images || []) { const r = await fetch(im.dataUrl).catch(() => null); if (!r) throw new M.UserError("The backup contains a damaged image. Nothing was changed."); imgs.push({ id: im.id, name: im.name, w: im.w, h: im.h, at: im.at, blob: await r.blob() }); }
    for (const s of ["articles", "revisions", "comments", "messages", "subscribers", "kv", "images"]) await M.db.clear(s);
    for (const s of ["articles", "revisions", "comments", "messages", "subscribers", "kv"]) for (const v of o.data[s] || []) await M.db.put(s, v);
    for (const im of imgs) await M.db.put("images", im);
    const sd = await M.db.get("kv", "seeded"); if (!sd) await M.db.put("kv", { key: "seeded", value: true });
    const st = await M.db.get("kv", "settings"); if (st) Object.assign(cache.settings, M.DEFAULT_SETTINGS, st.value);
    const th = await M.db.get("kv", "theme"); if (th) Object.assign(cache.theme, M.DEFAULT_THEME, th.value);
    const rx = await M.db.get("kv", "reactions"); cache.reactions = (rx && rx.value) || {};
    await M.refresh(); M.applyTheme(); if (M.loadDesign) await M.loadDesign();
  };
  M.resetAll = async () => {
    for (const s of ["articles", "revisions", "comments", "messages", "subscribers", "kv", "images"]) await M.db.clear(s);
    cache.settings = { ...M.DEFAULT_SETTINGS }; cache.theme = { ...M.DEFAULT_THEME }; cache.reactions = {};
    ["favs", "myReactions", "mode"].forEach((k) => localStorage.removeItem(k));
    await M.seedDemo(); await M.db.put("kv", { key: "seeded", value: true }); await M.refresh(); M.applyTheme(); if (M.loadDesign) await M.loadDesign();
  };
})();
