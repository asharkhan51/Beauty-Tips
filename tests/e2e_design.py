"""End-to-end checks for the Homepage Hero Editor and Article Card Designer (real Chromium via Playwright).
Run:  python3 tests/e2e_design.py      (needs: pip install playwright && playwright install chromium)
Prints PASS/FAIL per check; exit code 1 if any fail."""
import subprocess, sys, time, os, struct, zlib, tempfile, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8766
results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))

def png(path, w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb * w) for _ in range(h))
    def ch(t, d): c = struct.pack(">I", len(d)) + t + d; return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b""))

srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(PORT)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
BASE = f"http://localhost:{PORT}/"
tmp = tempfile.mkdtemp(); hero_img = os.path.join(tmp, "hero.png"); card_img = os.path.join(tmp, "card.png"); png(hero_img, 800, 1000, [40, 120, 90]); png(card_img, 900, 500, [30, 60, 160])

def go(pg, h):
    pg.goto(BASE + h); pg.wait_for_timeout(600)
def setv(pg, sel, val):  # set a range/colour/select value and fire the same event a user would
    pg.evaluate("([s,v])=>{const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))}", [sel, str(val)])
def tick(pg, sel, on):
    pg.evaluate("([s,v])=>{const e=document.querySelector(s);e.checked=v;e.dispatchEvent(new Event('input',{bubbles:true}))}", [sel, on])
def css(pg, sel, prop):
    return pg.evaluate("([s,p])=>getComputedStyle(document.querySelector(s))[p]", [sel, prop])
def rgb(h): h = h.lstrip("#"); return "rgb(%d, %d, %d)" % tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def confirm_yes(pg): pg.wait_for_selector("dialog[open]"); pg.click("dialog button[value=yes]"); pg.wait_for_timeout(500)
def save(pg): pg.click('[data-d="save"]'); pg.wait_for_selector(".toast >> text=saved", timeout=5000); pg.wait_for_timeout(300)

