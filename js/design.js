/* Design settings: the homepage hero ("arch") and the article cards.
   Stored in this browser's IndexedDB (kv "hero" and kv "card") so they survive refreshes,
   and are included in the normal full backup. A colour of `null` means "follow the website theme"
   (so dark mode keeps working until you choose a colour yourself). */
(function () {
  const M = window.M, esc = M.esc;
  const HEX = /^#[0-9a-f]{6}$/i;

  // ---------- field descriptions (drive validation AND the admin forms) ----------
  // type: color | range | select | check | text.  def = default.  css = what a "default" colour looks like.
  const RATIOS = [["4/3", "Classic 4:3"], ["3/2", "Photo 3:2"], ["16/10", "Wide 16:10"], ["16/9", "Cinema 16:9"], ["1/1", "Square"], ["4/5", "Tall portrait 4:5"]];
  M.HERO_SCHEMA = [
    { g: "Photo inside the arch", k: "imageFit", type: "select", def: "cover", options: [["cover", "Fill the arch (cover — may crop)"], ["contain", "Show the whole photo (contain)"]] },
    { k: "imgX", type: "range", def: 50, min: 0, max: 100, unit: "%", label: "Photo position: left ↔ right" },
    { k: "imgY", type: "range", def: 50, min: 0, max: 100, unit: "%", label: "Photo position: top ↔ bottom" },
    { k: "imgZoom", type: "range", def: 100, min: 50, max: 250, unit: "%", label: "Photo size (zoom)" },
    { k: "noImage", type: "select", def: "solid", label: "When there is no photo", options: [["solid", "Solid colour arch (original look)"], ["placeholder", "Soft placeholder picture"]] },
    { g: "Arch colours", k: "innerColor", type: "color", def: null, css: "var(--burgundy)", label: "Inner arch colour" },
    { k: "outerColor", type: "color", def: null, css: "var(--rose-soft)", label: "Outer arch colour" },
    { k: "borderColor", type: "color", def: null, css: "var(--rose)", label: "Arch border colour" },
    { k: "borderWidth", type: "range", def: 1, min: 0, max: 8, unit: "px", label: "Arch border thickness" },
    { g: "Arch shape & size", k: "artWidth", type: "range", def: 420, min: 220, max: 560, step: 10, unit: "px", label: "Whole artwork width" },
    { k: "archW", type: "range", def: 84, min: 40, max: 100, unit: "%", label: "Outer arch width" },
    { k: "archH", type: "range", def: 94, min: 50, max: 100, unit: "%", label: "Outer arch height" },
    { k: "archRound", type: "range", def: 100, min: 0, max: 100, unit: "%", label: "Top roundness (0 = square, 100 = full arch)" },
    { k: "innerScale", type: "range", def: 67, min: 30, max: 95, unit: "%", label: "Inner arch size (compared with outer arch)" },
    { g: "Circle & curved line", k: "showOuter", type: "check", def: true, label: "Show the outer arch" },
    { k: "showCircle", type: "check", def: true, label: "Show the decorative circle" },
    { k: "circleColor", type: "color", def: null, css: "var(--rose)", label: "Circle colour" },
    { k: "circleSize", type: "range", def: 22, min: 8, max: 40, unit: "%", label: "Circle size" },
    { k: "showLine", type: "check", def: true, label: "Show the curved line" },
    { k: "lineColor", type: "color", def: null, css: "var(--burgundy)", label: "Curved line colour" },
    { g: "Hero words & buttons", k: "heroNote", type: "text", def: "welcome in", max: 40, label: "Handwritten note above the heading", settings: true },
    { k: "heading", type: "text", def: "", max: 80, label: "Heading", hint: "Leave empty to use the website name." },
    { k: "subtitle", type: "text", def: "", max: 160, label: "Subtitle", hint: "Leave empty to use the tagline (Site content)." },
    { k: "btn1", type: "text", def: "Explore the latest articles", max: 40, label: "Main button text" },
    { k: "btn2", type: "text", def: "Join the newsletter", max: 40, label: "Second button text" },
    { g: "Spacing & alignment", k: "padTop", type: "range", def: 6.5, min: 1, max: 10, step: 0.5, unit: "rem", label: "Space above the hero" },
    { k: "padBottom", type: "range", def: 4.5, min: 1, max: 10, step: 0.5, unit: "rem", label: "Space below the hero" },
    { k: "textAlign", type: "select", def: "left", label: "Text alignment", options: [["left", "Left"], ["center", "Centred"]] },
    { k: "vAlign", type: "select", def: "center", label: "Text height next to the artwork", options: [["start", "Top"], ["center", "Middle"], ["end", "Bottom"]] },
    { k: "artSide", type: "select", def: "right", label: "Artwork side", options: [["right", "Right"], ["left", "Left"]] },
  ];
  M.CARD_SCHEMA = [
    { g: "Colours", k: "bg", type: "color", def: null, css: "var(--surface)", label: "Card background" },
    { k: "titleColor", type: "color", def: null, css: "var(--burgundy)", label: "Title colour" },
    { k: "summaryColor", type: "color", def: null, css: "var(--ink)", label: "Summary colour" },
    { k: "catColor", type: "color", def: null, css: "var(--burgundy)", label: "Category label colour" },
    { k: "catBg", type: "color", def: null, css: "var(--rose-soft)", label: "Category label background" },
    { k: "borderColor", type: "color", def: null, css: "var(--line)", label: "Card border colour" },
    { g: "Shape & depth", k: "borderWidth", type: "range", def: 1, min: 0, max: 6, unit: "px", label: "Border thickness" },
    { k: "radius", type: "range", def: 18, min: 0, max: 40, unit: "px", label: "Corner roundness" },
    { k: "shadow", type: "range", def: 25, min: 0, max: 100, unit: "%", label: "Shadow intensity" },
    { g: "Cover image", k: "ratio", type: "select", def: "4/3", label: "Image shape (aspect ratio)", options: RATIOS },
    { k: "imgHeight", type: "range", def: 0, min: 0, max: 480, step: 10, unit: "px", label: "Fixed image height (0 = use the shape above)" },
    { k: "imgFit", type: "select", def: "cover", label: "Default image fitting", options: [["cover", "Fill (cover — may crop)"], ["contain", "Show whole image (contain)"]] },
    { g: "Spacing & text", k: "pad", type: "range", def: 1.2, min: 0.5, max: 2.5, step: 0.1, unit: "rem", label: "Padding inside the card" },
    { k: "space", type: "range", def: 0.45, min: 0.1, max: 1.2, step: 0.05, unit: "rem", label: "Space between title, summary and details" },
    { k: "titleFont", type: "select", def: "heading", label: "Title font", options: [["heading", "Match website heading font"], ["sans", "Clean sans-serif"], ["georgia", "Georgia"], ["palatino", "Palatino"]] },
    { k: "bodyFont", type: "select", def: "sans", label: "Summary & details font", options: [["sans", "Clean sans-serif"], ["serif", "Georgia (serif)"]] },
    { k: "titleSize", type: "range", def: 1.55, min: 1.1, max: 2.4, step: 0.05, unit: "rem", label: "Title text size" },
    { k: "summarySize", type: "range", def: 0.95, min: 0.8, max: 1.25, step: 0.05, unit: "rem", label: "Summary text size" },
    { g: "Hover animation", k: "hover", type: "select", def: "both", label: "When the pointer is over a card", options: [["both", "Lift card and zoom image"], ["lift", "Lift card only"], ["zoom", "Zoom image only"], ["none", "No animation"]] },
    { k: "speed", type: "range", def: 450, min: 100, max: 1200, step: 50, unit: "ms", label: "Transition speed (milliseconds)" },
    { g: "What each card shows", k: "showCat", type: "check", def: true, label: "Category label" },
    { k: "showSummary", type: "check", def: true, label: "Summary" },
    { k: "showDate", type: "check", def: true, label: "Date" },
    { k: "showRead", type: "check", def: true, label: "Reading time" },
    { k: "showMore", type: "check", def: true, label: "“Read article” indicator" },
    { g: "Layout", k: "colsD", type: "range", def: 3, min: 1, max: 4, unit: " per row", label: "Cards per row — desktop" },
    { k: "colsT", type: "range", def: 2, min: 1, max: 3, unit: " per row", label: "Cards per row — tablet" },
    { k: "colsM", type: "range", def: 1, min: 1, max: 2, unit: " per row", label: "Cards per row — mobile" },
    { k: "gap", type: "range", def: 28, min: 8, max: 64, unit: "px", label: "Gap between cards" },
    { k: "featureFirst", type: "check", def: true, label: "Show the newest article as a large feature card on the homepage" },
  ];

  // ---------- validation: anything unknown or out of range falls back to the default ----------
  const clean = (schema, src) => {
    const o = {}; src = src && typeof src === "object" ? src : {};
    for (const f of schema) {
      const v = src[f.k];
      if (f.type === "color") o[f.k] = typeof v === "string" && HEX.test(v) ? v.toLowerCase() : null;
      else if (f.type === "range") { const n = Number(v); o[f.k] = Number.isFinite(n) && v !== "" && v !== null ? Math.min(f.max, Math.max(f.min, n)) : f.def; }
      else if (f.type === "select") o[f.k] = f.options.some((x) => x[0] === v) ? v : f.def;
      else if (f.type === "check") o[f.k] = typeof v === "boolean" ? v : f.def;
      else o[f.k] = typeof v === "string" ? v.slice(0, f.max || 200) : f.def;
    }
    return o;
  };
  M.normHero = (src) => { const o = clean(M.HERO_SCHEMA.filter((f) => !f.settings), src); o.imageId = src && typeof src.imageId === "string" && /^[\w-]{1,64}$/.test(src.imageId) ? src.imageId : ""; return o; };
  M.normCard = (src) => clean(M.CARD_SCHEMA, src);
  M.defaultHero = () => M.normHero(null);
  M.defaultCard = () => M.normCard(null);

  M.cache.hero = M.defaultHero();
  M.cache.card = M.defaultCard();

  // ---------- load / save ----------
  M.loadDesign = async () => {
    const h = await M.db.get("kv", "hero"), c = await M.db.get("kv", "card");
    M.cache.hero = M.normHero(h && h.value);
    const src = c && c.value ? c.value : (M.cache.theme.cols && M.cache.theme.cols !== 3 ? { colsD: M.cache.theme.cols } : null); // keep an older "Article columns" choice
    M.cache.card = M.normCard(src);
    M.applyCardDesign();
  };
  M.saveHero = async (h) => { M.cache.hero = M.normHero(h); await M.db.put("kv", { key: "hero", value: M.cache.hero }); };
  M.saveCard = async (c) => { M.cache.card = M.normCard(c); await M.db.put("kv", { key: "card", value: M.cache.card }); M.applyCardDesign(); };

  // ---------- article cards -> CSS variables (applied to the whole site) ----------
  M.applyCardDesign = (c) => {
    c = c || M.cache.card; const r = document.documentElement;
    const set = (k, v) => { if (v == null) r.style.removeProperty(k); else r.style.setProperty(k, String(v)); };
    set("--cd-bg", c.bg); set("--cd-title", c.titleColor); set("--cd-sum", c.summaryColor); set("--cd-cat", c.catColor); set("--cd-catbg", c.catBg); set("--cd-border", c.borderColor);
    set("--cd-bw", c.borderWidth + "px"); set("--cd-radius", c.radius + "px"); set("--cd-shadow", c.shadow);
    set("--cd-ratio", c.ratio); set("--cd-height", c.imgHeight + "px"); r.dataset.cdH = c.imgHeight > 0 ? "fixed" : "ratio";
    set("--cd-fit", c.imgFit); set("--cd-pad", c.pad + "rem"); set("--cd-space", c.space + "rem");
    set("--cd-tfont", { heading: null, sans: "var(--font-sans)", georgia: M.SERIFS.georgia, palatino: M.SERIFS.palatino }[c.titleFont]);
    set("--cd-bfont", c.bodyFont === "serif" ? M.SERIFS.georgia : null);
    set("--cd-tsize", c.titleSize + "rem"); set("--cd-ssize", c.summarySize + "rem");
    r.dataset.cdHover = c.hover; set("--cd-speed", c.speed + "ms");
    r.dataset.cdHide = [["date", c.showDate], ["cat", c.showCat], ["summary", c.showSummary], ["read", c.showRead], ["more", c.showMore]].filter((x) => !x[1]).map((x) => x[0]).join(" ");
    set("--cd-cols-d", c.colsD); set("--cd-cols-t", c.colsT); set("--cd-cols-m", c.colsM); set("--cd-gap", c.gap + "px");
  };

  // ---------- homepage hero markup (used by the real homepage AND the live preview) ----------
  M.heroHtml = (h, o) => {
    o = o || {}; const s = M.cache.settings;
    const note = o.note != null ? o.note : s.heroNote;
    const parts = ((h.heading || "").trim() || s.siteName).trim().split(/\s+/); const last = parts.pop();
    const sub = (h.subtitle || "").trim() || s.tagline;
    const vars = ["--h-pt:" + h.padTop + "rem", "--h-pb:" + h.padBottom + "rem", "--h-aw:" + h.artWidth + "px", "--h-archw:" + h.archW, "--h-archh:" + h.archH, "--h-round:" + h.archRound, "--h-inner-scale:" + h.innerScale,
      "--h-bw:" + h.borderWidth + "px", "--h-fit:" + h.imageFit, "--h-x:" + h.imgX + "%", "--h-y:" + h.imgY + "%", "--h-zoom:" + h.imgZoom / 100, "--h-circ:" + h.circleSize];
    [["--h-inner", h.innerColor], ["--h-outer", h.outerColor], ["--h-border", h.borderColor], ["--h-circle", h.circleColor], ["--h-line", h.lineColor]].forEach((p) => { if (p[1]) vars.push(p[0] + ":" + p[1]); });
    const inner = h.imageId ? '<img class="hero-img" data-cover="' + esc(h.imageId) + '" alt="">' : h.noImage === "placeholder" ? '<div class="hero-ph">' + M.placeholder("hero") + "</div>" : "";
    const id = o.preview ? "" : ' id="h1"';
    return '<section class="hero' + (h.imageId || h.noImage === "placeholder" ? " has-img" : "") + '" data-align="' + h.textAlign + '" data-valign="' + h.vAlign + '" data-side="' + h.artSide + '" style="' + esc(vars.join(";")) + '"' + (o.preview ? "" : ' aria-labelledby="h1"') + '><div class="wrap hero-grid"><div class="hero-text">' +
      (note ? '<span class="hand hand-note enter" style="--i:0">' + esc(note) + "</span>" : "") +
      "<h1" + id + ' class="enter" style="--i:1">' + esc(parts.join(" ")) + (parts.length ? " " : "") + "<em>" + esc(last) + '</em></h1><p class="tagline enter" style="--i:2">' + esc(sub) + "</p>" +
      '<div class="enter row" style="--i:3">' + (h.btn1.trim() ? '<button class="btn" data-scroll="#latest">' + esc(h.btn1) + "</button>" : "") + (h.btn2.trim() ? '<a class="btn ghost" href="#/newsletter">' + esc(h.btn2) + "</a>" : "") + "</div></div>" +
      '<div class="hero-art" aria-hidden="true">' + (h.showOuter ? '<div class="arch"></div>' : "") + '<div class="arch two">' + inner + "</div>" + (h.showCircle ? '<div class="orb"></div>' : "") +
      (h.showLine ? '<svg class="flourish draw" viewBox="0 0 100 60"><path d="M4 50 C 20 10, 40 10, 50 30 S 80 50, 96 8"/></svg>' : "") + "</div></div></section>";
  };

  // ---------- reading time (a card can override the automatic estimate) ----------
  M.cardMins = (a) => (a && a.readMins > 0 ? Math.round(a.readMins) : M.readingMinutes(a ? a.content : ""));

  // ---------- turn a CSS colour (like var(--rose-soft)) into #rrggbb, to show defaults in colour pickers ----------
  M.resolveColor = (css) => {
    try {
      const e = document.createElement("span"); e.style.color = css; e.style.display = "none"; document.body.appendChild(e);
      const c = getComputedStyle(e).color; e.remove();
      const n = (c.match(/[\d.]+/g) || []).map(Number); if (n.length < 3) return "#888888";
      const k = /^color\(/.test(c) ? 255 : 1; const hx = (v) => Math.round(Math.min(255, Math.max(0, v * k))).toString(16).padStart(2, "0");
      return "#" + hx(n[0]) + hx(n[1]) + hx(n[2]);
    } catch (e) { return "#888888"; }
  };

  // ---------- design-only backup: hero + card settings + colours/fonts (+ the hero photo) ----------
  const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  M.exportDesign = async () => {
    const out = { app: "blogs-by-mifrah-design", version: 1, exportedAt: new Date().toISOString(), hero: M.cache.hero, card: M.cache.card, theme: M.cache.theme, heroNote: M.cache.settings.heroNote, images: [] };
    if (M.cache.hero.imageId) { const im = await M.db.get("images", M.cache.hero.imageId); if (im) out.images.push({ id: im.id, name: im.name, w: im.w, h: im.h, at: im.at, dataUrl: await toB64(im.blob) }); }
    return JSON.stringify(out);
  };
  M.importDesign = async (text) => {
    let o; try { o = JSON.parse(text); } catch (e) { throw new M.UserError("That file couldn't be read."); }
    if (!o || o.app !== "blogs-by-mifrah-design" || typeof o.hero !== "object" || typeof o.card !== "object") throw new M.UserError("That isn't a Blogs By Mifrah design file. (A full backup is restored from the “Restore from a backup” box instead.)");
    const imgs = [];
    for (const im of Array.isArray(o.images) ? o.images : []) {
      if (!im || typeof im.id !== "string" || !/^[\w-]{1,64}$/.test(im.id) || typeof im.dataUrl !== "string" || !/^data:image\/(jpeg|png|webp|gif);base64,/.test(im.dataUrl)) throw new M.UserError("The design file contains a damaged image. Nothing was changed.");
      const r = await fetch(im.dataUrl).catch(() => null); if (!r) throw new M.UserError("The design file contains a damaged image. Nothing was changed.");
      imgs.push({ id: im.id, name: String(im.name || "image").slice(0, 80), w: +im.w || 0, h: +im.h || 0, at: String(im.at || new Date().toISOString()), blob: await r.blob() });
    }
    const hero = M.normHero(o.hero);
    if (hero.imageId && !imgs.some((i) => i.id === hero.imageId) && !(await M.db.get("images", hero.imageId))) hero.imageId = "";
    const card = M.normCard(o.card);
    const t = o.theme && typeof o.theme === "object" ? o.theme : {}; const th = {};
    ["burgundy", "rose", "cream", "ink"].forEach((k) => { if (typeof t[k] === "string" && HEX.test(t[k])) th[k] = t[k]; });
    if (M.SERIFS[t.serif]) th.serif = t.serif;
    if (["auto", "light", "dark"].includes(t.mode)) th.mode = t.mode;
    if (["auto", "reduced"].includes(t.motion)) th.motion = t.motion;
    for (const im of imgs) await M.db.put("images", im);
    await M.saveHero(hero); await M.saveCard(card);
    await M.saveTheme(th);
    if (typeof o.heroNote === "string") await M.saveSettings({ heroNote: o.heroNote.slice(0, 40) });
  };
})();
