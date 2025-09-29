
// Options v1.6.0 — Trash (soft delete), restore, purge, empty, banners
const $ = (s,d=document)=>d.querySelector(s);
const snipList = $("#snipList");
const trashList = $("#trashList");
const listView = $("#listView");
const trashView = $("#trashView");
const form = $("#form");
const title = $("#title");
const desc = $("#desc");
const code = $("#code");
const tags = $("#tags");
const resetBtn = $("#reset");
const delBtn = $("#delete");
const saveBtn = $("#saveBtn");
const banner = $("#banner");
const exportAllBtn = $("#exportAll");
const newBtn = $("#newSnippet");
const tabAll = $("#tabAll");
const tabTrash = $("#tabTrash");
const emptyTrashBtn = $("#emptyTrash");

function showBanner(kind, msg){ // 'info' | 'danger'
  banner.className = kind;
  banner.textContent = msg;
  banner.hidden = false;
  setTimeout(()=> banner.hidden = true, 1600);
}

const store = {
  async getAll() {
    const { __acu_snippets } = await chrome.storage.sync.get("__acu_snippets");
    const data = __acu_snippets || { categories: [], snippets: [], faves: [], trash: [] };
    if(!Array.isArray(data.trash)) data.trash = [];
    if(!Array.isArray(data.faves)) data.faves = [];
    if(!Array.isArray(data.snippets)) data.snippets = [];
    return data;
  },
  async set(data) {
    await chrome.storage.sync.set({ "__acu_snippets": data });
  },
  async markAction(msg){ await chrome.storage.sync.set({ "__last_action": msg }); }
};

