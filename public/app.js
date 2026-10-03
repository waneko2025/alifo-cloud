let currentFolder = "";

const $ = s => document.querySelector(s);
const grid = $("#grid");
const statusEl = $("#status");
const empty = $("#empty");
const drop = $("#drop");

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function fmt(n){if(!n)return "フォルダ";let u=["B","KB","MB","GB"],i=0;while(n>=1024&&i<3){n/=1024;i++}return n.toFixed(i?1:0)+" "+u[i];}
function icon(item){return item.type==="folder"?"📁":(/\.(png|jpe?g|gif|webp)$/i.test(item.name)?"🖼️":/\.(pdf)$/i.test(item.name)?"📕":/\.(mp4|mov|webm)$/i.test(item.name)?"🎬":"📄");}

async function api(url,opt){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"エラーが発生しました");return d;}

async function load(){
  statusEl.textContent="読み込み中…";
  const d=await api("/api/list?folder="+encodeURIComponent(currentFolder));
  $("#breadcrumb").textContent="ホーム"+(currentFolder?" / "+currentFolder.split("/").map(esc).join(" / "):"");
  $("#backBtn").disabled=!currentFolder;
  grid.innerHTML="";
  d.items.forEach(item=>{
    const c=document.createElement("article");c.className="card";
    c.innerHTML=`<div><div class="icon">${icon(item)}</div><div class="name">${esc(item.name)}</div><div class="meta">${item.type==="folder"?"フォルダ":fmt(item.size)}</div></div>
    <div class="cardActions">
      ${item.type==="folder"?`<button class="open">開く</button>`:`<button class="download">⬇ 保存</button>`}
      <button class="delete">🗑 削除</button>
    </div>`;
    c.querySelector(".delete").onclick=async()=>{if(confirm(`「${item.name}」を削除しますか？`)){try{await api("/api/item",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:item.path})});load()}catch(e){alert(e.message)}}};
    if(item.type==="folder") c.querySelector(".open").onclick=()=>{currentFolder=item.path;load()};
    else c.querySelector(".download").onclick=()=>location.href="/api/download?path="+encodeURIComponent(item.path);
    grid.appendChild(c);
  });
  empty.hidden=d.items.length!==0;
  statusEl.textContent=`${d.items.length} 件`;
}

$("#newFolder").onclick=async()=>{
  const name=prompt("新しいフォルダ名を入力してください");
  if(!name)return;
  try{await api("/api/folders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({folder:currentFolder,name})});load()}
  catch(e){alert(e.message)}
};

$("#fileInput").onchange=()=>upload([...$("#fileInput").files]);

async function upload(files){
  if(!files.length)return;
  const fd=new FormData();fd.append("folder",currentFolder);files.forEach(f=>fd.append("files",f));
  statusEl.textContent="アップロード中…";
  try{await api("/api/upload",{method:"POST",body:fd});$("#fileInput").value="";load()}
  catch(e){alert(e.message);load()}
}
drop.ondragover=e=>{e.preventDefault();drop.classList.add("drag")};
drop.ondragleave=()=>drop.classList.remove("drag");
drop.ondrop=e=>{e.preventDefault();drop.classList.remove("drag");upload([...e.dataTransfer.files])};
$("#backBtn").onclick=()=>{if(!currentFolder)return;const p=currentFolder.split("/");p.pop();currentFolder=p.join("/");load()};

load().catch(e=>{statusEl.textContent=e.message;alert(e.message)});
