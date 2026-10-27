// Tiny local web server for Blogs By Mifrah. No packages needed — only Node.js itself.
// Serves ONLY the website files in this folder, and only on your own computer (127.0.0.1).
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = __dirname, PORT = Number(process.env.PORT) || 8080;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };
const ALLOWED = /^\/(index\.html|css\/[\w.-]+|js\/[\w.-]+)?$/;
http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch (e) { res.writeHead(400); return res.end("Bad request"); }
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!ALLOWED.test(p) || !file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log("Blogs By Mifrah is running at http://localhost:" + PORT + "\nPress Ctrl+C (or close this window) to stop."))
  .on("error", (e) => { console.log(e.code === "EADDRINUSE" ? "Port " + PORT + " is already in use. Close the other window running this site, or run: set PORT=8090 && node server.js" : e.message); process.exit(1); });
