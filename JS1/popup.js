
/* Popup v1.6.0 — top banners + listens for Saved/Deleted/Reset/Restored/Purged/Exported */
const $ = (s,d=document)=>d.querySelector(s);
const list = $("#list");
const search = $("#search");
const openOptions = $("#openOptions");
const helpBtn = $("#helpBtn");
const helpDlg = $("#help");
const closeHelp = $("#closeHelp");
const filterFaves = $("#filterFaves");
const banner = $("#banner");
const addNew = $("#addNew");

function showBanner(kind, msg){
  banner.className = kind; // 'info' | 'danger'
  banner.textContent = msg;
  banner.hidden = false;
  setTimeout(()=> banner.hidden = true, 1600);
}

openOptions && openOptions.addEventListener("click", (e)=>{ e.preventDefault(); chrome.runtime.openOptionsPage(); });
helpBtn && helpBtn.addEventListener("click", ()=> helpDlg.showModal());
closeHelp && closeHelp.addEventListener("click", ()=> helpDlg.close());
addNew && addNew.addEventListener("click", async ()=>{
  const url = chrome.runtime.getURL("options.html#new");
  await chrome.tabs.create({ url });
});

const store = {
  async getAll() {
    const { __acu_snippets } = await chrome.storage.sync.get("__acu_snippets");
    return __acu_snippets || { categories: [], snippets: [], faves: [], trash: [] };
  }
};

function tagChip(name){ const s = document.createElement('span'); s.className = 'tag'; s.textContent = name; return s; }

function wireItem(li, s, faves){
  const pre = li.querySelector(".code");
  const copyBtn = li.querySelector(".copy");
  const favBtn = li.querySelector(".fav");
  const expandBtn = li.querySelector(".expand");
  const editBtn = li.querySelector(".edit");

  const setFavVisual = ()=>{
    if(faves.includes(s.id)){ favBtn.classList.add("active"); favBtn.textContent = "❤"; }
    else{ favBtn.classList.remove("active"); favBtn.textContent = "♡"; }
  };

  pre.textContent = s.code;
  setFavVisual();

  copyBtn && copyBtn.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(s.code);
      const txt = copyBtn.textContent;
      copyBtn.textContent = "Copied";
      setTimeout(()=> copyBtn.textContent = txt, 900);
    }catch(e){ /* ignore */ }
  });

  favBtn && favBtn.addEventListener("click", async ()=>{
    const obj = await chrome.storage.sync.get(["__acu_snippets"]);
    const data = obj.__acu_snippets || {snippets:[], faves:[]};
    const arr = data.faves || [];
    const i = arr.indexOf(s.id);
    if(i>-1) arr.splice(i,1); else arr.push(s.id);
    data.faves = arr;
    await chrome.storage.sync.set({ "__acu_snippets": data });
    if(arr.includes(s.id)){ favBtn.classList.add("active"); favBtn.textContent = "❤"; }
    else{ favBtn.classList.remove("active"); favBtn.textContent = "♡"; }
  });

  const toggleCode = (show)=>{ pre.hidden = !show; expandBtn.textContent = show ? "Hide" : "Show"; };
  expandBtn && expandBtn.addEventListener("click", ()=>{
    const willShow = pre.hasAttribute("hidden");
    toggleCode(willShow);
  });

  editBtn && editBtn.addEventListener("click", async ()=>{
    const url = chrome.runtime.getURL("options.html#edit="+encodeURIComponent(s.id));
    await chrome.tabs.create({ url });
  });
}

async function render(){
  const data = await store.getAll();
  const snippets = data.snippets && Array.isArray(data.snippets) ? data.snippets : [];
  const faves = data.faves || [];

  list.innerHTML = "";
  const q = (search?.value || '').toLowerCase().trim();
  const favOnly = !!(filterFaves && filterFaves.checked);

  const visible = snippets.filter(s=>{
    const hay = (s.title + " " + (s.desc||"") + " " + s.code + " " + (s.tags||[]).join(" ")).toLowerCase();
    if(q && !hay.includes(q)) return false;
    if(favOnly && !faves.includes(s.id)) return false;
    return true;
  });

  for(const s of visible){
    const li = document.getElementById("itemTmpl").content.firstElementChild.cloneNode(true);
    li.dataset.sid = s.id;
    li.querySelector(".title").textContent = s.title;
    li.querySelector(".desc").textContent = s.desc || "";
    const tagWrap = li.querySelector(".tags");
    (s.tags||[]).forEach(t=> tagWrap.appendChild(tagChip(t)));
    wireItem(li, s, faves);
    list.appendChild(li);
  }

  if(!visible.length){
    const empty = document.createElement("p");
    empty.style.color = "#666"; empty.style.padding = "10px";
    empty.textContent = "No snippets match your filters.";
    list.appendChild(empty);
  }
}

// React to last_action (from Manage)
chrome.storage.onChanged.addListener(async (changes, area)=>{
  if(area==='sync' && (changes.__acu_snippets || changes.__last_action)){
    await render();
    const act = (await chrome.storage.sync.get("__last_action")).__last_action;
    if(act){
      const danger = ["Deleted","Reset","Purged"];
      const kind = danger.includes(act) ? "danger" : "info";
      showBanner(kind, act);
      await chrome.storage.sync.remove("__last_action");
    }
  }
});

(async function boot(){
  const obj = await chrome.storage.sync.get(["__acu_snippets"]);
  if(!obj.__acu_snippets || !Array.isArray(obj.__acu_snippets.snippets)){
    try{
      const resp = await fetch(chrome.runtime.getURL('seed.json'));
      const seed = await resp.json();
      await chrome.storage.sync.set({ "__acu_snippets": seed });
    }catch(e){
      await chrome.storage.sync.set({ "__acu_snippets": {categories:[], snippets:[], trash:[]} });
    }
  }
  await render();
  // Also show banner if a last action is queued
  const act = (await chrome.storage.sync.get("__last_action")).__last_action;
  if(act){
    const danger = ["Deleted","Reset","Purged"];
    const kind = danger.includes(act) ? "danger" : "info";
    showBanner(kind, act);
    await chrome.storage.sync.remove("__last_action");
  }
  search && search.addEventListener("input", render);
  filterFaves && filterFaves.addEventListener("change", render);
})();