function slug(t){ return (t||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

function renderList(snips){
  snipList.innerHTML = "";
  for(const s of snips){
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <h3>${s.title}</h3>
      <span class="badge">${(s.tags||[]).join(', ')}</span>
      <p>${s.desc||""}</p>
      <pre>${(s.code||'').replace(/</g,'&lt;')}</pre>
      <div class="row">
        <button data-act="edit">Edit</button>
        <button data-act="delete">Delete</button>
      </div>`;
    li.querySelector('[data-act="edit"]').addEventListener('click', ()=>{
      loadIntoForm(s);
      location.hash = "#edit="+encodeURIComponent(s.id);
    });
    li.querySelector('[data-act="delete"]').addEventListener('click', async ()=>{
      const data = await store.getAll();
      // move to trash
      const idx = data.snippets.findIndex(x=>x.id===s.id);
      if(idx>-1){
        const removed = data.snippets.splice(idx,1)[0];
        data.trash.unshift({ ...removed, deletedAt: new Date().toISOString() });
      }
      await store.set(data);
      await store.markAction("Deleted");
      showBanner("danger","Deleted");
      renderList(data.snippets);
    });
    snipList.appendChild(li);
  }
}

function renderTrash(items){
  trashList.innerHTML = "";
  for(const s of items){
    const li = document.createElement("li");
    li.className = "item";
    const when = s.deletedAt ? new Date(s.deletedAt).toLocaleString() : "";
    li.innerHTML = `
      <h3>${s.title}</h3>
      <span class="badge">Deleted ${when}</span>
      <p>${s.desc||""}</p>
      <pre>${(s.code||'').replace(/</g,'&lt;')}</pre>
      <div class="row">
        <button data-act="restore">Restore</button>
        <button data-act="purge">Delete forever</button>
      </div>`;
    li.querySelector('[data-act="restore"]').addEventListener('click', async ()=>{
      const data = await store.getAll();
      const idx = data.trash.findIndex(x=>x.id===s.id);
      if(idx>-1){
        const restored = data.trash.splice(idx,1)[0];
        delete restored.deletedAt;
        data.snippets.unshift(restored);
      }
      await store.set(data);
      await store.markAction("Restored");
      showBanner("info","Restored");
      renderTrash(data.trash);
    });
    li.querySelector('[data-act="purge"]').addEventListener('click', async ()=>{
      const data = await store.getAll();
      data.trash = data.trash.filter(x=>x.id!==s.id);
      await store.set(data);
      await store.markAction("Purged");
      showBanner("danger","Purged");
      renderTrash(data.trash);
    });
    trashList.appendChild(li);
  }
}

function loadIntoForm(s){
  form.hidden = false; listView.hidden = true; trashView.hidden = true;
  title.value = s?.title || ""; desc.value = s?.desc || ""; code.value = s?.code || ""; tags.value = (s?.tags||[]).join(', ');
  if(s?.id) form.dataset.editing = s.id; else delete form.dataset.editing;
}

function clearForm(){
  title.value = ""; desc.value = ""; code.value = ""; tags.value = "";
  delete form.dataset.editing;
}

form && form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const data = await store.getAll();
  const isEditing = !!form.dataset.editing;
  const id = isEditing ? form.dataset.editing : (slug(title.value)||'snippet')+'-'+uid();
  const item = {
    id,
    title: title.value.trim() || 'Untitled',
    desc: (desc.value||'').trim(),
    code: code.value || '',
    tags: tags.value.split(',').map(s=>s.trim()).filter(Boolean)
  };
  const i = data.snippets.findIndex(x=>x.id===id);
  if(i>-1) data.snippets[i]=item; else data.snippets.unshift(item);
  await store.set(data);
  await store.markAction("Saved");
  showBanner("info","Saved");
  clearForm(); form.hidden = true; listView.hidden = false; trashView.hidden = true; location.hash = "";
  renderList((await store.getAll()).snippets||[]);
});

resetBtn && resetBtn.addEventListener("click", async ()=>{
  if(!confirm("Reset to default snippets? Your current snippets will move to Trash.")) return;
  try{
    const resp = await fetch(chrome.runtime.getURL('seed.json'));
    const seed = await resp.json();
    const data = await store.getAll();
    // move all current to trash with timestamp
    const nowIso = new Date().toISOString();
    for(const s of data.snippets){ data.trash.unshift({ ...s, deletedAt: nowIso }); }
    data.snippets = seed.snippets || [];
    await store.set(data);
    await store.markAction("Reset");
    showBanner("danger","Reset");
    clearForm(); form.hidden = true; listView.hidden = false; trashView.hidden = true; location.hash="";
    renderList(data.snippets);
  }catch(e){
    // fallback: just clear into empty and mark reset
    const data = await store.getAll();
    const nowIso = new Date().toISOString();
    for(const s of data.snippets){ data.trash.unshift({ ...s, deletedAt: nowIso }); }
    data.snippets = [];
    await store.set(data);
    await store.markAction("Reset");
    showBanner("danger","Reset");
    clearForm(); form.hidden = true; listView.hidden = false; trashView.hidden = true; location.hash="";
    renderList([]);
  }
});

delBtn && delBtn.addEventListener("click", async ()=>{
  const data = await store.getAll();
  const id = form.dataset.editing;
  if(!id){ alert("Nothing selected to delete."); return; }
  const idx = data.snippets.findIndex(x=>x.id===id);
  if(idx>-1){
    const removed = data.snippets.splice(idx,1)[0];
    data.trash.unshift({ ...removed, deletedAt: new Date().toISOString() });
  }
  await store.set(data);
  await store.markAction("Deleted");
  showBanner("danger","Deleted");
  clearForm(); form.hidden = true; listView.hidden = false; trashView.hidden = true; location.hash="";
  renderList(data.snippets);
});

newBtn && newBtn.addEventListener("click", ()=>{
  loadIntoForm(null);
  location.hash = "#new";
});

tabAll && tabAll.addEventListener("click", async ()=>{
  tabAll.classList.add("active"); tabTrash.classList.remove("active");
  form.hidden = true; listView.hidden = false; trashView.hidden = true; banner.hidden = true; location.hash="";
  renderList((await store.getAll()).snippets||[]);
});
tabTrash && tabTrash.addEventListener("click", async ()=>{
  tabTrash.classList.add("active"); tabAll.classList.remove("active");
  form.hidden = true; listView.hidden = true; trashView.hidden = false; banner.hidden = true; location.hash="#trash";
  renderTrash((await store.getAll()).trash||[]);
});

emptyTrashBtn && emptyTrashBtn.addEventListener("click", async ()=>{
  if(!confirm("Permanently delete everything in Trash?")) return;
  const data = await store.getAll();
  data.trash = [];
  await store.set(data);
  await store.markAction("Purged");
  showBanner("danger","Purged");
  renderTrash([]);
});

// --- Export All (CSV) ---
function toCsvRow(vals){
  return vals.map(v=>{
    let s = (v==null? "" : String(v));
    s = s.replace(/"/g,'""');
    if(/[",\n]/.test(s)) s = '"'+s+'"';
    return s;
  }).join(",") + "\n";
}
exportAllBtn && exportAllBtn.addEventListener("click", async ()=>{
  const data = await store.getAll();
  const rows = [];
  rows.push(toCsvRow(["id","title","description","tags","code"]));
  for(const s of (data.snippets||[])){
    rows.push(toCsvRow([
      s.id || "",
      s.title || "",
      s.desc || "",
      (s.tags||[]).join("; "),
      s.code || ""
    ]));
  }
  const csv = "\ufeff" + rows.join(""); // UTF-8 BOM
  const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0'), d = String(now.getDate()).padStart(2,'0');
  a.href = url; a.download = `acu-snippets-${y}${m}${d}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  await store.markAction("Exported");
  showBanner("info","Exported");
});

async function route(){
  const data = await store.getAll();
  const hash = location.hash || "";
  if(hash.startsWith("#edit=")){
    tabAll.classList.add("active"); tabTrash.classList.remove("active");
    const id = decodeURIComponent(hash.slice(6));
    const s = (data.snippets||[]).find(x=>x.id===id);
    if(s){ form.hidden = false; listView.hidden = true; trashView.hidden = true; loadIntoForm(s); }
    else { form.hidden = true; listView.hidden = false; trashView.hidden = true; location.hash=""; renderList(data.snippets||[]); }
  }else if(hash.startsWith("#new")){
    tabAll.classList.add("active"); tabTrash.classList.remove("active");
    loadIntoForm(null);
  }else if(hash==="#trash"){
    tabTrash.classList.add("active"); tabAll.classList.remove("active");
    form.hidden = true; listView.hidden = true; trashView.hidden = false; renderTrash(data.trash||[]);
  }else{
    tabAll.classList.add("active"); tabTrash.classList.remove("active");
    form.hidden = true; listView.hidden = false; trashView.hidden = true; renderList(data.snippets||[]);
  }
}

(async function init(){
  const data = await store.getAll();
  if(!Array.isArray(data.snippets) || data.snippets.length===0){
    try{
      const resp = await fetch(chrome.runtime.getURL('seed.json'));
      const seed = await resp.json();
      await store.set({ ...data, snippets: seed.snippets||[] });
      renderList(seed.snippets||[]);
    }catch(e){
      await store.set({ ...data, snippets: [] });
      renderList([]);
    }
  }else{
    renderList(data.snippets||[]);
  }
  await route();
  window.addEventListener("hashchange", route);
})();
