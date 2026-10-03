const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = path.join(__dirname, "storage");
const USERS_FILE = path.join(ROOT, "users.json");
const SESSIONS_FILE = path.join(ROOT, "sessions.json");

fs.mkdirSync(ROOT, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, "{}");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file,"utf8")); } catch { return fallback; } }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data,null,2)); }
function clean(v){ return String(v||"").replace(/\\/g,"/").replace(/^\/+/,""); }
function userRoot(user){ return path.join(ROOT, "users", user.id); }
function safeUserPath(user, relative){
  const rel=clean(relative);
  const root=path.resolve(userRoot(user));
  const full=path.resolve(root,rel);
  if(full!==root && !full.startsWith(root+path.sep)) throw new Error("Invalid path");
  return full;
}
function hash(password, salt){
  return crypto.pbkdf2Sync(password,salt,120000,32,"sha256").toString("hex");
}
function getUser(req){
  const token=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("alifo_session="))?.split("=")[1];
  if(!token) return null;
  const sessions=readJson(SESSIONS_FILE,{});
  const uid=sessions[token];
  if(!uid) return null;
  return readJson(USERS_FILE,[]).find(u=>u.id===uid)||null;
}
function requireAuth(req,res,next){
  const user=getUser(req);
  if(!user) return res.status(401).json({error:"ログインしてください"});
  req.user=user; next();
}

app.get("/api/me",(req,res)=>{
  const u=getUser(req);
  res.json(u?{loggedIn:true,user:{id:u.id,email:u.email}}:{loggedIn:false});
});

app.post("/api/register",(req,res)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("メールアドレスを確認してください");
    if(password.length<6) throw new Error("パスワードは6文字以上にしてください");
    const users=readJson(USERS_FILE,[]);
    if(users.some(u=>u.email===email)) throw new Error("このメールアドレスは登録済みです");
    const id=crypto.randomUUID(), salt=crypto.randomBytes(16).toString("hex");
    const user={id,email,salt,passwordHash:hash(password,salt),createdAt:Date.now()};
    users.push(user); writeJson(USERS_FILE,users);
    fs.mkdirSync(userRoot(user),{recursive:true});
    res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message});}
});

app.post("/api/login",(req,res)=>{
  try{
    const email=String(req.body.email||"").trim().toLowerCase();
    const password=String(req.body.password||"");
    const user=readJson(USERS_FILE,[]).find(u=>u.email===email);
    if(!user || hash(password,user.salt)!==user.passwordHash) throw new Error("メールアドレスまたはパスワードが違います");
    const token=crypto.randomBytes(32).toString("hex");
    const sessions=readJson(SESSIONS_FILE,{});
    sessions[token]=user.id; writeJson(SESSIONS_FILE,sessions);
    res.setHeader("Set-Cookie",`alifo_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`);
    res.json({ok:true});
  }catch(e){res.status(401).json({error:e.message});}
});

app.post("/api/logout",(req,res)=>{
  const cookie=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("alifo_session="));
  if(cookie){
    const token=cookie.split("=")[1], sessions=readJson(SESSIONS_FILE,{});
    delete sessions[token]; writeJson(SESSIONS_FILE,sessions);
  }
  res.setHeader("Set-Cookie","alifo_session=; HttpOnly; Path=/; Max-Age=0");
  res.json({ok:true});
});

app.get("/api/list",requireAuth,(req,res)=>{
  try{
    const folder=clean(req.query.folder).replace(/\/+$/,"");
    const dir=safeUserPath(req.user,folder); fs.mkdirSync(dir,{recursive:true});
    const items=fs.readdirSync(dir,{withFileTypes:true}).map(e=>{
      const rel=path.join(folder,e.name).replace(/\\/g,"/");
      const stat=fs.statSync(safeUserPath(req.user,rel));
      return {name:e.name,path:rel,type:e.isDirectory()?"folder":"file",size:e.isDirectory()?0:stat.size,updatedAt:stat.mtimeMs};
    });
    items.sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):(a.type==="folder"?-1:1));
    res.json({folder,items});
  }catch(e){res.status(400).json({error:e.message});}
});

app.post("/api/folders",requireAuth,(req,res)=>{
  try{
    const folder=clean(req.body.folder), name=String(req.body.name||"").trim();
    if(!name || name.includes("/") || name.includes("\\")) throw new Error("フォルダ名が不正です");
    const target=path.join(folder,name), full=safeUserPath(req.user,target);
    if(fs.existsSync(full)) throw new Error("同じ名前のフォルダがあります");
    fs.mkdirSync(full,{recursive:true}); res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message});}
});

const storage=multer.diskStorage({
  destination:(req,file,cb)=>{
    try{const folder=clean(req.body.folder);const dir=safeUserPath(req.user,folder);fs.mkdirSync(dir,{recursive:true});cb(null,dir);}
    catch(e){cb(e);}
  },
  filename:(req,file,cb)=>{
    try{
      const folder=clean(req.body.folder), original=path.basename(file.originalname);
      const ext=path.extname(original), stem=path.basename(original,ext);
      let name=original,i=1;
      while(fs.existsSync(safeUserPath(req.user,path.join(folder,name)))) name=`${stem} (${i++})${ext}`;
      cb(null,name);
    }catch(e){cb(e);}
  }
});

app.post("/api/upload",requireAuth,(req,res,next)=>{
  multer({storage}).array("files",50)(req,res,err=>{
    if(err)return res.status(400).json({error:err.message});
    res.json({ok:true,count:(req.files||[]).length});
  });
});

app.delete("/api/item",requireAuth,(req,res)=>{
  try{
    const rel=clean(req.body.path); if(!rel)throw new Error("Path required");
    const full=safeUserPath(req.user,rel);
    if(!fs.existsSync(full))throw new Error("ファイルまたはフォルダがありません");
    fs.rmSync(full,{recursive:true,force:true}); res.json({ok:true});
  }catch(e){res.status(400).json({error:e.message});}
});

app.get("/api/download",requireAuth,(req,res)=>{
  try{
    const rel=clean(req.query.path),full=safeUserPath(req.user,rel);
    if(!fs.existsSync(full)||!fs.statSync(full).isFile())return res.status(404).send("Not found");
    res.download(full,path.basename(full));
  }catch(e){res.status(400).send(e.message);}
});

app.get("/login.html",(req,res)=>res.sendFile(path.join(__dirname,"public","login.html")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`ALIFO Cloud v1.1 running on port ${PORT}`));