try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    pg = ctx.new_page(); errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
    pg.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url}") if r.status >= 400 else None)
    pg.goto(BASE); pg.evaluate("localStorage.setItem('mode', '\"light\"')")

    # ---------- admin navigation ----------
    go(pg, "#/admin"); pg.click('[data-act="ad-nopass"]'); pg.wait_for_selector(".admin-side")
    nav = pg.inner_text(".admin-side")
    check("admin nav shows 'Homepage Hero Editor' and 'Article Card Designer'", "Homepage Hero Editor" in nav and "Article Card Designer" in nav)
    pg.click(".admin-side >> text=Homepage Hero Editor"); pg.wait_for_selector("#heroStage .hero")
    check("hero editor opens with a live preview of the real hero", pg.locator("#heroStage .hero-art .arch.two").count() == 1 and "Homepage Hero Editor" in pg.inner_text("h1"))
    check("hero editor: nothing leaks to the real page (preview has no duplicate h1 id)", pg.locator("#h1").count() == 1)

    # ---------- hero: photo upload, preview, colours, shapes ----------
    pg.set_input_files("#hero-file", hero_img); pg.wait_for_selector("#heroStage img.hero-img")
    pg.wait_for_function("(()=>{const i=document.querySelector('#heroStage img.hero-img');return i&&i.complete&&i.naturalWidth>0&&i.src.startsWith('blob:')})()")
    check("hero: uploaded photo previews before saving", True)
    check("hero: 'unsaved' indicator shown", "Unsaved" in pg.inner_text("#dstate"))
    go_home_ctx = ctx.new_page(); go_home_ctx.goto(BASE); go_home_ctx.wait_for_selector(".hero")
    check("hero: real homepage unchanged until Save (no photo yet)", go_home_ctx.locator(".hero-art img.hero-img").count() == 0)
    setv(pg, "#hero-innerColor", "#224466"); setv(pg, "#hero-outerColor", "#ffeedd"); setv(pg, "#hero-borderColor", "#112233")
    setv(pg, "#hero-imgX", 20); setv(pg, "#hero-imgY", 80); setv(pg, "#hero-imgZoom", 150); pg.select_option("#hero-imageFit", "contain")
    setv(pg, "#hero-archRound", 40); setv(pg, "#hero-archW", 70); setv(pg, "#hero-archH", 80); setv(pg, "#hero-innerScale", 60); setv(pg, "#hero-borderWidth", 4)
    setv(pg, "#hero-circleColor", "#aa3355"); setv(pg, "#hero-circleSize", 30); setv(pg, "#hero-lineColor", "#118833")
    pg.fill("#hero-heading", "Hello Lovely Readers"); pg.fill("#hero-subtitle", "My own subtitle"); pg.fill("#hero-btn1", "Start reading"); pg.fill("#hero-btn2", "Subscribe now"); pg.fill("#hero-heroNote", "hi there")
    pg.select_option("#hero-textAlign", "center"); setv(pg, "#hero-padTop", 3); setv(pg, "#hero-padBottom", 2)
    pg.wait_for_timeout(300)
    check("hero preview: inner arch colour updates live", css(pg, "#heroStage .arch.two", "backgroundColor") == rgb("#224466"))
    check("hero preview: outer arch colour + border colour update live", css(pg, "#heroStage .arch:not(.two)", "backgroundColor") == rgb("#ffeedd") and css(pg, "#heroStage .arch:not(.two)", "borderTopColor") == rgb("#112233"))
    check("hero preview: heading, subtitle, buttons, note update live", "Hello Lovely Readers" in pg.inner_text("#heroStage h1") and "My own subtitle" in pg.inner_text("#heroStage .tagline") and "Start reading" in pg.inner_text("#heroStage") and "hi there" in pg.inner_text("#heroStage .hand-note"))
    check("hero preview: image fit / position update live", css(pg, "#heroStage img.hero-img", "objectFit") == "contain" and css(pg, "#heroStage img.hero-img", "objectPosition") == "20% 80%")
    pg.click('[data-d="save"]'); pg.wait_for_selector(".toast >> text=Homepage hero saved"); pg.wait_for_timeout(300)
    check("hero: clear 'saved' message shown", "Saved at" in pg.inner_text("#dstate") and "Open the website" in pg.inner_text(".toasts"))

    # ---------- hero persistence on the REAL homepage ----------
    def hero_checks(page, label):
        page.wait_for_selector(".hero-art"); page.wait_for_function("(()=>{const i=document.querySelector('.hero-art img.hero-img');return i&&i.complete&&i.naturalWidth>0})()")
        check(f"hero {label}: photo is shown inside the arch", page.locator(".hero-art .arch.two img.hero-img").count() == 1)
        check(f"hero {label}: arch colours + border applied", css(page, ".hero-art .arch.two", "backgroundColor") == rgb("#224466") and css(page, ".hero-art .arch:not(.two)", "backgroundColor") == rgb("#ffeedd") and css(page, ".hero-art .arch:not(.two)", "borderTopWidth") == "4px")
        check(f"hero {label}: photo fit and position applied", css(page, ".hero-img", "objectFit") == "contain" and css(page, ".hero-img", "objectPosition") == "20% 80%")
        check(f"hero {label}: circle colour/size + line colour applied", css(page, ".hero-art .orb", "backgroundColor") == rgb("#aa3355") and css(page, ".hero-art svg.flourish", "stroke") == rgb("#118833"))
        check(f"hero {label}: words and buttons applied", page.inner_text("h1").strip() == "Hello Lovely Readers" and "My own subtitle" in page.inner_text(".hero .tagline") and "Start reading" in page.inner_text(".hero") and "Subscribe now" in page.inner_text(".hero") and "hi there" in page.inner_text(".hand-note"))
        check(f"hero {label}: alignment + spacing applied", css(page, ".hero-text", "textAlign") == "center" and css(page, ".hero", "paddingBottom") in ("32px",))
        w = page.evaluate("(()=>{const a=document.querySelector('.hero-art'),o=document.querySelector('.hero-art .arch:not(.two)');return Math.round(o.offsetWidth/a.offsetWidth*100)})()")
        check(f"hero {label}: arch width setting applied (70%)", w == 70, str(w))
    go_home_ctx.reload(); hero_checks(go_home_ctx, "after save + reload")
    go_home_ctx.close()
    pg2 = ctx.new_page(); pg2.goto(BASE); hero_checks(pg2, "in a brand-new tab"); pg2.close()

    # ---------- hero: cancel / library / remove / toggles / reset ----------
    go(pg, "#/admin/hero"); pg.wait_for_selector("#heroStage .hero")
    check("hero editor reopens with saved values", pg.input_value("#hero-heading") == "Hello Lovely Readers" and pg.input_value("#hero-innerColor") == "#224466")
    setv(pg, "#hero-innerColor", "#000000"); pg.click('[data-d="cancel"]'); confirm_yes(pg); pg.wait_for_selector("#heroStage .hero")
    check("hero: Cancel discards unsaved changes", pg.input_value("#hero-innerColor") == "#224466")
    pg.click('[data-d="hlib"]'); pg.wait_for_selector("dialog.lib .lib-item")
    check("hero: picture library lists saved pictures", pg.locator("dialog.lib .lib-item").count() >= 1)
    pg.click("dialog.lib .lib-item >> nth=0"); pg.wait_for_timeout(500)
    check("hero: choosing from the library works", pg.locator("#heroStage img.hero-img").count() == 1)
    pg.click('[data-d="hrm"]'); pg.wait_for_timeout(300)
    check("hero: Remove photo shows solid arch by default", pg.locator("#heroStage img.hero-img").count() == 0 and pg.locator("#heroStage .hero-ph").count() == 0)
    pg.select_option("#hero-noImage", "placeholder"); pg.wait_for_timeout(300)
    check("hero: no-photo option 'placeholder' shows a placeholder picture", pg.locator("#heroStage .hero-ph svg").count() == 1)
    tick(pg, "#hero-showCircle", False); tick(pg, "#hero-showLine", False); tick(pg, "#hero-showOuter", False); pg.wait_for_timeout(200)
    check("hero preview: show/hide circle, line and outer arch", pg.locator("#heroStage .orb").count() == 0 and pg.locator("#heroStage svg.flourish").count() == 0 and pg.locator("#heroStage .arch:not(.two)").count() == 0)
    save(pg); go(pg, ""); pg.wait_for_selector(".hero")
    check("hero: hidden parts are really hidden on the live homepage", pg.locator(".orb").count() == 0 and pg.locator(".hero-art svg.flourish").count() == 0 and pg.locator(".hero-art .arch:not(.two)").count() == 0 and pg.locator(".hero-ph svg").count() == 1)
    go(pg, "#/admin/hero"); pg.wait_for_selector("#heroStage .hero")
    pg.click('[data-d="reset"]'); confirm_yes(pg); pg.wait_for_timeout(300)
    check("hero: Reset to Default loads the original design in the preview", pg.locator("#heroStage .orb").count() == 1 and pg.locator("#heroStage .hero-img").count() == 0 and "Blogs" in pg.inner_text("#heroStage h1") and pg.input_value("#hero-heroNote") == "welcome in")
    go(pg, ""); pg.wait_for_selector(".hero")
    check("hero: Reset is not saved until you press Save (live site unchanged)", pg.locator(".orb").count() == 0)
    go(pg, "#/admin/hero"); pg.wait_for_selector("#heroStage .hero"); pg.click('[data-d="reset"]'); confirm_yes(pg); save(pg)
    go(pg, ""); pg.wait_for_selector(".hero")
    check("hero: reset + save restores the original homepage design", pg.locator(".orb").count() == 1 and pg.locator(".hero-art svg.flourish").count() == 1 and pg.locator(".hero-art .arch:not(.two)").count() == 1)
    check("hero: original solid burgundy inner arch is back", css(pg, ".hero-art .arch.two", "backgroundColor").startswith("rgba(111, 38, 61") or css(pg, ".hero-art .arch.two", "backgroundColor").startswith("rgb(111, 38, 61"), css(pg, ".hero-art .arch.two", "backgroundColor"))
    check("hero: original heading and tagline back", "Blogs By Mifrah" in pg.inner_text("h1") and "Your little corner of beauty" in pg.inner_text(".hero .tagline"))

    # ---------- article cards ----------
    go(pg, "#/admin/cards"); pg.wait_for_selector("#cfeed .card")
    check("card designer opens with a live preview of real cards", pg.locator("#cfeed .card").count() >= 3 and pg.locator(".cardrow").count() == 9)
    check("card designer: default is the Modern Magazine card (image on top, rounded, category chip)", css(pg, "#cfeed .card", "borderTopLeftRadius") == "18px" and pg.evaluate("(()=>{const c=document.querySelector('#cfeed .card'),i=c.querySelector('.cover').getBoundingClientRect(),t=c.querySelector('h3').getBoundingClientRect();return i.bottom<=t.top})()"))
    setv(pg, "#card-radius", 4); setv(pg, "#card-bg", "#fff0f0"); setv(pg, "#card-titleColor", "#0a5a2a"); setv(pg, "#card-summaryColor", "#222233"); setv(pg, "#card-catColor", "#ffffff"); setv(pg, "#card-catBg", "#7a1f3d")
    setv(pg, "#card-borderColor", "#445566"); setv(pg, "#card-borderWidth", 3); setv(pg, "#card-shadow", 80); setv(pg, "#card-pad", 2); setv(pg, "#card-titleSize", 2); setv(pg, "#card-summarySize", 1.1)
    pg.select_option("#card-ratio", "1/1"); pg.select_option("#card-titleFont", "georgia"); pg.select_option("#card-hover", "lift"); setv(pg, "#card-speed", 800)
    pg.wait_for_timeout(300)
    check("card preview: radius, background, border update live", css(pg, "#cfeed .card", "borderTopLeftRadius") == "4px" and css(pg, "#cfeed .card", "backgroundColor") == rgb("#fff0f0") and css(pg, "#cfeed .card", "borderTopWidth") == "3px" and css(pg, "#cfeed .card", "borderTopColor") == rgb("#445566"))
    check("card preview: title/summary/category colours update live", css(pg, "#cfeed .card h3", "color") == rgb("#0a5a2a") and css(pg, "#cfeed .card .excerpt", "color") == rgb("#222233") and css(pg, "#cfeed .card .cat", "backgroundColor") == rgb("#7a1f3d") and css(pg, "#cfeed .card .cat", "color") == rgb("#ffffff"))
    check("card preview: image shape, padding, title size, font update live", pg.evaluate("(()=>{const c=document.querySelector('#cfeed .card .cover').getBoundingClientRect();return Math.abs(c.width-c.height)<2})()") and css(pg, "#cfeed .card .body", "paddingTop") == "32px" and css(pg, "#cfeed .card h3", "fontSize") == "32px" and "Georgia" in css(pg, "#cfeed .card h3", "fontFamily"))
    check("card preview: shadow is visible", css(pg, "#cfeed .card", "boxShadow") != "none")
    tick(pg, "#card-showSummary", False); tick(pg, "#card-showDate", False); tick(pg, "#card-showMore", False); pg.wait_for_timeout(200)
    check("card preview: show/hide summary, date, read-article indicator", css(pg, "#cfeed .card .excerpt", "display") == "none" and css(pg, "#cfeed .card .m-date", "display") == "none" and css(pg, "#cfeed .card .more", "display") == "none" and css(pg, "#cfeed .card .m-read", "display") != "none" and css(pg, "#cfeed .card .cat", "display") != "none")
    setv(pg, "#card-colsD", 2); setv(pg, "#card-gap", 50); pg.wait_for_timeout(200)
    check("card preview: cards per row + gap update live (desktop)", pg.evaluate("getComputedStyle(document.querySelector('#cfeed')).gridTemplateColumns.split(' ').length") == 2 and css(pg, "#cfeed", "columnGap") == "50px")
    pg.click('[data-d="dev"][data-v="M"]'); pg.wait_for_timeout(200)
    check("card preview: mobile preview uses the mobile column setting and a narrow width", pg.evaluate("getComputedStyle(document.querySelector('#cfeed')).gridTemplateColumns.split(' ').length") == 1 and pg.evaluate("document.querySelector('#cprev').getBoundingClientRect().width") <= 361)
    pg.click('[data-d="dev"][data-v="D"]')
    go_home_ctx = ctx.new_page(); go_home_ctx.goto(BASE); go_home_ctx.wait_for_selector(".feed .card")
    check("cards: live site unchanged until Save", css(go_home_ctx, ".feed .card", "borderTopLeftRadius") == "18px")
    go_home_ctx.close()
    save(pg)

    # ---------- cards: applied consistently everywhere ----------
    def card_checks(page, sel, label):
        page.wait_for_selector(sel)
        ok = css(page, sel, "borderTopLeftRadius") == "4px" and css(page, sel, "backgroundColor") == rgb("#fff0f0") and css(page, sel + " h3", "color") == rgb("#0a5a2a") and css(page, sel + " .excerpt", "display") == "none" and css(page, sel + " .m-date", "display") == "none"
        check(f"cards everywhere: {label}", ok, css(page, sel, "borderTopLeftRadius"))
    go(pg, ""); card_checks(pg, ".feed .card", "homepage article section")
    check("cards everywhere: homepage uses 2 columns", pg.evaluate("getComputedStyle(document.querySelector('#feed')).gridTemplateColumns.split(' ').length") == 2)
    for route, label in [("#/beauty", "Beauty & Self-Care"), ("#/lifestyle", "Lifestyle"), ("#/growth", "Personal Growth"), ("#/search?q=routine", "search results")]:
        go(pg, route); card_checks(pg, ".feed .card", label)
    go(pg, ""); pg.wait_for_selector(".feed .card"); pg.locator('.card [data-act="fav"]').nth(1).click(); pg.wait_for_timeout(200)
    go(pg, "#/favorites"); card_checks(pg, ".feed .card", "Favorites / reading list")
    go(pg, "#/beauty"); pg.locator(".card h3 a").first.click(); pg.wait_for_selector(".related .card"); card_checks(pg, ".related .card", "article page 'Keep reading'")
    go(pg, ""); pg.wait_for_selector(".feed .card.lead")
    check("cards everywhere: feature card (homepage newest) uses the design too", css(pg, ".feed .card.lead", "backgroundColor") == rgb("#fff0f0") and css(pg, ".feed .card.lead", "borderTopLeftRadius") == "4px")
    # hover animation really happens
    pg.locator(".feed .card").nth(2).scroll_into_view_if_needed(); pg.wait_for_timeout(1500); pg.locator(".feed .card").nth(2).hover(); pg.wait_for_timeout(1300)
    check("cards: hover animation 'lift' moves the card", "-6" in css(pg, ".feed .card:hover", "translate"), css(pg, ".feed .card:hover", "translate"))
    # whole card clickable -> correct article
    first_href = pg.locator(".feed .card h3 a").nth(2).get_attribute("href"); first_title = pg.locator(".feed .card h3 a").nth(2).inner_text()
    pg.locator(".feed .card").nth(2).click(position={"x": 40, "y": 40}); pg.wait_for_selector("#prose")
    check("cards: clicking anywhere on the card opens its own article", pg.url.endswith(first_href) and first_title in pg.inner_text("h1"))

    # persistence + reset + cancel
    pg.reload(); pg.wait_for_selector("#prose"); go(pg, ""); card_checks(pg, ".feed .card", "after a full page reload")
    go(pg, "#/admin/cards"); pg.wait_for_selector("#cfeed .card")
    check("card designer reopens with saved values", pg.input_value("#card-radius") == "4" and pg.input_value("#card-bg") == "#fff0f0")
    setv(pg, "#card-radius", 30); pg.click('[data-d="cancel"]'); confirm_yes(pg); pg.wait_for_selector("#cfeed .card")
    check("cards: Cancel discards unsaved changes", pg.input_value("#card-radius") == "4" and css(pg, "#cfeed .card", "borderTopLeftRadius") == "4px")
    go(pg, "#/admin/cards"); pg.wait_for_selector("#cfeed .card"); setv(pg, "#card-radius", 30); go(pg, "")
    pg.wait_for_selector(".feed .card")
    check("cards: leaving the designer without saving restores the saved look", css(pg, ".feed .card", "borderTopLeftRadius") == "4px")

    # ---------- individual cards ----------
    go(pg, "#/admin/cards"); pg.wait_for_selector("#cfeed .card")
    row = pg.locator(".cardrow").nth(1); aid = row.get_attribute("data-aid"); row.locator("summary").click()
    slug_before = pg.evaluate("(id)=>M.cache.articles.find(a=>a.id===id).slug", aid); content_before = pg.evaluate("(id)=>M.cache.articles.find(a=>a.id===id).content", aid)
    pg.fill(f"#t-{aid}", "My Renamed Card Title"); pg.fill(f"#x-{aid}", "A brand new summary for this card."); pg.select_option(f"#c-{aid}", "personal-growth"); pg.fill(f"#m-{aid}", "7")
    pg.set_input_files(f"#f-{aid}", card_img); pg.wait_for_function("(id)=>{const i=document.querySelector(`.cardrow[data-aid='${id}'] .cr-prev img`);return i&&i.complete&&i.naturalWidth>0}", arg=aid)
    pg.select_option(f"#ft-{aid}", "contain"); setv(pg, f"#px-{aid}", 20); setv(pg, f"#py-{aid}", 70); pg.fill(f"#a-{aid}", "A blue picture")
    prev = f'.cardrow[data-aid="{aid}"] .cr-prev'
    check("individual card: preview updates before saving", "My Renamed Card Title" in pg.inner_text(prev) and "7 min read" in pg.inner_text(prev) and css(pg, prev + " img", "objectFit") == "contain")
    go_home_ctx = ctx.new_page(); go_home_ctx.goto(BASE); go_home_ctx.wait_for_selector(".feed .card")
    check("individual card: live site unchanged until 'Save this card'", "My Renamed Card Title" not in go_home_ctx.inner_text("#feed")); go_home_ctx.close()
    pg.click(f'[data-d="rsave"][data-id="{aid}"]'); pg.wait_for_selector(".toast >> text=Card saved"); pg.wait_for_timeout(300)
    after = pg.evaluate("(id)=>{const a=M.cache.articles.find(a=>a.id===id);return {slug:a.slug,content:a.content,cat:a.category,mins:a.readMins}}", aid)
    check("individual card: article link (slug) and article text are untouched", after["slug"] == slug_before and after["content"] == content_before)
    go(pg, ""); pg.wait_for_selector(".feed .card"); card = pg.locator(".feed .card", has_text="My Renamed Card Title")
    check("individual card: new title/summary/reading time show on the homepage", card.count() == 1 and "7 min read" in card.inner_text() and "A brand new summary" in pg.evaluate("(id)=>M.cache.articles.find(a=>a.id===id).excerpt", aid) and "personal growth" in card.inner_text().lower(), card.inner_text() if card.count() else "no card")
    img = card.locator("img"); pg.wait_for_function("()=>{const i=[...document.querySelectorAll('.feed .card')].find(c=>c.textContent.includes('My Renamed Card Title')).querySelector('img');return i&&i.complete&&i.naturalWidth>0}")
    st = img.evaluate("e=>({f:getComputedStyle(e).objectFit,p:getComputedStyle(e).objectPosition})")
    check("individual card: replaced picture, fit and position show on the homepage", st["f"] == "contain" and st["p"] == "20% 70%", str(st))
    check("individual card: link still points to the same article", card.locator("h3 a").get_attribute("href") == "#/a/" + slug_before)
    card.locator("h3 a").click(); pg.wait_for_selector("#prose"); check("individual card: opens the correct article", "My Renamed Card Title" in pg.inner_text("h1") and "7 min read" in pg.inner_text(".article-meta"))
    go(pg, "#/beauty"); go(pg, "#/growth"); pg.wait_for_selector(".feed .card")
    check("individual card: change appears in the matching category page", "My Renamed Card Title" in pg.inner_text("#feed"))

    # ---------- design backup / restore ----------
    go(pg, "#/admin/backup"); pg.wait_for_selector('[data-act="ad-dexport"]')
    with pg.expect_download() as d: pg.click('[data-act="ad-dexport"]')
    dfile = os.path.join(tmp, "design.json"); d.value.save_as(dfile); dj = json.load(open(dfile))
    check("design backup: file holds hero, card settings and theme", dj["app"] == "blogs-by-mifrah-design" and dj["card"]["radius"] == 4 and "hero" in dj and "theme" in dj)
    # make hero distinctive with a photo, export, wreck it, restore
    go(pg, "#/admin/hero"); pg.wait_for_selector("#heroStage .hero"); pg.set_input_files("#hero-file", hero_img); pg.wait_for_selector("#heroStage img.hero-img"); setv(pg, "#hero-innerColor", "#334455"); pg.fill("#hero-heading", "Backup Test Heading"); save(pg)
    go(pg, "#/admin/backup"); pg.wait_for_selector('[data-act="ad-dexport"]')
    with pg.expect_download() as d: pg.click('[data-act="ad-dexport"]')
    d.value.save_as(dfile); dj = json.load(open(dfile))
    check("design backup: hero photo is included in the file", len(dj["images"]) == 1 and dj["images"][0]["dataUrl"].startswith("data:image/") and dj["hero"]["imageId"] == dj["images"][0]["id"])
    go(pg, "#/admin/hero"); pg.wait_for_selector("#heroStage .hero"); pg.click('[data-d="reset"]'); confirm_yes(pg); save(pg)
    go(pg, "#/admin/cards"); pg.wait_for_selector("#cfeed .card"); pg.click('[data-d="reset"]'); confirm_yes(pg); save(pg)
    go(pg, ""); pg.wait_for_selector(".feed .card")
    check("design backup: after resetting, site is back to defaults", css(pg, ".feed .card", "borderTopLeftRadius") == "18px" and "Blogs By Mifrah" in pg.inner_text("h1"))
    go(pg, "#/admin/backup"); pg.wait_for_selector("#design-file"); pg.set_input_files("#design-file", dfile); confirm_yes(pg); pg.wait_for_selector(".toast >> text=Design restored"); pg.wait_for_timeout(500)
    go(pg, ""); pg.wait_for_selector(".hero-art img.hero-img"); pg.wait_for_function("(()=>{const i=document.querySelector('.hero-art img.hero-img');return i&&i.complete&&i.naturalWidth>0})()")
    check("design backup: restore brings back hero photo, heading, colour", pg.inner_text("h1").strip() == "Backup Test Heading" and css(pg, ".hero-art .arch.two", "backgroundColor") == rgb("#334455"))
    check("design backup: restore leaves articles alone (my renamed card still there)", "My Renamed Card Title" in pg.inner_text("#feed") or pg.evaluate("M.cache.articles.some(a=>a.title==='My Renamed Card Title')"))
    bad = os.path.join(tmp, "bad.json"); open(bad, "w").write('{"app":"nope"}')
    go(pg, "#/admin/backup"); pg.wait_for_selector("#design-file"); pg.set_input_files("#design-file", bad); confirm_yes(pg); pg.wait_for_selector(".toast.err")
    check("design backup: a wrong file is refused with a clear message", "design file" in pg.inner_text(".toast.err"))
    evil = os.path.join(tmp, "evil.json"); open(evil, "w").write(json.dumps({"app": "blogs-by-mifrah-design", "version": 1, "hero": {"innerColor": "red;background:url(http://x)", "padTop": 9999, "heading": "x" * 500, "imageId": "../../x"}, "card": {"radius": "<script>", "hover": "bogus"}, "images": []}))
    go(pg, "#/admin/backup"); pg.wait_for_selector("#design-file"); pg.set_input_files("#design-file", evil); confirm_yes(pg); pg.wait_for_timeout(800)
    s = pg.evaluate("({h:M.cache.hero,c:M.cache.card})")
    check("design backup: hostile/out-of-range values are cleaned, not trusted", s["h"]["innerColor"] is None and s["h"]["padTop"] == 10 and len(s["h"]["heading"]) <= 80 and s["h"]["imageId"] == "" and s["c"]["radius"] == 18 and s["c"]["hover"] == "both")
    # full backup includes design, and full reset/restore round-trips it
    go(pg, "#/admin/hero"); pg.wait_for_selector("#heroStage .hero"); pg.fill("#hero-heading", "Full Backup Heading"); save(pg)
    go(pg, "#/admin/backup"); pg.wait_for_selector('[data-act="ad-export"]')
    with pg.expect_download() as d: pg.click('[data-act="ad-export"]')
    full = os.path.join(tmp, "full.json"); d.value.save_as(full); fj = json.load(open(full))
    check("full backup: includes the hero and card design settings", any(k["key"] == "hero" for k in fj["data"]["kv"]) and any(k["key"] == "card" for k in fj["data"]["kv"]))
    pg.click('[data-act="ad-reset"]'); confirm_yes(pg); pg.wait_for_timeout(1200); go(pg, ""); pg.wait_for_selector(".feed .card")
    check("full reset: design returns to defaults too", "Blogs By Mifrah" in pg.inner_text("h1") and css(pg, ".feed .card", "borderTopLeftRadius") == "18px")
    go(pg, "#/admin/backup"); pg.wait_for_selector("#restore-file"); pg.set_input_files("#restore-file", full); confirm_yes(pg); pg.wait_for_timeout(1500)
    go(pg, ""); pg.wait_for_selector(".feed .card")
    check("full restore: hero heading and card changes come back", pg.inner_text("h1").strip() == "Full Backup Heading" and "My Renamed Card Title" in pg.inner_text("#feed"))

    # ---------- default look sanity, dark mode, other features still there ----------
    check("old features: 9 articles incl. my edited one, search + filters present", pg.locator(".feed .card").count() == 9 and pg.locator("#fq").count() == 1 and pg.locator("#fc").count() == 1)
    dk = b.new_context(viewport={"width": 1280, "height": 900}, color_scheme="dark"); dp = dk.new_page(); dp.goto(BASE); dp.wait_for_selector(".card"); dp.wait_for_timeout(600)
    bg = css(dp, ".feed .card", "backgroundColor"); import re
    nums = [float(x) for x in re.findall(r"[\d.]+", bg)[:3]]; scale = 1 if bg.startswith("color(") else 255
    check("dark mode (OS dark, no manual choice): default cards stay dark and readable", sum(nums) / 3 / scale < 0.3, bg)
    dk.close()

    # ---------- mobile ----------
    m = b.new_context(viewport={"width": 375, "height": 800}, is_mobile=True, has_touch=True); mp = m.new_page(); merr = []
    mp.on("pageerror", lambda e: merr.append(str(e)))
    mp.goto(BASE); mp.wait_for_selector(".card"); mp.wait_for_timeout(800)
    ov = lambda page: page.evaluate("document.documentElement.scrollWidth - innerWidth")
    check("mobile: homepage hero + cards have no horizontal overflow", ov(mp) <= 1, str(ov(mp)))
    check("mobile: cards are one per row", mp.evaluate("getComputedStyle(document.querySelector('#feed')).gridTemplateColumns.split(' ').length") == 1)
    mp.evaluate("sessionStorage.setItem('adminOK','1')")
    for route, sel, label in [("#/admin/hero", "#heroStage .hero", "hero editor"), ("#/admin/cards", "#cfeed .card", "card designer")]:
        mp.goto(BASE + route); mp.reload(); mp.wait_for_selector(sel); mp.wait_for_timeout(700)
        check(f"mobile: {label} has no horizontal overflow", ov(mp) <= 1, str(ov(mp)))
        check(f"mobile: {label} preview + save bar visible", mp.is_visible('[data-d="save"]') or mp.locator('[data-d="save"]').count() == 1)
    mp.goto(BASE + "#/admin/hero"); mp.reload(); mp.wait_for_selector("#heroStage .hero"); mp.wait_for_timeout(600)
    wrapw = mp.evaluate("document.querySelector('#heroWrap').getBoundingClientRect().width")
    check("mobile: hero editor preview fits the screen", wrapw <= 375, str(wrapw))
    check("mobile: no JS errors", not merr, str(merr))
    m.close()

    # reduced motion: card hover transition effectively disabled, content visible
    rm = b.new_context(reduced_motion="reduce"); rp = rm.new_page(); rp.goto(BASE); rp.wait_for_selector(".card"); rp.wait_for_timeout(300)
    check("reduced motion: hero and cards visible immediately", rp.evaluate("[...document.querySelectorAll('.reveal')].every(e=>getComputedStyle(e).opacity==='1')") and rp.evaluate("parseFloat(getComputedStyle(document.querySelector('.card')).transitionDuration)<0.01"))
    rm.close()

    bad = [e for e in errors if "favicon" not in e]
    check("no console errors/warnings or failed requests during the whole run", not bad, "; ".join(bad[:5]))
    b.close()
finally:
    srv.terminate()

fails = [r for r in results if not r[1]]
print(f"\nTOTAL {len(results)} checks, {len(fails)} failed")
sys.exit(1 if fails else 0)
