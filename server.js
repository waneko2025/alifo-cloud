const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = path.join(__dirname, "storage");
const META = path.join(ROOT, "metadata.json");

fs.mkdirSync(ROOT, { recursive: true });
if (!fs.existsSync(META)) fs.writeFileSync(META, JSON.stringify({ files: [] }, null, 2));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function safePath(relative) {
  const clean = String(relative || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const full = path.resolve(ROOT, clean);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) throw new Error("Invalid path");
  return full;
}

function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META, "utf8")); }
  catch { return { files: [] }; }
}
function saveMeta(data) {
  fs.writeFileSync(META, JSON.stringify(data, null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const folder = String(req.body.folder || "").replace(/\\/g, "/").replace(/^\/+/, "");
      const dir = safePath(folder);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => {
    const original = path.basename(file.originalname);
    const ext = path.extname(original);
    const stem = path.basename(original, ext);
    let name = original;
    let i = 1;
    const folder = String(req.body.folder || "").replace(/\\/g, "/").replace(/^\/+/, "");
    while (fs.existsSync(safePath(path.join(folder, name)))) {
      name = `${stem} (${i++})${ext}`;
    }
    cb(null, name);
  }
});
const upload = multer({ storage });

app.get("/api/list", (req, res) => {
  try {
    const folder = String(req.query.folder || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const dir = safePath(folder);
    fs.mkdirSync(dir, { recursive: true });

    const items = fs.readdirSync(dir, { withFileTypes: true }).map(entry => {
      const rel = path.join(folder, entry.name).replace(/\\/g, "/");
      const full = safePath(rel);
      const stat = fs.statSync(full);
      return {
        name: entry.name,
        path: rel,
        type: entry.isDirectory() ? "folder" : "file",
        size: entry.isDirectory() ? 0 : stat.size,
        updatedAt: stat.mtimeMs
      };
    });
    items.sort((a,b) => a.type === b.type ? a.name.localeCompare(b.name) : (a.type === "folder" ? -1 : 1));
    res.json({ folder, items });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/folders", (req, res) => {
  try {
    const folder = String(req.body.folder || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const name = String(req.body.name || "").trim();
    if (!name || name.includes("/") || name.includes("\\")) throw new Error("Invalid folder name");
    const target = path.join(folder, name);
    const full = safePath(target);
    if (fs.existsSync(full)) throw new Error("同じ名前のフォルダがあります");
    fs.mkdirSync(full, { recursive: true });
    res.json({ ok: true, path: target.replace(/\\/g, "/") });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/upload", upload.array("files", 50), (req, res) => {
  try {
    const folder = String(req.body.folder || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const meta = loadMeta();
    for (const file of req.files || []) {
      const rel = path.relative(ROOT, file.path).replace(/\\/g, "/");
      meta.files.push({ path: rel, originalName: file.originalname, uploadedAt: Date.now() });
    }
    saveMeta(meta);
    res.json({ ok: true, count: (req.files || []).length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete("/api/item", (req, res) => {
  try {
    const rel = String(req.body.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel) throw new Error("Path required");
    const full = safePath(rel);
    if (!fs.existsSync(full)) throw new Error("ファイルまたはフォルダがありません");
    fs.rmSync(full, { recursive: true, force: true });

    const meta = loadMeta();
    meta.files = meta.files.filter(x => x.path !== rel && !x.path.startsWith(rel + "/"));
    saveMeta(meta);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/download", (req, res) => {
  try {
    const rel = String(req.query.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const full = safePath(rel);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(404).send("Not found");
    res.download(full, path.basename(full));
  } catch (e) { res.status(400).send(e.message); }
});

app.listen(PORT, () => console.log(`ALIFO Cloud running on port ${PORT}`));