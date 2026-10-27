# Blogs By Mifrah — run it on your own computer

No database, no accounts, no paid services. Everything is saved inside your web browser.

## Two ways to run it

**A. Double-click `start.bat`** (best). Needs Node.js (free, nodejs.org — install the "LTS" version, click Next through the installer).
It starts a tiny private server and opens http://localhost:8080. Close the black window to stop it.
If Node.js isn't installed, `start.bat` simply opens `index.html` for you (way B).

**B. Double-click `index.html`.** Works in Chrome, Edge and Firefox with no installation.

> **Important:** the two ways use *different storage areas* in your browser. Articles written in one will not appear in the other.
> Pick one way and always use it. To move between them: Dashboard → Backup & reset → download a backup, then restore it.

## First steps
1. Open the site, scroll down: nine **Demo** article outlines are there so the site isn't empty.
2. Footer → **Admin** → set a passcode (or skip).
3. **Articles → New article.** Write, add a cover photo, press **Publish now**.
4. When ready: Dashboard → Backup & reset → **Remove demo articles**.
5. **Look & feel** changes colours, fonts, theme and motion live. **Site content** edits the About page, tagline, sign-off and Instagram link.
6. **Homepage Hero Editor** (Dashboard menu, left side) controls the arch at the top of the homepage: photo (upload or pick a saved picture), arch colours and size, circle, curved line, heading, subtitle, button words, spacing. Change things, watch the preview, then press **Save changes**. *Cancel* throws away unsaved changes; *Reset to default* loads the original design into the preview (press Save to keep it).
7. **Article Card Designer** (Dashboard menu) designs the card used in *every* article list (homepage, the three categories, search, Saved articles, “Keep reading”): colours, corners, shadow, picture shape, text, hover animation, what to show, cards per row on desktop/tablet/mobile. Under the preview, open any article to change its card picture (with position and fitting), title, summary, category or reading time — each card has its own **Save this card** button. The article's web address never changes.
8. **Backup & reset → “Back up or restore only the design”** saves the hero (with its photo), card design, colours and fonts in one small file, separate from the full backup.

## Please read: how your data is stored
- Articles, images, comments, subscribers and settings live **only in this browser on this computer.**
- Clearing browser data, switching browser, or a new computer = they are gone. **Download a backup often** (Dashboard → Backup & reset).
- Backups include subscriber emails — keep the file private.
- Visitors on other devices cannot see this site; it is a local-first site. (To put it on the internet later you would host these same files on any static host — comments, reactions and subscribers would then be per-visitor-browser, so a hosted version needs a real backend.)
- Hero and card settings are saved the same way, in this browser only; pictures you upload for them are stored in the browser's IndexedDB (not localStorage), resized to 1600 pixels. They do not move to another browser or computer by themselves — use the design backup or the full backup.
- The dashboard passcode is a privacy screen, not strong security.
- No email is ever sent: contact messages and newsletter sign-ups are saved in a list you can read and export in the dashboard.

## Files
- `index.html` — the page shell. `css/styles.css` — all design (colours are variables at the top).
- `js/core.js` storage + helpers · `js/store.js` data, backup · `js/design.js` hero + card settings (defaults, validation, design backup) · `js/public.js` public pages · `js/admin.js` dashboard · `js/admin-design.js` the Hero Editor and Card Designer pages · `js/app.js` router + forms
- `server.js` + `start.bat` — the optional local server (no packages needed).
- `tests/e2e_design.py` — automated browser checks for the Hero Editor, Card Designer and design backup (same setup as below).
- `tests/e2e_check.py` — automated browser checks (`pip install playwright && playwright install chromium`, then `python3 tests/e2e_check.py`).
- `_archive_supabase-plan/` — an earlier online-database plan. **Unused**; safe to ignore.

## Troubleshooting
- *"We couldn't open local storage"* → you're in a private/incognito window or blocking site data. Use a normal window.
- *Port 8080 already in use* → close the other window running the site, or run `set PORT=8090 && node server.js`.
- *Handwritten text looks plain* → it uses fonts already on your computer (Segoe Script on Windows).
- *Lost the passcode* → on the sign-in page choose "reset the dashboard passcode" (content is kept).

## Firebase cloud sync

This build uses Firebase Authentication + Firestore for cloud articles/site settings and Cloudinary for new images. Set the Cloudinary cloud name and unsigned upload preset in `js/firebase.js` if you use a different Cloudinary account. The Firebase client configuration is intentionally in `js/firebase.js`; Firebase web API keys are identifiers and security comes from Authentication and Rules.

Before publishing this build, publish `firestore.rules`. For cover/hero images to work across devices, create an unsigned upload preset in Cloudinary named `blogs_by_mifrah`. The image uploader uses Cloudinary; Firebase Storage is not required.
