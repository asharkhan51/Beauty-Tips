/* Firebase cloud layer for Blogs By Mifrah. Firestore sync + Cloudinary image hosting; IndexedDB remains the local cache. */
(function () {
  const M = window.M;
  const ADMIN_UID = "VZYqhyprPtYWw2D4afr78JjldEJ2";
  const CLOUDINARY_CLOUD_NAME = "qi7a6asa";
  const CLOUDINARY_UPLOAD_PRESET = "Beauty Tips";
  const CLOUDINARY_FOLDER = "blogs-by-mifrah";
  const config = {
    apiKey: "AIzaSyAQgMR6uHPmA3Hp0bb7jN7n4XKv3Incq9s",
    authDomain: "beauty-tips-e2fc4.firebaseapp.com",
    projectId: "beauty-tips-e2fc4",
    storageBucket: "beauty-tips-e2fc4.firebasestorage.app",
    messagingSenderId: "678076819652",
    appId: "1:678076819652:web:a687cfc8273ae2276c8191",
    measurementId: "G-9RX8ZX9RBM"
  };

  const C = (M.cloud = { ADMIN_UID, readyState: false });
  let readyPromise;
  const adminOnly = () => { if (!C.isAdmin()) throw new Error("Please sign in with the website admin account first."); };

  C.ready = () => {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      if (!window.firebase || !firebase.apps) throw new Error("Firebase SDK did not load. Check your internet connection.");
      if (!firebase.apps.length) firebase.initializeApp(config);
      C.auth = firebase.auth(); C.db = firebase.firestore();
      await new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        C.auth.onAuthStateChanged((u) => {
          C.user = u || null;
          if (u && u.uid !== ADMIN_UID) C.auth.signOut().catch(() => {});
          finish();
        });
        setTimeout(finish, 5000);
      });
      C.readyState = true;
      return C;
    })();
    return readyPromise;
  };
  C.isAdmin = () => !!C.user && C.user.uid === ADMIN_UID;
  C.signIn = async (email, password) => {
    await C.ready();
    const cred = await C.auth.signInWithEmailAndPassword(String(email || "").trim(), password || "");
    if (!cred.user || cred.user.uid !== ADMIN_UID) { await C.auth.signOut(); throw new Error("This Firebase account is not the website admin account."); }
    C.user = cred.user; await C.pull(); return cred.user;
  };
  C.signOut = async () => { await C.ready(); await C.auth.signOut(); C.user = null; sessionStorage.removeItem("adminOK"); };

  const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => v instanceof Blob ? undefined : v));
  const articleRef = (id) => C.db.collection("articles").doc(id);
  const settingsRef = () => C.db.collection("settings").doc("site");
  const designRef = () => C.db.collection("settings").doc("design");

  C.pull = async () => {
    await C.ready();
    const arts = [];
    let snap;
    if (C.isAdmin()) snap = await C.db.collection("articles").get();
    else snap = await C.db.collection("articles").where("status", "==", "published").get();
    snap.forEach((d) => arts.push({ id: d.id, ...d.data() }));
    arts.sort((a, b) => String(b.publishedAt || b.updatedAt || "").localeCompare(String(a.publishedAt || a.updatedAt || "")));
    if (arts.length || C.isAdmin()) {
      for (const local of await M.db.all("articles")) await M.db.del("articles", local.id);
      for (const a of arts) await M.db.put("articles", a);
    }
    const s = await settingsRef().get();
    if (s.exists) { const v = s.data(); if (v.kind === "site") { await M.db.put("kv", { key: "settings", value: v.value || {} }); Object.assign(M.cache.settings, v.value || {}); } }
    const d = await designRef().get();
    if (d.exists && d.data().kind === "design") {
      const v = d.data().value || {};
      if (v.theme) { await M.db.put("kv", { key: "theme", value: v.theme }); Object.assign(M.cache.theme, v.theme); }
      if (v.hero) await M.db.put("kv", { key: "hero", value: v.hero });
      if (v.card) await M.db.put("kv", { key: "card", value: v.card });
    }
    await M.refresh();
    if (M.loadDesign) await M.loadDesign();
    if (M.applyTheme) M.applyTheme();
  };

  C.pushArticle = async (a) => { adminOnly(); await articleRef(a.id).set(clean(a)); };
  C.deleteArticle = async (id) => { adminOnly(); await articleRef(id).delete(); };
  C.pushSettings = async () => { adminOnly(); await settingsRef().set({ kind: "site", value: clean(M.cache.settings), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); };
  C.pushDesign = async () => { adminOnly(); await designRef().set({ kind: "design", value: clean({ theme: M.cache.theme, hero: M.cache.hero, card: M.cache.card }), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }); };

  C.uploadImage = async (id, blob, name) => {
    adminOnly();
    if (!blob) throw new Error("Image data is missing. Please choose the image again.");
    const form = new FormData();
    form.append("file", blob, String(name || id).replace(/[^\w.\-]/g, "_").slice(0, 80) || (id + ".webp"));
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    form.append("public_id", id);
    form.append("folder", CLOUDINARY_FOLDER);
    const response = await fetch("https://api.cloudinary.com/v1_1/" + CLOUDINARY_CLOUD_NAME + "/image/upload", { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.secure_url) {
      const message = result && result.error && result.error.message;
      throw new Error(message || "Cloudinary image upload failed. Check the cloud name and unsigned upload preset.");
    }
    return result.secure_url;
  };
  C.imageUrl = async (id) => {
    if (!id) return null;
    // Cloudinary supports extension-less delivery URLs, so IDs saved in Firestore work on every device.
    return "https://res.cloudinary.com/" + CLOUDINARY_CLOUD_NAME + "/image/upload/" + CLOUDINARY_FOLDER + "/" + encodeURIComponent(id);
  };

  // Wait for Firebase before the app's first load, then hydrate the local cache from cloud.
  const oldLoad = M.load;
  M.load = async function () { await C.ready(); await oldLoad(); try { await C.pull(); } catch (e) { console.warn("Cloud pull skipped:", e); } };

  // Save wrappers: preserve all existing local behavior, then mirror cloud content when admin is signed in.
  const oldSaveArticle = M.saveArticle;
  M.saveArticle = async function (a, note) { const r = await oldSaveArticle(a, note); await C.ready(); if (C.isAdmin()) await C.pushArticle(r); return r; };
  const oldDeleteArticle = M.deleteArticle;
  M.deleteArticle = async function (id) { await C.ready(); await oldDeleteArticle(id); if (C.isAdmin()) await C.deleteArticle(id); };
  const oldSaveSettings = M.saveSettings;
  M.saveSettings = async function (s) { const r = await oldSaveSettings(s); await C.ready(); if (C.isAdmin()) await C.pushSettings(); return r; };
  const oldSaveHero = M.saveHero, oldSaveCard = M.saveCard;
  M.saveHero = async function (h) { const r = await oldSaveHero(h); await C.ready(); if (C.isAdmin()) await C.pushDesign(); return r; };
  M.saveCard = async function (c) { const r = await oldSaveCard(c); await C.ready(); if (C.isAdmin()) await C.pushDesign(); return r; };

  // Keep the local IndexedDB copy for previews/offline use; admins also upload to Cloudinary for cross-device delivery.
  const oldAddImage = M.addImage;
  M.addImage = async function (file) {
    const id = await oldAddImage(file);
    await C.ready();
    if (C.isAdmin()) {
      const local = await M.db.get("images", id);
      if (local && local.blob) {
        // Do not silently continue: a failed cloud upload would leave the image unavailable on other devices.
        await C.uploadImage(id, local.blob, local.name);
      }
    }
    return id;
  };
  const oldImgUrl = M.imgUrl;
  M.imgUrl = async function (id) {
    const local = await oldImgUrl(id); if (local) return local;
    await C.ready(); return C.imageUrl(id);
  };
})();
