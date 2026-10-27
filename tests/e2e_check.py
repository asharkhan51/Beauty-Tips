"""End-to-end checks driven through a real Chromium browser (Playwright).
Run:  python3 tests/e2e_check.py      (needs: pip install playwright && playwright install chromium)
Prints PASS/FAIL per check; exit code 1 if any fail."""
import subprocess, sys, time, os, struct, zlib, tempfile, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8765
results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))

def png(path, w=640, h=400):
    raw = b"".join(b"\x00" + bytes([200, 120, 140] * w) for _ in range(h))
    def ch(t, d): c = struct.pack(">I", len(d)) + t + d; return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b""))

srv = subprocess.Popen(["node", "server.js"], cwd=ROOT, env={**os.environ, "PORT": str(PORT)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
BASE = f"http://localhost:{PORT}/"
def go(pg, hash_):
    pg.goto(BASE + hash_); pg.wait_for_timeout(500)
tmp = tempfile.mkdtemp(); img = os.path.join(tmp, "cover.png"); png(img)

try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
    pg = ctx.new_page(); errors = []; failed = []
    pg.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
    pg.on("requestfailed", lambda r: failed.append(r.url))
    pg.on("response", lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)
    ext = []; pg.on("request", lambda r: ext.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith("data:") and not r.url.startswith("blob:") else None)

    # ---- home ----
    pg.goto(BASE); pg.wait_for_selector(".card")
    check("home: h1 shows the site name", "Blogs By Mifrah" in pg.inner_text("h1"))
    check("home: exact tagline present", "Your little corner of beauty, growth, and everyday life." in pg.inner_text(".hero .tagline"))
    check("home: 9 demo articles rendered newest-first", pg.locator(".feed .card").count() == 9)
    dates = pg.eval_on_selector_all(".feed .card .meta span:nth-child(2)", "els=>els.map(e=>new Date(e.textContent).getTime())")
    check("home: feed is chronological newest-first", dates == sorted(dates, reverse=True), str(dates))
    check("home: first card is the larger lead article", pg.locator(".feed .card.lead").count() == 1)
    pg.click("text=Explore the latest articles"); pg.wait_for_timeout(900)
    check("home: CTA scrolls to the article list", pg.evaluate("document.querySelector('#latest').getBoundingClientRect().top < 200"))
    check("home: no external requests (fully local)", not ext, str(ext))

    # ---- search & filters ----
    pg.fill("#fq", "skincare"); pg.wait_for_timeout(400)
    n_sk = pg.locator(".feed .card").count()
    check("search: 'skincare' narrows results", 0 < n_sk < 9, str(n_sk))
    pg.fill("#fq", "zzzznotfound"); pg.wait_for_timeout(400)
    check("search: empty state shown for no matches", pg.locator(".empty").count() == 1)
    pg.click("[data-chip=reset]"); pg.wait_for_timeout(300)
    check("filters: reset restores all 9", pg.locator(".feed .card").count() == 9)
    pg.select_option("#fc", "lifestyle"); pg.wait_for_timeout(200)
    check("filters: category = 3 articles", pg.locator(".feed .card").count() == 3)
    pg.click("[data-chip=beauty]"); pg.wait_for_timeout(200)
    check("filters: category + beauty combine (lifestyle has no beauty tags)", pg.locator(".feed .card").count() == 0)
    pg.click("[data-chip=reset]")
    pg.fill("#fq", "ingredients"); pg.wait_for_timeout(300)
    check("search: matches tags", pg.locator(".feed .card").count() == 1)
    pg.click("[data-chip=reset]")
    pg.select_option("#ft", "short"); pg.wait_for_timeout(200)
    check("filters: reading-time filter works", pg.locator(".feed .card").count() == 9)

    # ---- category page ----
    go(pg, "#/beauty"); pg.wait_for_selector(".card")
    check("category page lists only its 3 articles", pg.locator(".feed .card").count() == 3 and "Beauty, Skincare" in pg.inner_text("h1"))

    # ---- article ----
    pg.goto(BASE); pg.wait_for_selector(".card"); pg.locator(".card h3 a").first.click(); pg.wait_for_selector("#prose")
    check("article: title, reading time, single h1", pg.locator("h1").count() == 1 and "min read" in pg.inner_text(".article-meta"))
    check("article: markdown rendered with headings", pg.locator("#prose h2").count() >= 2)
    pg.click('[data-act="sizeup"]'); size = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--reading-size')")
    check("reader: text size changes", "1.25" in size, size)
    pg.click('.reader-tools [data-act="mode"]'); pg.wait_for_timeout(200)
    check("reader: dark mode toggles", pg.evaluate("document.documentElement.dataset.mode") == "dark")
    pg.click('[data-act="focus"]')
    check("reader: focus mode hides footer and keeps tools", not pg.is_visible("#footer") and pg.is_visible('[data-act="focus"]'))
    pg.keyboard.press("Escape"); check("reader: Esc leaves focus mode", pg.is_visible("#footer"))
    pg.click('.reader-tools [data-act="fav"]'); pg.wait_for_timeout(100)
    check("article: save to favorites", pg.get_attribute('.reader-tools [data-act="fav"]', "aria-pressed") == "true")
    pg.click('[data-act="copylink"]'); pg.wait_for_selector(".toast")
    clip = pg.evaluate("navigator.clipboard.readText()")
    check("article: copy link puts the URL on the clipboard", clip == pg.url, clip)
    pg.click('.react[data-kind="love"]'); pg.wait_for_timeout(100)
    check("reactions: count increments and button pressed", pg.inner_text('.react[data-kind="love"] .n') == "1" and pg.get_attribute('.react[data-kind="love"]', "aria-pressed") == "true")
    pg.click('.react[data-kind="love"]'); pg.wait_for_timeout(150)
    check("reactions: clicking again removes it (no stacking)", pg.inner_text('.react[data-kind="love"] .n') == "0")
    pg.click('.react[data-kind="helpful"]')
    pg.fill("#cmn", "Reader"); pg.fill("#cmb", "Lovely outline!"); pg.click("form[data-form=comment] button[type=submit]"); pg.wait_for_timeout(300)
    check("comments: submission stays pending, not shown publicly", "waiting for approval" in pg.inner_text("#cmm") and "Lovely outline" not in pg.inner_text(".comments-wrap").split("Reader")[0])
    pg.fill("#cmn", "Again"); pg.fill("#cmb", "second"); pg.click("form[data-form=comment] button[type=submit]"); pg.wait_for_timeout(200)
    check("comments: rapid second comment is rate-limited", "wait" in pg.inner_text("#cmm").lower())
    check("article: related articles shown", pg.locator(".related .card").count() >= 1)
    # progress bar moves
    pg.evaluate("window.scrollTo(0, document.body.scrollHeight/2)"); pg.wait_for_timeout(300)
    check("article: reading progress bar advances", pg.evaluate("parseFloat(getComputedStyle(document.querySelector('#progress')).transform.split(',')[0].replace('matrix(',''))") > 0.05)

    # ---- favorites persistence ----
    go(pg, "#/favorites"); pg.wait_for_selector(".card"); n1 = pg.locator(".card").count()
    pg.reload(); pg.wait_for_selector(".card")
    check("favorites: persist across reload", n1 == 1 and pg.locator(".card").count() == 1)
    pg.click(".save-btn"); pg.wait_for_selector(".empty")
    check("favorites: removal shows empty state", "empty" in pg.inner_text(".empty").lower())

    # ---- newsletter / contact ----
    go(pg, "#/newsletter"); pg.fill("#nl-page", "not-an-email"); pg.click("form[data-form=newsletter] button")
    check("newsletter: invalid email rejected", "valid email" in pg.inner_text("#nl-page-m"))
    pg.fill("#nl-page", "Reader@Example.com"); pg.click("form[data-form=newsletter] button"); pg.wait_for_timeout(300)
    check("newsletter: valid email saved, honest wording (no email sent)", "No email is sent" in pg.inner_text("#nl-page-m"))
    pg.wait_for_timeout(4200); pg.fill("#nl-page", "reader@example.com"); pg.click("form[data-form=newsletter] button"); pg.wait_for_timeout(300)
    check("newsletter: duplicate handled", "already" in pg.inner_text("#nl-page-m"))
    go(pg, "#/contact"); pg.click("form[data-form=contact] button"); 
    check("contact: validation message on empty form", "name" in pg.inner_text("#cform-m").lower())
    pg.fill("#cn", "Sam"); pg.fill("#ce", "sam@example.com"); pg.fill("#cs", "Hi"); pg.fill("#cm", "Hello there Mifrah"); pg.click("form[data-form=contact] button"); pg.wait_for_timeout(300)
    check("contact: saved with honest 'not emailed' wording", "not been emailed" in pg.inner_text("#cform-m"))
    go(pg, "#/does-not-exist"); check("404 page shown", "wandered off" in pg.inner_text("h1"))
    go(pg, "#/a/not-a-real-article"); check("missing article shows 404", "wandered off" in pg.inner_text("h1"))

    # ---- admin: setup & article lifecycle ----
    go(pg, "#/admin"); pg.wait_for_selector("form[data-form=adminsetup]")
    pg.fill("#p1", "secret1"); pg.fill("#p2", "different"); pg.click("form[data-form=adminsetup] button[type=submit]")
    check("admin: mismatched passcodes rejected", "don’t match" in pg.inner_text("#am"))
    pg.fill("#p2", "secret1"); pg.click("form[data-form=adminsetup] button[type=submit]"); pg.wait_for_selector(".stats")
    check("admin: dashboard opens after setting passcode", pg.locator(".stat").count() == 6)
    pg.click('[data-act="ad-lock"]'); pg.wait_for_selector("form[data-form=adminlogin]")
    pg.fill("#pw", "wrong"); pg.click("form[data-form=adminlogin] button"); pg.wait_for_timeout(500)
    check("admin: wrong passcode refused", "isn’t right" in pg.inner_text("#am"))
    pg.fill("#pw", "secret1"); pg.click("form[data-form=adminlogin] button"); pg.wait_for_selector(".stats")
    check("admin: correct passcode unlocks", True)
    check("admin: passcode stored hashed, not in plain text", "secret1" not in pg.evaluate("""new Promise(r=>{const q=indexedDB.open('blogs-by-mifrah');q.onsuccess=()=>{const t=q.result.transaction('kv').objectStore('kv').getAll();t.onsuccess=()=>r(JSON.stringify(t.result))}})"""))

    go(pg, "#/admin/edit/new"); pg.wait_for_selector("#f-title")
    pg.fill("#f-title", "My <b>first</b> real post"); 
    check("editor: slug auto-fills from title", pg.input_value("#f-slug") == "my-b-first-b-real-post")
    pg.fill("#f-content", "## Hello\n\nThis is **my** own words with <script>alert(1)</script> inside.\n\n- one\n- two\n"); pg.fill("#f-excerpt", "A short excerpt.")
    check("editor: live word count / reading time", "words" in pg.inner_text("#wc"))
    pg.wait_for_timeout(1700); check("editor: autosave indicator appears", "autosaved" in pg.inner_text("#saveState"))
    pg.set_input_files("#cover-file", img); pg.wait_for_timeout(1200)
    check("editor: cover image uploaded and previewed", pg.locator("#coverPick img").count() == 1)
    pg.fill("#f-alt", "A pink square"); pg.click('[data-act="ad-save"]'); pg.wait_for_timeout(500)
    check("editor: save works and URL becomes the article's edit URL", "/admin/edit/" in pg.url and "Saved" in pg.inner_text("#saveState"))
    pg.click('[data-act="ad-publish"]'); pg.wait_for_timeout(700)
    pg.goto(BASE); pg.wait_for_selector(".card")
    check("publish: new article appears first on home", "real post" in pg.inner_text(".feed .card >> nth=0"))
    check("publish: cover image actually rendered from local storage", pg.evaluate("(()=>{const i=document.querySelector('.feed .card img');return !!i&&i.complete&&i.naturalWidth>0})()"))
    pg.locator(".feed .card h3 a").first.click(); pg.wait_for_selector("#prose")
    check("security: script tag in article is escaped, not executed", pg.locator("#prose script").count() == 0 and "alert(1)" in pg.inner_text("#prose"))
    # drafts private
    go(pg, "#/admin/edit/new"); pg.fill("#f-title", "Secret draft"); pg.fill("#f-content", "Draft body text."); pg.click('[data-act="ad-save"]'); pg.wait_for_timeout(500)
    pg.goto(BASE); pg.wait_for_selector(".card")
    check("drafts: not visible on public home", "Secret draft" not in pg.inner_text("#feed"))
    go(pg, "#/a/secret-draft"); check("drafts: direct URL shows 404", "wandered off" in pg.inner_text("h1"))
    go(pg, "#/a/secret-draft?preview=1"); pg.wait_for_selector("#prose"); check("drafts: owner preview works", "Preview" in pg.inner_text("article"))
    # scheduling
    go(pg, "#/admin/edit/new"); pg.fill("#f-title", "Future post"); pg.select_option("#f-status", "scheduled")
    fut = (time.strftime("%Y-%m-%dT%H:%M", time.localtime(time.time() + 86400 * 3))); pg.fill("#f-date", fut); pg.click('[data-act="ad-save"]'); pg.wait_for_timeout(500)
    pg.goto(BASE); pg.wait_for_selector(".card")
    check("scheduling: future post hidden until its time", "Future post" not in pg.inner_text("#feed"))
    # revisions
    go(pg, "#/admin/articles"); pg.locator("a:has-text('My <b>first</b> real post')").first.click(); pg.wait_for_selector("#f-title")
    pg.fill("#f-content", "## Hello\n\nEdited body."); pg.click('[data-act="ad-save"]'); pg.wait_for_timeout(500); pg.reload(); pg.wait_for_selector("#f-title")
    check("revisions: history lists versions", pg.locator('[data-act="ad-restore"]').count() >= 1)
    pg.locator('[data-act="ad-restore"]').first.click(); pg.wait_for_selector("dialog[open]"); pg.click("dialog button[value=yes]"); pg.wait_for_timeout(800)
    check("revisions: restore brings old text back", "own words" in pg.input_value("#f-content"))
    check("revisions: restore added a new version (nothing lost)", pg.locator("li:has-text('Restored from')").count() >= 1)
    # autosave restore: type without saving, leave, come back -> text is recovered
    edit_url = pg.url; pg.fill("#f-title", "Unsaved title change"); pg.wait_for_timeout(1700)
    go(pg, "#/admin"); pg.goto(edit_url); pg.reload(); pg.wait_for_selector("#f-title"); pg.wait_for_timeout(300)
    check("autosave: unsaved edits are recovered when returning", pg.input_value("#f-title") == "Unsaved title change" and "autosaved draft" in pg.inner_text("#amain"))
    pg.click('[data-act="ad-discard-auto"]'); pg.wait_for_timeout(500)
    check("autosave: discarding restores the saved title", "real post" in pg.input_value("#f-title"))
    # comments moderation
    go(pg, "#/admin/comments"); pg.wait_for_selector(".panel")
    check("moderation: pending comment listed", "Lovely outline" in pg.inner_text("#amain"))
    pg.click('[data-act="ad-cstat"][data-s="approved"]'); pg.wait_for_timeout(500)

    # ---- look & feel ----
    pg.evaluate("localStorage.setItem('mode', '\"light\"')"); go(pg, "#/admin/look"); pg.reload(); pg.wait_for_selector("#burgundy")
    pg.evaluate("(()=>{const e=document.querySelector('#burgundy');e.value='#1f5f4a';e.dispatchEvent(new Event('input',{bubbles:true}))})()"); pg.wait_for_timeout(300)
    check("look: colour change applies live", pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--burgundy').trim().toLowerCase()") == "#1f5f4a")
    check("look: card style + columns moved to the Article Card Designer (link shown)", pg.locator("a[href='#/admin/cards']").count() >= 1 and pg.locator("#cols, #card").count() == 0)
    pg.evaluate("(()=>{const e=document.querySelector('#burgundy');e.value='#fdf6ee';e.dispatchEvent(new Event('input',{bubbles:true}))})()"); pg.wait_for_timeout(200)
    check("look: low-contrast warning shown", "⚠" in pg.inner_text("#contrast"))
    pg.evaluate("(()=>{const e=document.querySelector('#burgundy');e.value='#1f5f4a';e.dispatchEvent(new Event('input',{bubbles:true}))})()"); pg.wait_for_timeout(700)
    pg.reload(); pg.wait_for_selector("#burgundy")
    check("look: theme persists after reload", pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--burgundy').trim().toLowerCase()") == "#1f5f4a")

    # ---- site content ----
    go(pg, "#/admin/content"); pg.wait_for_selector("#siteName"); pg.fill("#instagram", "javascript:alert(1)"); pg.click('[data-act="ad-savecontent"]'); pg.wait_for_selector(".toast.err")
    check("content: unsafe Instagram link rejected", True)
    pg.fill("#instagram", "https://instagram.com/example"); pg.fill("#aboutBody", "My own words."); pg.click('[data-act="ad-savecontent"]'); pg.wait_for_timeout(500)
    go(pg, "#/about"); check("content: About page shows her text", "My own words" in pg.inner_text(".prose"))
    check("content: Instagram link appears in footer only once set", pg.locator('#footer a:has-text("Instagram")').count() == 1)

    # ---- backup / restore / reset ----
    go(pg, "#/admin/backup"); pg.wait_for_selector('[data-act="ad-export"]')
    with pg.expect_download() as d: pg.click('[data-act="ad-export"]')
    bk = os.path.join(tmp, "backup.json"); d.value.save_as(bk); data = json.load(open(bk))
    check("backup: file contains articles, images, settings", len(data["data"]["articles"]) >= 11 and len(data["data"]["images"]) >= 1)
    pg.click('[data-act="ad-reset"]'); pg.wait_for_selector("dialog[open]"); pg.click("dialog button[value=yes]"); pg.wait_for_timeout(1200)
    pg.goto(BASE); pg.wait_for_selector(".card")
    check("reset: back to 9 demo articles, my post gone", pg.locator(".feed .card").count() == 9 and "real post" not in pg.inner_text("#feed"))
    go(pg, "#/admin"); 
    if pg.locator("form[data-form=adminsetup]").count(): pg.click('[data-act="ad-nopass"]')
    go(pg, "#/admin/backup"); pg.wait_for_selector("#restore-file"); pg.set_input_files("#restore-file", bk); pg.wait_for_selector("dialog[open]"); pg.click("dialog button[value=yes]"); pg.wait_for_timeout(1500)
    pg.goto(BASE); pg.wait_for_selector(".card")
    check("restore: my article and its cover come back", "real post" in pg.inner_text("#feed") and pg.evaluate("(()=>{const i=document.querySelector('.feed .card img');return !!i&&i.complete&&i.naturalWidth>0})()"))
    bad = os.path.join(tmp, "bad.json"); open(bad, "w").write('{"app":"other"}')
    go(pg, "#/admin/backup"); pg.wait_for_selector("#restore-file"); pg.set_input_files("#restore-file", bad); pg.wait_for_selector("dialog[open]"); pg.click("dialog button[value=yes]"); pg.wait_for_selector(".toast.err")
    pg.goto(BASE); pg.wait_for_selector(".card")
    check("restore: invalid file refused and data untouched", "real post" in pg.inner_text("#feed"))

    # ---- mobile ----
    m = b.new_context(viewport={"width": 375, "height": 740}); mp = m.new_page(); merr = []
    mp.on("pageerror", lambda e: merr.append(str(e)))
    mp.goto(BASE); mp.wait_for_selector(".card")
    check("mobile 375px: no horizontal overflow (home)", mp.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    check("mobile: menu hidden until opened", not mp.is_visible("#nav a >> nth=0"))
    mp.click('[data-act="menu"]'); mp.wait_for_timeout(500)
    check("mobile: menu opens (aria-expanded true)", mp.is_visible("#nav a >> nth=0") and mp.get_attribute('[data-act="menu"]', "aria-expanded") == "true")
    mp.goto(BASE + "#/admin"); mp.wait_for_timeout(600)
    mp.locator(".feed .card h3 a").first.click() if mp.locator(".feed .card").count() else None
    mp.goto(BASE + "#/a/" + "building-confidence-through-manageable-habits"); mp.wait_for_selector("#prose")
    check("mobile: article page no overflow", mp.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    check("mobile: tap targets at least 40px", mp.evaluate("[...document.querySelectorAll('.header-tools .icon-btn')].every(e=>e.getBoundingClientRect().height>=40)"))
    check("mobile: no JS errors", not merr, str(merr))

    # ---- reduced motion ----
    r = b.new_context(reduced_motion="reduce"); rp = r.new_page(); rp.goto(BASE); rp.wait_for_selector(".card")
    check("reduced motion: content visible immediately, no long animations",
          rp.evaluate("[...document.querySelectorAll('.reveal')].every(e=>getComputedStyle(e).opacity==='1')") and rp.evaluate("parseFloat(getComputedStyle(document.querySelector('.card')).transitionDuration)<0.01"))

    # ---- image reveal must not wait for the failsafe ----
    rv = b.new_context(viewport={"width": 1280, "height": 900}); rvp = rv.new_page(); rvp.goto(BASE + "#/a/building-confidence-through-manageable-habits"); rvp.wait_for_selector("#prose"); rvp.wait_for_timeout(1300)
    check("article cover is revealed promptly (not stuck until the failsafe)", rvp.evaluate("document.querySelector('.article-cover').classList.contains('in')"))
    # ---- contrast of button text in dark mode (auto + explicit) ----
    def contrast(pg_):
        return pg_.evaluate('''(()=>{const lum=c=>{const [r,g,b]=c.match(/\\d+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
          const els=[...document.querySelectorAll('.btn:not(.danger), .chip[aria-pressed=true]')];let worst=99;
          els.forEach(e=>{const cs=getComputedStyle(e);let bg=cs.backgroundColor;if(bg==='rgba(0, 0, 0, 0)')bg=getComputedStyle(document.body).backgroundColor;const a=lum(cs.color),b=lum(bg);const r=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);worst=Math.min(worst,r)});return worst})()''')
    dk = b.new_context(viewport={"width": 1280, "height": 900}, color_scheme="dark"); dkp = dk.new_page(); dkp.goto(BASE); dkp.wait_for_selector(".card"); dkp.wait_for_timeout(400)
    check("dark mode (auto from OS): button text contrast >= 4.5:1", contrast(dkp) >= 4.5, str(contrast(dkp)))
    dkp.goto(BASE + "#/admin"); dkp.wait_for_timeout(500)
    if dkp.locator('[data-act="ad-nopass"]').count(): dkp.click('[data-act="ad-nopass"]'); dkp.wait_for_timeout(600)
    check("dark mode admin: all button text contrast >= 4.5:1", contrast(dkp) >= 4.5, str(contrast(dkp)))
    lp = b.new_page(viewport={"width": 1280, "height": 900}); lp.goto(BASE); lp.wait_for_selector(".card"); lp.wait_for_timeout(300)
    check("light mode: button text contrast >= 4.5:1", contrast(lp) >= 4.5, str(contrast(lp)))
    # ---- errors ----
    real = [e for e in errors if "favicon" not in e]
    check("no console errors/warnings across the whole run", not real, str(real[:5]))
    check("no failed or 4xx network requests", not failed, str(failed[:5]))
    b.close()
finally:
    srv.terminate()
fails = [r for r in results if not r[1]]
print(f"\nTOTAL {len(results)} checks, {len(fails)} failed"); sys.exit(1 if fails else 0)
