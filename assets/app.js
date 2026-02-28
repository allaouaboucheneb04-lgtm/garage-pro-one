import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, getDocs,
  addDoc, serverTimestamp, onSnapshot, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ============
   Firebase init
=========== */
if (!window.FIREBASE_CONFIG) {
  document.getElementById("viewAuth").style.display = "";
  const err = document.getElementById("authError");
  err.style.display = "";
  err.textContent = "Configuration Firebase manquante. Ouvre assets/firebase-config.js et colle la config (voir README).";
  throw new Error("Missing FIREBASE_CONFIG");
}

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

/* ============
   Roles (admin / mechanic)
=========== */
// role is stored in Firestore at /users/{uid}.role
// possible values: "admin" | "mechanic"
let currentRole = "unknown";
let currentUserName = "";
let unsubProfile = null;
let mechanics = [];

let roleNeedsSetup = false;
let roleSetupShown = false;

function normalizeRole(raw) {
  const r = String(raw || "").toLowerCase().trim();
  // tolérance aux fautes fréquentes
  if (r === "mecanic" || r === "mecanicien" || r === "mechanicien") return "mechanic";
  if (r === "administrateur" || r === "administrator") return "admin";
  if (r === "admin" || r === "mechanic") return r;
  return "";
}

function docUserProfile(uid=currentUid){
  return doc(db, "users", uid);
}

async function ensureUserProfile(_user){
  // IMPORTANT: with your Firestore rules, ONLY an admin can create/update /users/{uid}.
  // So we do NOT auto-create anything here.
  return;
}

async function loadRole(){
  if(!currentUid) return;
  try{
    const snap = await getDoc(docUserProfile());
    if(!snap.exists()){
      currentRole = "unknown";
      currentUserName = "";
      applyRoleUI();

      // Without this doc, your rules cannot compute role(), so the user will be blocked.
      alert(
        "Compte non configuré par l’admin.\n\n"+
        "Demande à l’admin de créer : users/"+currentUid+"\n"+
        "avec au minimum : { role: 'mechanic' (ou 'admin'), name: '...' }.\n\n"+
        "UID: "+currentUid
      );
      await signOut(auth);
      return;
    }
    const d = snap.data() || {};
    const normalized = normalizeRole(d.role);
    if (!normalized) {
      roleNeedsSetup = true;
      currentRole = "mechanic";
    } else {
      roleNeedsSetup = false;
      currentRole = normalized;
    }
    currentUserName = d.name || d.email || "";
  }catch(e){
    console.warn("loadRole failed", e);
    currentRole = "unknown";
    currentUserName = "";
  }
  applyRoleUI();
}

function applyRoleUI(){
  const isAdmin = (currentRole === "admin");

  // 1) tout ce qui est marqué data-role="admin" (HTML)
  document.querySelectorAll('[data-role="admin"]').forEach(el=>{
    el.style.display = isAdmin ? "" : "none";
  });

  // 2) fallback pour quelques ids (au cas où)
  const ids = ["btnNewClient","btnNewClient2","btnNewRepair","btnNewRepair2"];
  ids.forEach(id=>{ const el = $(id); if(el) el.style.display = isAdmin ? "" : "none"; });

  const subtitle = document.querySelector('.brand .muted');
  if(subtitle){
    subtitle.textContent = (currentRole === "mechanic")
      ? "Mode mécanicien — Mes travaux"
      : "Synchro automatique (Firebase)";
    if (roleNeedsSetup && !roleSetupShown) {
      roleSetupShown = true;
      showModal(
        "Profil incomplet",
        "Ton compte est connecté, mais ton document Firestore /users/" + currentUser.uid + " n'a pas un role valide.\n\n➡️ Mets le champ role = admin ou role = mechanic (exactement)."
      );
    }
  }
}

async function loadMechanics(){
  mechanics = [];
  if(currentRole !== "admin") return;
  try{
    const snap = await getDocs(query(collection(db, "users"), where("role","==","mechanic")));
    mechanics = snap.docs.map(d=>({uid:d.id, ...(d.data()||{})}))
      .map(u=>({uid:u.uid, name:u.name || u.email || u.uid, email:u.email||""}));
  }catch(e){
    console.warn("loadMechanics failed", e);
  }
}


/* ============
   UI helpers
=========== */
const $ = (id)=>document.getElementById(id);
const views = {
  dashboard: $("viewDashboard"),
  clients: $("viewClients"),
  repairs: $("viewRepairs"),
  settings: $("viewSettings"),
  revenue: $("viewRevenue"),
};
const pageTitle = $("pageTitle");

function safe(s){ return String(s??"").replace(/[&<>"]/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
function money(n){
  const x = Number(n||0);
  return x.toLocaleString('fr-CA', {minimumFractionDigits:2, maximumFractionDigits:2}) + " $";
}
function pct(n){
  return (Number(n)*100).toFixed(3).replace(/\.000$/,'').replace(/0+$/,'').replace(/\.$/,'') + "%";
}
function byCreatedDesc(a,b){
  return (String(b.createdAt||"")).localeCompare(String(a.createdAt||""));
}
function isoNow(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,'0');
  return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes());
}



/* ============
   Garage info (modifiable)
=========== */
const GARAGE = {
  name: "Garage Pro One",
  phone: "(514) 727-0522",
  email: "garageproone@gmail.com",
  address1: "7880 Boul PIE-IX",
  address2: "Montréal (QC) H1Z 3T3",
  country: "Canada",
  tps: "73259 0344",
  tvq: "1230268666",
  tagline: "Vérification / Diagnostic / Réparation"
};

// Simple inline logo (SVG) — tu peux le remplacer par une image plus tard
const GARAGE_LOGO_SVG = `
<svg width="44" height="44" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-label="Garage Pro One">
  <defs>
    <linearGradient id="g" x1="0" x2="1">
      <stop offset="0" stop-color="#2563eb"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)" opacity="0.12"/>
  <path d="M22 40l10-10m0 0l6-6m-6 6l6 6" stroke="#1d4ed8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M40 22c-3 0-5 2-5 5 0 1 .3 2 .9 2.9L24 42c-1.5.5-3.2.2-4.4-1-1.7-1.7-1.8-4.5-.2-6.3l3.2 3.2 4-4-3.2-3.2c1.8-1.6 4.6-1.5 6.3.2 1.2 1.2 1.5 2.9 1 4.4l12-12c-.9-.6-1.9-.9-2.9-.9z" fill="#2563eb"/>
</svg>`;

/* ============
   Modal
=========== */
const modalBackdrop = $("modalBackdrop");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const btnModalClose = $("btnModalClose");
btnModalClose.onclick = closeModal;
modalBackdrop.addEventListener("click", (e)=>{ if(e.target===modalBackdrop) closeModal(); });

// pour éviter l\'avertissement aria-hidden (focus gardé dans le modal)
let _lastFocusedBeforeModal = null;

function openModal(title, html){
  _lastFocusedBeforeModal = document.activeElement;

  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modalBackdrop.style.display = "flex";
  modalBackdrop.setAttribute("aria-hidden","false");
  modalBackdrop.removeAttribute("inert");

  document.body.classList.add("modal-open");

  // focus sur le bouton fermer (accessibilité)
  setTimeout(()=>{ try{ btnModalClose && btnModalClose.focus(); }catch(e){} }, 0);
}

function closeModal(){
  // si le focus est dans le modal, on le retire avant de cacher (sinon warning aria-hidden)
  try{
    if(modalBackdrop.contains(document.activeElement)){
      document.activeElement.blur();
    }
  }catch(e){}

  modalBackdrop.style.display = "none";
  modalBackdrop.setAttribute("aria-hidden","true");
  modalBackdrop.setAttribute("inert", "");
  modalBody.innerHTML = "";

  document.body.classList.remove("modal-open");

  // revenir au dernier élément focus
  try{
    if(_lastFocusedBeforeModal && _lastFocusedBeforeModal.focus) _lastFocusedBeforeModal.focus();
  }catch(e){}
  _lastFocusedBeforeModal = null;
}

/* ============
   Navigation
=========== */
function go(view){
  if(currentRole === "mechanic" && (view==="dashboard" || view==="settings" || view==="revenue")){
    view = "repairs";
  }
  for(const k in views) views[k].style.display = (k===view) ? "" : "none";
  const titles = {dashboard:"Dashboard", clients:"Clients", repairs:"Réparations", revenue:"Revenus", settings:"Paramètres"};
  pageTitle.textContent = titles[view] || "Garage Pro One";
}
document.querySelectorAll("[data-go]").forEach(btn=>{
  btn.addEventListener("click", ()=>go(btn.getAttribute("data-go")));
});

/* ============
   Firestore paths (per user)
=========== */
let currentUid = null;
// DB structure (current):
//   /customers, /vehicles, /workorders, /appointments, /meta, /users/{uid}
// We force ROOT mode to match your Firestore rules.
let DATA_MODE = "root";

function colCustomers(){
  if(DATA_MODE==="root") return collection(db, "customers");
  if(DATA_MODE==="nested") return collection(db, "customers", "customers", "customers");
  return collection(db, "users", currentUid, "customers");
}
function colVehicles(){
  if(DATA_MODE==="root") return collection(db, "vehicles");
  if(DATA_MODE==="nested") return collection(db, "vehicles", "vehicles", "vehicles");
  return collection(db, "users", currentUid, "vehicles");
}
function colWorkorders(){
  if(DATA_MODE==="root") return collection(db, "workorders");
  if(DATA_MODE==="nested") return collection(db, "workorders", "workorders", "workorders");
  return collection(db, "users", currentUid, "workorders");
}
function colAppointments(){
  if(DATA_MODE==="root") return collection(db, "appointments");
  if(DATA_MODE==="nested") return collection(db, "appointments", "appointments", "appointments");
  return collection(db, "users", currentUid, "appointments");
}
function docSettings(){
  if(DATA_MODE==="root") return doc(db, "meta", "settings");
  if(DATA_MODE==="nested") return doc(db, "meta", "settings"); // shared
  return doc(db, "users", currentUid, "meta", "settings");
}
function docCounters(){
  if(DATA_MODE==="root") return doc(db, "meta", "counters");
  if(DATA_MODE==="nested") return doc(db, "meta", "counters");
  return doc(db, "users", currentUid, "meta", "counters");
}
async function _hasAnyDocs(colRef){
  try{
    const snap = await getDocs(query(colRef, limit(1)));
    return snap.docs.length>0;
  }catch(e){ return false; }
}
async function detectDataMode(){
  return "root";
}

/* ============
   Live cache
=========== */
let customers = [];
let vehicles = [];
let workorders = [];
let settings = { tpsRate: 0.05, tvqRate: 0.09975 };

let unsubSettings = null;
let unsubCustomers = null;
let unsubVehicles = null;
let unsubWorkorders = null;

/* ============
   Auth UI
=========== */
$("year").textContent = new Date().getFullYear();

const tabLogin = $("tabLogin");
const tabRegister = $("tabRegister");
const formLogin = $("formLogin");
const formRegister = $("formRegister");
const authError = $("authError");
const authOk = $("authOk");

function showAuthMessage(kind, msg){
  authError.style.display = kind==="error" ? "" : "none";
  authOk.style.display = kind==="ok" ? "" : "none";
  if(kind==="error") authError.textContent = msg;
  if(kind==="ok") authOk.textContent = msg;
}

tabLogin.onclick = ()=>{
  tabLogin.classList.add("active"); tabRegister.classList.remove("active");
  formLogin.style.display = ""; formRegister.style.display = "none";
  showAuthMessage("", "");
};
tabRegister.onclick = ()=>{
  tabRegister.classList.add("active"); tabLogin.classList.remove("active");
  formRegister.style.display = ""; formLogin.style.display = "none";
  showAuthMessage("", "");
};

formLogin.onsubmit = async (e)=>{
  e.preventDefault();
  showAuthMessage("", "");
  const fd = new FormData(formLogin);
  const email = String(fd.get("email")||"").trim();
  const password = String(fd.get("password")||"");
  try{
    await signInWithEmailAndPassword(auth, email, password);
  }catch(err){
    showAuthMessage("error", err?.message || "Connexion impossible.");
  }
};

formRegister.onsubmit = async (e)=>{
  e.preventDefault();
  showAuthMessage("", "");
  const fd = new FormData(formRegister);
  const email = String(fd.get("email")||"").trim();
  const password = String(fd.get("password")||"");
  try{
    await createUserWithEmailAndPassword(auth, email, password);
    showAuthMessage("ok", "Compte créé. Tu es connecté.");
  }catch(err){
    showAuthMessage("error", err?.message || "Création impossible.");
  }
};

$("btnForgot").onclick = async ()=>{
  showAuthMessage("", "");
  const email = prompt("Entre ton email pour recevoir le lien de réinitialisation :");
  if(!email) return;
  try{
    await sendPasswordResetEmail(auth, email.trim());
    showAuthMessage("ok", "Email envoyé. Vérifie ta boîte de réception.");
  }catch(err){
    showAuthMessage("error", err?.message || "Impossible d'envoyer l'email.");
  }
};

$("btnLogout").onclick = async ()=>{ await signOut(auth); };

/* ============
   Snapshot subscriptions
=========== */
async function ensureSettingsDoc(){
  const ref = docSettings();
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, { tpsRate: 0.05, tvqRate: 0.09975, updatedAt: serverTimestamp() });
  }
  const cRef = docCounters();
  const cSnap = await getDoc(cRef);
  if(!cSnap.exists()){
    await setDoc(cRef, { invoiceNext: 1, updatedAt: serverTimestamp() });
  }
}

async function nextInvoiceNo(){
  const ref = docCounters();
  const n = await runTransaction(db, async (tx)=>{
    const s = await tx.get(ref);
    const cur = s.exists() ? Number(s.data().invoiceNext||1) : 1;
    tx.set(ref, { invoiceNext: cur+1, updatedAt: serverTimestamp() }, { merge:true });
    return cur;
  });
  return "GP-" + String(n).padStart(4,"0");
}

function subscribeAll(){
  // settings/meta are admin-only (rules)
  if(currentRole === "admin"){
    unsubSettings = onSnapshot(docSettings(), (snap)=>{
      if(snap.exists()){
        const d = snap.data();
        settings = {
          tpsRate: Number(d.tpsRate ?? 0.05),
          tvqRate: Number(d.tvqRate ?? 0.09975),
        };
        renderSettings();
        renderDashboard();
      }
    });
  }

  unsubCustomers = onSnapshot(query(colCustomers(), orderBy("fullName", "asc")), (snap)=>{
    customers = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(currentRole === "admin") renderDashboard();
    renderClients();
    if(currentRole === "admin") renderRevenue();
  });

  unsubVehicles = onSnapshot(query(colVehicles(), orderBy("createdAt", "desc")), (snap)=>{
    vehicles = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(currentRole === "admin") renderDashboard();
    renderClients();
    if(currentRole === "admin") renderRevenue();
  });

  const woQ = (currentRole === "mechanic")
    ? query(colWorkorders(), where("assignedTo","==", currentUid), limit(400))
    : query(colWorkorders(), orderBy("createdAt", "desc"), limit(400));

  unsubWorkorders = onSnapshot(
    woQ,
    (snap)=>{
      workorders = snap.docs.map(d=>({id:d.id, ...d.data()}));
      if(currentRole === "admin") renderDashboard();
      renderRepairs();
      if(currentRole === "admin") renderRevenue();
    },
    (err)=>{
      console.warn('workorders onSnapshot error', err);
      showToast("Accès refusé: réparations. Vérifie le champ role dans /users/{uid} (admin ou mechanic).", true);
    }
  );
}

function unsubscribeAll(){
  if(unsubSettings) unsubSettings();
  if(unsubCustomers) unsubCustomers();
  if(unsubVehicles) unsubVehicles();
  if(unsubWorkorders) unsubWorkorders();
  unsubSettings = unsubCustomers = unsubVehicles = unsubWorkorders = null;
}

/* ============
   Renderers
=========== */
const kpiEl = $("kpi");
const openRepairsTbody = $("openRepairsTbody");
function getCustomer(id){ return customers.find(c=>c.id===id); }
function getVehicle(id){ return vehicles.find(v=>v.id===id); }

function renderDashboard(){
  if(currentRole === "mechanic"){
    $("dashboardCards").innerHTML = `<div class="note">Accès réservé à l'administrateur.</div>`;
    $("openRepairsTbody").innerHTML = `<tr><td colspan="4" class="muted">—</td></tr>`;
    return;
  }
  const totalCustomers = customers.length;
  const totalVehicles = vehicles.length;
  const openCount = workorders.filter(w=>w.status==="OUVERT").length;
  const monthKey = new Date().toISOString().slice(0,7);
  const monthTotal = workorders
    .filter(w=>String(w.createdAt||"").startsWith(monthKey))
    .reduce((sum,w)=>sum+Number(w.total||0),0);

  kpiEl.innerHTML = `
    <div class="box"><div class="muted">Clients</div><div class="val">${totalCustomers}</div></div>
    <div class="box"><div class="muted">Véhicules</div><div class="val">${totalVehicles}</div></div>
    <div class="box"><div class="muted">Réparations ouvertes</div><div class="val">${openCount}</div></div>
    <div class="box"><div class="muted">Total (${monthKey})</div><div class="val">${money(monthTotal)}</div></div>
  `;

  const open = [...workorders].filter(w=>w.status==="OUVERT").sort(byCreatedDesc).slice(0,20);
  if(open.length===0){
    openRepairsTbody.innerHTML = '<tr><td colspan="5" class="muted">Aucune réparation ouverte.</td></tr>';
  }else{
    openRepairsTbody.innerHTML = open.map(w=>{
      const v = getVehicle(w.vehicleId);
      const c = v ? getCustomer(v.customerId) : null;
      const client = c ? c.fullName : "—";
      const veh = v ? [v.year,v.make,v.model].filter(Boolean).join(" ") + (v.plate?` (${v.plate})`:"") : "—";
      const d = String(w.createdAt||"").slice(0,10);
      return `
        <tr>
          <td>${safe(d)}</td>
          <td>${safe(client)}</td>
          <td>${safe(veh)}</td>
          <td>${money(w.total)}</td>
          <td class="nowrap">
            <button class="btn btn-small" onclick="window.__openWorkorderView('${w.id}')">Ouvrir</button>
          </td>
        </tr>
      `;
    }).join("");
  }
}

/* Quick search */
$("btnQuickSearch").onclick = ()=>runQuickSearch();
$("btnClearSearch").onclick = ()=>{ $("quickSearch").value=""; $("searchResults").innerHTML = '<span class="muted">Tape une recherche pour afficher les résultats.</span>'; };
$("quickSearch").addEventListener("keydown", (e)=>{ if(e.key==="Enter") runQuickSearch(); });

function runQuickSearch(){
  const q = ($("quickSearch").value||"").trim().toLowerCase();
  if(!q){
    $("searchResults").innerHTML = '<span class="muted">Tape une recherche pour afficher les résultats.</span>';
    return;
  }
  const matches = [];
  for(const c of customers){
    const cHit = (c.fullName||"").toLowerCase().includes(q) ||
                 (c.phone||"").toLowerCase().includes(q) ||
                 (c.email||"").toLowerCase().includes(q);
    const vs = vehicles.filter(v=>v.customerId===c.id);
    const vHits = vs.filter(v =>
      (v.plate||"").toLowerCase().includes(q) ||
      (v.vin||"").toLowerCase().includes(q) ||
      (v.make||"").toLowerCase().includes(q) ||
      (v.model||"").toLowerCase().includes(q)
    );
    if(cHit || vHits.length){
      matches.push({c, vehicles: vHits.length ? vHits : vs.slice(0,1)});
    }
  }
  if(matches.length===0){
    $("searchResults").innerHTML = '<div class="muted">Aucun résultat.</div>';
    return;
  }
  const rows = matches.slice(0,50).map(m=>{
    const c = m.c;
    const v = (m.vehicles && m.vehicles[0]) ? m.vehicles[0] : null;
    const vehTxt = v ? [v.year,v.make,v.model].filter(Boolean).join(" ") : "";
    const plate = v?.plate || "";
    return `
      <tr>
        <td>${safe(c.fullName)}</td>
        <td>${safe(c.phone||"")}</td>
        <td>${safe(vehTxt)}</td>
        <td>${safe(plate)}</td>
        <td class="nowrap">
          <button class="btn btn-small" onclick="window.__openClientView('${c.id}')">Ouvrir</button>
          ${v ? `<button class="btn btn-small btn-ghost" onclick="window.__openWorkorderForm('${v.id}')">+ Réparation</button>` : ""}
        </td>
      </tr>
    `;
  }).join("");
  $("searchResults").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Client</th><th>Tél</th><th>Véhicule</th><th>Plaque</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/* Clients view */
const clientsTbody = $("clientsTbody");
const clientsCount = $("clientsCount");
$("btnClientsSearch").onclick = ()=>renderClients();
$("btnClientsClear").onclick = ()=>{ $("clientsSearch").value=""; renderClients(); };


/* ============
   Revenue view
=========== */
const revPresetEl = $("revPreset");
const revFromEl = $("revFrom");
const revToEl = $("revTo");
const revTotalEl = $("revTotal");
const revCountEl = $("revCount");
const revAvgEl = $("revAvg");
const revTbody = $("revTbody");
const btnRevApply = $("btnRevApply");

function isoDate(d){
  // YYYY-MM-DD in local time
  const tzOff = d.getTimezoneOffset()*60000;
  return new Date(d.getTime()-tzOff).toISOString().slice(0,10);
}
function firstDayOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastDayOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth()+1, 0);
}
function setRevenuePreset(preset){
  const now = new Date();
  if(preset === "today"){
    const t = isoDate(now);
    revFromEl.value = t;
    revToEl.value = t;
    revFromEl.disabled = true;
    revToEl.disabled = true;
  }else if(preset === "month"){
    revFromEl.value = isoDate(firstDayOfMonth(now));
    revToEl.value = isoDate(lastDayOfMonth(now));
    revFromEl.disabled = true;
    revToEl.disabled = true;
  }else{
    // custom
    if(!revFromEl.value) revFromEl.value = isoDate(firstDayOfMonth(now));
    if(!revToEl.value) revToEl.value = isoDate(now);
    revFromEl.disabled = false;
    revToEl.disabled = false;
  }
}
function revenueRange(){
  const from = (revFromEl && revFromEl.value) ? revFromEl.value : "0000-01-01";
  const to = (revToEl && revToEl.value) ? revToEl.value : "9999-12-31";
  return {from, to};
}
function workorderDateKey(w){
  const s = String(w.invoiceDate || w.createdAt || w.updatedAt || "");
  return s.slice(0,10);
}
function filterRevenueWorkorders(){
  const {from, to} = revenueRange();
  return workorders
    .filter(w=>Number(w.total||0) > 0)
    .filter(w=>!!w.invoiceNo) // seulement factures
    .filter(w=>{
      const k = workorderDateKey(w);
      return k && k >= from && k <= to;
    })
    .sort((a,b)=> (workorderDateKey(b).localeCompare(workorderDateKey(a))) || String(b.invoiceNo||"").localeCompare(String(a.invoiceNo||"")));
}

function renderRevenue(){
  if(!$("viewRevenue")) return;
  if(currentRole !== "admin"){
    // sécurité: revenue view admin only
    if(revTotalEl) revTotalEl.textContent = money(0);
    if(revCountEl) revCountEl.textContent = "0";
    if(revAvgEl) revAvgEl.textContent = money(0);
    if(revTbody) revTbody.innerHTML = '<tr><td colspan="7" class="muted">Accès réservé à l\'administrateur.</td></tr>';
    return;
  }

  const rows = filterRevenueWorkorders();
  const total = rows.reduce((s,w)=>s+Number(w.total||0),0);
  const count = rows.length;
  const avg = count ? total/count : 0;

  if(revTotalEl) revTotalEl.textContent = money(total);
  if(revCountEl) revCountEl.textContent = String(count);
  if(revAvgEl) revAvgEl.textContent = money(avg);

  if(!revTbody) return;

  if(count === 0){
    revTbody.innerHTML = '<tr><td colspan="7" class="muted">Aucune facture pour cette période.</td></tr>';
    return;
  }

  revTbody.innerHTML = rows.map(w=>{
    const v = getVehicle(w.vehicleId);
    const c = v ? getCustomer(v.customerId) : null;
    const client = c ? esc(c.fullName) : "—";
    const veh = v ? esc([v.year,v.make,v.model].filter(Boolean).join(" ")) + (v.plate ? " • " + esc(v.plate) : "") : "—";
    const date = esc(workorderDateKey(w) || "—");
    const method = esc(String(w.paymentMethod || "—"));
    const inv = esc(String(w.invoiceNo || "—"));
    const tot = money(Number(w.total||0));
    const btn = `<button class="btn btn-ghost" onclick="window.__printWorkorder('${w.id}')">PDF</button>`;
    return `<tr>
      <td>${inv}</td>
      <td>${date}</td>
      <td>${client}</td>
      <td>${veh}</td>
      <td>${method}</td>
      <td style="text-align:right">${tot}</td>
      <td class="no-print" style="text-align:right">${btn}</td>
    </tr>`;
  }).join("");
}

// init revenue controls
if(revPresetEl && revFromEl && revToEl){
  setRevenuePreset(revPresetEl.value || "month");
  revPresetEl.addEventListener("change", ()=>{
    setRevenuePreset(revPresetEl.value);
    renderRevenue();
  });
  if(btnRevApply) btnRevApply.addEventListener("click", ()=>renderRevenue());
}


function renderClients(){
  const q = ($("clientsSearch").value||"").trim().toLowerCase();
  let list = [...customers].sort((a,b)=> String(a.fullName||"").localeCompare(String(b.fullName||""), 'fr'));
  if(q){
    list = list.filter(c =>
      (c.fullName||"").toLowerCase().includes(q) ||
      (c.phone||"").toLowerCase().includes(q) ||
      (c.email||"").toLowerCase().includes(q)
    );
  }
  clientsCount.textContent = `${list.length} client(s)`;
  if(list.length===0){
    clientsTbody.innerHTML = '<tr><td colspan="4" class="muted">Aucun client.</td></tr>';
    return;
  }
  clientsTbody.innerHTML = list.map(c=>`
    <tr>
      <td>${safe(c.fullName)}</td>
      <td>${safe(c.phone||"")}</td>
      <td>${safe(c.email||"")}</td>
      <td class="nowrap">
        <button class="btn btn-small" onclick="window.__openClientView('${c.id}')">Ouvrir</button>
        <button class="btn btn-small btn-ghost" onclick="window.__openClientForm('${c.id}')">Modifier</button>
      </td>
    </tr>
  `).join("");
}

/* Repairs view */
const repairsTbody = $("repairsTbody");
const repairsCount = $("repairsCount");
$("btnRepairsFilter").onclick = ()=>renderRepairs();
      if(currentRole === "admin") renderRevenue();
$("btnRepairsClear").onclick = ()=>{ $("repairsSearch").value=""; $("repairsStatus").value=""; renderRepairs();
      if(currentRole === "admin") renderRevenue(); };

function renderRepairs(){
  const q = ($("repairsSearch").value||"").trim().toLowerCase();
  const st = $("repairsStatus").value;
  let list = [...workorders].sort(byCreatedDesc);
  if(st) list = list.filter(w=>w.status===st);
  if(q){
    list = list.filter(w=>{
      const v = getVehicle(w.vehicleId) || {};
      const c = v.customerId ? (getCustomer(v.customerId) || {}) : {};
      return (c.fullName||"").toLowerCase().includes(q) ||
             (c.phone||"").toLowerCase().includes(q) ||
             (v.plate||"").toLowerCase().includes(q);
    });
  }
  repairsCount.textContent = `${list.length} réparation(s)`;
  if(list.length===0){
    repairsTbody.innerHTML = '<tr><td colspan="6" class="muted">Aucune réparation.</td></tr>';
    return;
  }
  repairsTbody.innerHTML = list.map(w=>{
    const v = getVehicle(w.vehicleId);
    const c = v ? getCustomer(v.customerId) : null;
    const client = c ? c.fullName : "—";
    const veh = v ? [v.year,v.make,v.model].filter(Boolean).join(" ") + (v.plate?` (${v.plate})`:"") : "—";
    const d = String(w.createdAt||"").slice(0,10);
    const pill = w.status==="TERMINE" ? "pill-ok" : (w.status==="EN_COURS" ? "pill-blue" : "pill-warn");
    return `
      <tr>
        <td>${safe(d)}</td>
        <td>${safe(client)}</td>
        <td>${safe(veh)}</td>
        <td><span class="pill ${pill}">${safe(w.status)}</span></td>
        <td>${money(w.total)}</td>
        <td class="nowrap">
          <button class="btn btn-small" onclick="window.__openWorkorderView('${w.id}')">Ouvrir</button>
        </td>
      </tr>
    `;
  }).join("");
}

/* Settings */
$("btnSaveSettings").onclick = async ()=>{
  const tps = parseFloat(String($("setTps").value).replace(',','.'))/100;
  const tvq = parseFloat(String($("setTvq").value).replace(',','.'))/100;
  if(!isFinite(tps) || !isFinite(tvq) || tps<0 || tvq<0){
    alert("TPS/TVQ invalides.");
    return;
  }
  await setDoc(docSettings(), { tpsRate: tps, tvqRate: tvq, updatedAt: serverTimestamp() }, { merge:true });
  alert("Paramètres enregistrés.");
};
function renderSettings(){
  $("setTps").value = (settings.tpsRate*100).toFixed(3).replace(/\.000$/,'').replace(/0+$/,'').replace(/\.$/,'');
  $("setTvq").value = (settings.tvqRate*100).toFixed(3).replace(/\.000$/,'').replace(/0+$/,'').replace(/\.$/,'');
}

/* Export / Import */
$("btnExport").onclick = ()=>{
  const payload = { settings, customers, vehicles, workorders };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "garage-pro-one-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

$("importFile").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const txt = await file.text();
    const obj = JSON.parse(txt);
    if(!obj || typeof obj!=="object") throw new Error("format");
    if(!confirm("Importer ce JSON dans le cloud ? (écrase tout)")) return;
    await wipeCloudData();
    const batch = writeBatch(db);

    const tpsRate = Number(obj.settings?.tpsRate ?? 0.05);
    const tvqRate = Number(obj.settings?.tvqRate ?? 0.09975);
    batch.set(docSettings(), { tpsRate, tvqRate, updatedAt: serverTimestamp() }, { merge:true });

    for(const c of (obj.customers||[])){
      batch.set(doc(colCustomers()), { fullName:c.fullName||"", phone:c.phone||"", email:c.email||"", notes:c.notes||"", createdAt:c.createdAt||isoNow(), createdAtTs: serverTimestamp() });
    }
    for(const v of (obj.vehicles||[])){
      batch.set(doc(colVehicles()), {
        customerId: v.customerId||"",
        make:v.make||"", model:v.model||"", year:v.year||"",
        plate:v.plate||"", vin:v.vin||"", currentKm:v.currentKm||"",
        notes:v.notes||"", createdAt:v.createdAt||isoNow(),
        createdAtTs: serverTimestamp()
      });
    }
    for(const w of (obj.workorders||[])){
      batch.set(doc(colWorkorders()), {
        vehicleId: w.vehicleId||"",
        status: w.status||"OUVERT",
        km: w.km||"",
        reportedIssue: w.reportedIssue||"",
        diagnostic: w.diagnostic||"",
        workDone: w.workDone||"",
        notes: w.notes||"",
        items: Array.isArray(w.items)?w.items:[],
        subtotal: Number(w.subtotal||0),
        tpsRate: Number(w.tpsRate||tpsRate),
        tvqRate: Number(w.tvqRate||tvqRate),
        tpsAmount: Number(w.tpsAmount||0),
        tvqAmount: Number(w.tvqAmount||0),
        total: Number(w.total||0),
        createdAt: w.createdAt||isoNow(),
        createdAtTs: serverTimestamp()
      });
    }
    await batch.commit();
    alert("Import terminé.");
    go("dashboard");
  }catch(err){
    alert("Import impossible. Vérifie le JSON.");
  }finally{
    e.target.value="";
  }
});

$("btnResetCloud").onclick = async ()=>{
  if(!confirm("Tout supprimer dans le cloud ? (clients, véhicules, réparations)")) return;
  await wipeCloudData();
  alert("Cloud vidé.");
};

async function wipeCloudData(){
  const deletions = [];
  for(const c of (await getDocs(query(colCustomers(), limit(500)))).docs) deletions.push(deleteDoc(c.ref));
  for(const v of (await getDocs(query(colVehicles(), limit(1000)))).docs) deletions.push(deleteDoc(v.ref));
  for(const w of (await getDocs(query(colWorkorders(), limit(2000)))).docs) deletions.push(deleteDoc(w.ref));
  await Promise.all(deletions);
}

/* ============
   Entities & forms
=========== */
$("btnNewClient").onclick = ()=>openClientForm();
$("btnNewClient2").onclick = ()=>openClientForm();
$("btnNewRepair").onclick = ()=>openNewRepairChooser();
$("btnNewRepair2").onclick = ()=>openNewRepairChooser();

window.__openClientForm = openClientForm;
window.__openClientView = openClientView;
window.__openWorkorderForm = openWorkorderForm;
window.__openWorkorderView = openWorkorderView;
window.__openVehicleForm = openVehicleForm;
window.__openVehicleView = openVehicleView;

async function createCustomer(data){
  await addDoc(colCustomers(), { ...data, createdAt: isoNow(), createdAtTs: serverTimestamp() });
}
async function updateCustomer(id, data){
  await updateDoc(doc(colCustomers(), id), { ...data, updatedAt: serverTimestamp() });
}
async function deleteCustomer(id){
  const vdocs = (await getDocs(query(colVehicles(), where("customerId","==", id), limit(2000)))).docs;
  const batch = writeBatch(db);
  for(const v of vdocs){
    const wdocs = (await getDocs(query(colWorkorders(), where("vehicleId","==", v.id), limit(2000)))).docs;
    wdocs.forEach(w=>batch.delete(w.ref));
    batch.delete(v.ref);
  }
  batch.delete(doc(colCustomers(), id));
  await batch.commit();
}

function openClientForm(customerId=null){
  const editing = !!customerId;
  const c = editing ? customers.find(x=>x.id===customerId) : {fullName:"",phone:"",email:"",notes:""};
  if(editing && !c){ alert("Client introuvable."); return; }

  openModal(editing ? "Modifier client" : "Nouveau client", `
    <form class="form" id="clientForm">
      <div id="clientError" class="alert" style="display:none"></div>
      <label>Nom complet *</label>
      <input name="fullName" value="${safe(c.fullName||"")}" required />
      <label>Téléphone *</label>
      <input name="phone" value="${safe(c.phone||"")}" required />
      <label>Email</label>
      <input name="email" type="email" value="${safe(c.email||"")}" />
      <label>Notes</label>
      <textarea name="notes" rows="4">${safe(c.notes||"")}</textarea>
      <div class="row-between">
        <button class="btn btn-primary" type="submit">Enregistrer</button>
        <button class="btn btn-ghost" type="button" onclick="window.__closeModal()">Annuler</button>
      </div>
    </form>
  `);
  window.__closeModal = closeModal;

  $("clientForm").onsubmit = async (e)=>{
    e.preventDefault();
    if(currentRole !== "admin"){
      alert("Accès refusé : seul l’admin peut créer/modifier des clients.");
      return;
    }
    const fd = new FormData(e.target);
    const fullName = String(fd.get("fullName")||"").trim();
    const phone = String(fd.get("phone")||"").trim();
    const email = String(fd.get("email")||"").trim();
    const notes = String(fd.get("notes")||"").trim();
    const err = $("clientError");
    if(!fullName || !phone){
      err.style.display="";
      err.textContent = "Nom et téléphone sont obligatoires.";
      return;
    }
    try{
      if(editing) await updateCustomer(customerId, {fullName, phone, email, notes});
      else await createCustomer({fullName, phone, email, notes});
      closeModal();
    }catch(ex){
      const msg = (ex && ex.code === "permission-denied")
        ? "Accès refusé (règles Firestore). Seul l’admin peut enregistrer un client."
        : "Erreur sauvegarde client.";
      alert(msg);
    }
  };
}

function openClientView(customerId){
  const c = customers.find(x=>x.id===customerId);
  if(!c){ alert("Client introuvable."); return; }
  const vs = vehicles.filter(v=>v.customerId===c.id).sort(byCreatedDesc);
  const wos = workorders.filter(w=>{
    const v = getVehicle(w.vehicleId);
    return v && v.customerId===c.id;
  }).sort(byCreatedDesc);

  const vehRows = vs.length ? vs.map(v=>{
    const veh = [v.year,v.make,v.model].filter(Boolean).join(" ");
    return `
      <tr>
        <td>${safe(veh)}</td>
        <td>${safe(v.plate||"")}</td>
        <td class="muted">${safe(v.vin||"")}</td>
        <td class="nowrap">
          <button class="btn btn-small" onclick="window.__openVehicleView('${v.id}')">Ouvrir</button>
          ${currentRole === 'admin' ? `<button class="btn btn-small btn-ghost" onclick="window.__openWorkorderForm('${v.id}')">+ Réparation</button>` : ``}
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="4" class="muted">Aucun véhicule.</td></tr>`;

  const woRows = wos.length ? wos.map(w=>{
    const v = getVehicle(w.vehicleId);
    const veh = v ? [v.make,v.model].filter(Boolean).join(" ") + (v.plate?` (${v.plate})`:"") : "—";
    const pill = w.status==="TERMINE" ? "pill-ok" : (w.status==="EN_COURS" ? "pill-blue" : "pill-warn");
    return `
      <tr>
        <td>${safe(String(w.createdAt||"").slice(0,10))}</td>
        <td>${safe(veh)}</td>
        <td>${safe(w.km||"")}</td>
        <td><span class="pill ${pill}">${safe(w.status)}</span></td>
        <td>${money(w.total)}</td>
        <td class="nowrap"><button class="btn btn-small" onclick="window.__openWorkorderView('${w.id}')">Ouvrir</button></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="6" class="muted">Aucune réparation.</td></tr>`;

  openModal("Fiche client", `
    <div class="row-between">
      <div>
        <h2 style="margin:0">${safe(c.fullName)}</h2>
        <div class="muted" style="margin-top:6px">
          <strong>Tél:</strong> ${safe(c.phone||"")} &nbsp; • &nbsp;
          <strong>Email:</strong> ${safe(c.email||"")}
        </div>
      </div>
      ${currentRole === 'admin' ? `
      <div class="row">
        <button class="btn btn-small" onclick="window.__openClientForm('${c.id}')">Modifier</button>
        <button class="btn btn-small btn-ghost" onclick="window.__openVehicleForm(null, '${c.id}')">+ Véhicule</button>
        <button class="btn btn-small btn-danger" onclick="window.__deleteCustomer('${c.id}')">Supprimer</button>
      </div>
      ` : ``}
    </div>
    ${c.notes ? `<div class="note" style="margin-top:12px">${safe(c.notes).replace(/\n/g,'<br>')}</div>` : ""}
    <div class="divider"></div>
    <h3>Véhicules</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Véhicule</th><th>Plaque</th><th>VIN</th><th></th></tr></thead>
        <tbody>${vehRows}</tbody>
      </table>
    </div>
    <div class="divider"></div>
    <h3>Historique des réparations</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Véhicule</th><th>KM</th><th>Statut</th><th>Total</th><th></th></tr></thead>
        <tbody>${woRows}</tbody>
      </table>
    </div>
  `);
}
window.__deleteCustomer = async (id)=>{
  if(!confirm("Supprimer ce client (et ses véhicules/réparations) ?")) return;
  await deleteCustomer(id);
  closeModal();
};

/* Vehicles */
async function createVehicle(customerId, data){
  await addDoc(colVehicles(), { customerId, ...data, createdAt: isoNow(), createdAtTs: serverTimestamp() });
}
async function updateVehicle(id, data){
  await updateDoc(doc(colVehicles(), id), { ...data, updatedAt: serverTimestamp() });
}
async function deleteVehicle(id){
  const wdocs = (await getDocs(query(colWorkorders(), where("vehicleId","==", id), limit(2000)))).docs;
  const batch = writeBatch(db);
  wdocs.forEach(w=>batch.delete(w.ref));
  batch.delete(doc(colVehicles(), id));
  await batch.commit();
}

function openVehicleForm(vehicleId=null, customerId=null){
  const editing = !!vehicleId;
  const v = editing ? vehicles.find(x=>x.id===vehicleId) : {make:"",model:"",year:"",plate:"",vin:"",currentKm:"",notes:"",customerId};
  if(editing && !v){ alert("Véhicule introuvable."); return; }
  const c = customers.find(x=>x.id===customerId);
  if(!c){ alert("Client introuvable."); return; }

  openModal(editing ? "Modifier véhicule" : "Nouveau véhicule", `
    <div class="muted">Client: <strong>${safe(c.fullName)}</strong></div>
    <div class="divider"></div>
    <form class="form" id="vehicleForm">
      <div id="vehicleError" class="alert" style="display:none"></div>
      <label>Marque *</label>
      <input name="make" value="${safe(v.make||"")}" required />
      <label>Modèle *</label>
      <input name="model" value="${safe(v.model||"")}" required />
      <label>Année</label>
      <input name="year" inputmode="numeric" value="${safe(v.year||"")}" />
      <label>Plaque (recherche)</label>
      <input name="plate" value="${safe(v.plate||"")}" />
      <label>VIN</label>
      <input name="vin" value="${safe(v.vin||"")}" />
      <label>Kilométrage actuel</label>
      <input name="currentKm" inputmode="numeric" value="${safe(v.currentKm||"")}" />
      <label>Notes</label>
      <textarea name="notes" rows="4">${safe(v.notes||"")}</textarea>
      <div class="row-between">
        <button class="btn btn-primary" type="submit">Enregistrer</button>
        <button class="btn btn-ghost" type="button" onclick="window.__closeModal()">Annuler</button>
      </div>
    </form>
  `);

  $("vehicleForm").onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const make = String(fd.get("make")||"").trim();
    const model = String(fd.get("model")||"").trim();
    const year = String(fd.get("year")||"").trim();
    const plate = String(fd.get("plate")||"").trim();
    const vin = String(fd.get("vin")||"").trim();
    const currentKm = String(fd.get("currentKm")||"").trim();
    const notes = String(fd.get("notes")||"").trim();
    const err = $("vehicleError");
    if(!make || !model){
      err.style.display="";
      err.textContent = "Marque et modèle sont obligatoires.";
      return;
    }
    try{
      if(editing) await updateVehicle(vehicleId, {make,model,year,plate,vin,currentKm,notes});
      else await createVehicle(customerId, {make,model,year,plate,vin,currentKm,notes});
      closeModal();
    }catch(ex){
      alert("Erreur sauvegarde véhicule.");
    }
  };
}

function openVehicleView(vehicleId){
  const v = vehicles.find(x=>x.id===vehicleId);
  if(!v){ alert("Véhicule introuvable."); return; }
  const c = customers.find(x=>x.id===v.customerId);
  const wos = workorders.filter(w=>w.vehicleId===v.id).sort(byCreatedDesc);

  const woRows = wos.length ? wos.map(w=>{
    const pill = w.status==="TERMINE" ? "pill-ok" : (w.status==="EN_COURS" ? "pill-blue" : "pill-warn");
    return `
      <tr>
        <td>${safe(String(w.createdAt||"").slice(0,10))}</td>
        <td>${safe(w.km||"")}</td>
        <td><span class="pill ${pill}">${safe(w.status)}</span></td>
        <td>${money(w.total)}</td>
        <td class="nowrap"><button class="btn btn-small" onclick="window.__openWorkorderView('${w.id}')">Ouvrir</button></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="5" class="muted">Aucune réparation.</td></tr>`;

  const vehTxt = [v.year,v.make,v.model].filter(Boolean).join(" ");
  openModal("Fiche véhicule", `
    <div class="row-between">
      <div>
        <h2 style="margin:0">${safe(vehTxt)}</h2>
        <div class="muted" style="margin-top:6px">
          Client: <a href="#" onclick="window.__openClientView('${v.customerId}'); return false;">${safe(c?.fullName||"—")}</a><br/>
          Plaque: <strong>${safe(v.plate||"")}</strong> &nbsp; • &nbsp; VIN: ${safe(v.vin||"")}<br/>
          KM: ${safe(v.currentKm||"")}
        </div>
      </div>
      <div class="row">
        <button class="btn btn-small" onclick="window.__openVehicleForm('${v.id}', '${v.customerId}')">Modifier</button>
        <button class="btn btn-small btn-ghost" onclick="window.__openWorkorderForm('${v.id}')">+ Réparation</button>
        <button class="btn btn-small btn-danger" onclick="window.__deleteVehicle('${v.id}')">Supprimer</button>
      </div>
    </div>
    ${v.notes ? `<div class="note" style="margin-top:12px">${safe(v.notes).replace(/\n/g,'<br>')}</div>` : ""}
    <div class="divider"></div>
    <h3>Historique des réparations</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>KM</th><th>Statut</th><th>Total</th><th></th></tr></thead>
        <tbody>${woRows}</tbody>
      </table>
    </div>
  `);
}
window.__deleteVehicle = async (id)=>{
  if(!confirm("Supprimer ce véhicule (et ses réparations) ?")) return;
  await deleteVehicle(id);
  closeModal();
};

/* Workorders */
function calcTotals(items, tpsRate, tvqRate){
  let subtotal = 0;
  const clean = [];
  for(const it of items){
    const desc = String(it.desc||"").trim();
    if(!desc) continue;
    const type = (it.type==="MO") ? "MO" : "PIECE";
    const qty  = Math.max(0.000001, Number(String(it.qty||1).replace(',','.')) || 1);
    const unit = Math.max(0, Number(String(it.unit||0).replace(',','.')) || 0);
    const line = qty * unit;
    subtotal += line;
    clean.push({type, desc, qty, unit, line});
  }
  const tpsAmount = subtotal * tpsRate;
  const tvqAmount = subtotal * tvqRate;
  const total = subtotal + tpsAmount + tvqAmount;
  return {items: clean, subtotal, tpsAmount, tvqAmount, total};
}

function openNewRepairChooser(){
  if(customers.length===0){
    alert("Ajoute d'abord un client.");
    openClientForm();
    return;
  }
  openModal("Nouvelle réparation", `
    <p class="muted">Choisis un véhicule (recherche par nom client / plaque / VIN), puis crée la réparation.</p>
    <form class="form form-inline" onsubmit="return false;">
      <input id="chooseVehQ" placeholder="Nom / Téléphone / Plaque / VIN" />
      <button class="btn btn-primary" id="btnChooseVeh">Rechercher</button>
    </form>
    <div class="divider"></div>
    <div id="chooseVehRes" class="muted">Tape une recherche.</div>
  `);
  const qEl = $("chooseVehQ");
  const resEl = $("chooseVehRes");
  $("btnChooseVeh").onclick = ()=>{
    const q = (qEl.value||"").trim().toLowerCase();
    if(!q){ resEl.innerHTML = '<span class="muted">Tape une recherche.</span>'; return; }
    const rows = [];
    for(const v of vehicles){
      const c = getCustomer(v.customerId);
      const hit = (c?.fullName||"").toLowerCase().includes(q) ||
                  (c?.phone||"").toLowerCase().includes(q) ||
                  (v.plate||"").toLowerCase().includes(q) ||
                  (v.vin||"").toLowerCase().includes(q);
      if(hit) rows.push({v,c});
    }
    if(rows.length===0){ resEl.innerHTML = '<div class="muted">Aucun véhicule.</div>'; return; }
    resEl.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Client</th><th>Véhicule</th><th>Plaque</th><th></th></tr></thead>
          <tbody>
            ${rows.slice(0,50).map(r=>{
              const veh = [r.v.year,r.v.make,r.v.model].filter(Boolean).join(" ");
              return `
                <tr>
                  <td>${safe(r.c?.fullName||"—")}</td>
                  <td>${safe(veh)}</td>
                  <td>${safe(r.v.plate||"")}</td>
                  <td class="nowrap"><button class="btn btn-small" onclick="window.__openWorkorderForm('${r.v.id}')">Choisir</button></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  };
  qEl.addEventListener("keydown", (e)=>{ if(e.key==="Enter") $("btnChooseVeh").click(); });
}

async function createWorkorder(data){
  if(!data.invoiceNo){
    data.invoiceNo = await nextInvoiceNo();
  }
  await addDoc(colWorkorders(), { ...data, createdAt: isoNow(), createdAtTs: serverTimestamp(), createdBy: currentUid, updatedAt: isoNow(), updatedAtTs: serverTimestamp(), updatedBy: currentUid });
  if(data.km){
    await updateDoc(doc(colVehicles(), data.vehicleId), { currentKm: data.km, updatedAt: isoNow(), updatedAtTs: serverTimestamp() });
  }
}

function openWorkorderForm(vehicleId){
  const v = getVehicle(vehicleId);
  if(!v){ alert("Véhicule introuvable."); return; }
  const c = getCustomer(v.customerId);
  const vehTxt = [v.year,v.make,v.model].filter(Boolean).join(" ");

  openModal("Nouvelle réparation", `
    <div class="muted">
      Client: <strong>${safe(c?.fullName||"—")}</strong><br/>
      Véhicule: <strong>${safe(vehTxt)}</strong> ${v.plate?`— Plaque: <strong>${safe(v.plate)}</strong>`:""}
    </div>
    <div class="divider"></div>
    <form class="form" id="woForm">
      <div id="woError" class="alert" style="display:none"></div>
      <div class="row" style="gap:12px">
        <div style="flex:1; min-width:220px">
          <label>Statut</label>
          <select name="status">
            <option value="OUVERT">Ouvert</option>
            <option value="EN_COURS">En cours</option>
            <option value="TERMINE">Terminé</option>
          </select>
        </div>
        <div style="flex:1; min-width:220px">
          <label>KM (visite)</label>
          <input name="km" inputmode="numeric" placeholder="ex: 123456" />
        </div>
      </div>

      ${currentRole==="admin" ? `
      <div class="row" style="gap:12px">
        <div style="flex:1; min-width:220px">
          <label>Assigné à (mécanicien)</label>
          <select name="assignedTo">
            <option value="">— Non assigné —</option>
            ${mechanics.map(m=>`<option value="${m.uid}" ${wo?.assignedTo===m.uid ? "selected":""}>${safe(m.name)}</option>`).join("")}
          </select>
        </div>
      </div>

      ` : ``}

      <div class="row" style="gap:12px">
        <div style="flex:1; min-width:220px">
          <label>Paiement</label>
          <select name="paymentMethod">
            <option value="">Non défini</option>
            <option value="CASH">Cash</option>
            <option value="CARTE">Carte</option>
            <option value="VIREMENT">Virement</option>
            <option value="AUTRE">Autre</option>
          </select>
        </div>
        <div style="flex:1; min-width:220px">
          <label>Statut paiement</label>
          <select name="paymentStatus">
            <option value="NON_PAYE">Non payé</option>
            <option value="PAYE">Payé</option>
          </select>
        </div>
      </div>

      <label>Problème rapporté (client)</label>
      <textarea name="reportedIssue" rows="3" placeholder="ex: bruit avant gauche..."></textarea>
      <label>Diagnostic</label>
      <textarea name="diagnostic" rows="3"></textarea>
      <label>Travaux effectués</label>
      <textarea name="workDone" rows="3"></textarea>

      <h3>Lignes (pièces / main d’œuvre)</h3>
      <div class="table-wrap">
        <table id="itemsTable">
          <thead><tr><th>Type</th><th>Description</th><th>Qté</th><th>Prix</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="row">
        <button class="btn btn-ghost" type="button" id="btnAddLine">+ Ajouter une ligne</button>
        <span class="muted">Total TTC calculé automatiquement.</span>
      </div>
      <div class="note" id="totalsBox"></div>

      <label>Notes</label>
      <textarea name="notes" rows="3"></textarea>

      <div class="row-between">
        <button class="btn btn-primary" type="submit">Enregistrer</button>
        <button class="btn btn-ghost" type="button" onclick="window.__closeModal()">Annuler</button>
      </div>
    </form>
  `);

  const tbody = modalBody.querySelector("#itemsTable tbody");
  const totalsBox = modalBody.querySelector("#totalsBox");

  function addLine(def={}){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <select class="itType">
          <option value="PIECE">Pièce</option>
          <option value="MO">Main d’œuvre</option>
        </select>
      </td>
      <td><input class="itDesc" placeholder="ex: Plaquettes de frein" /></td>
      <td><input class="itQty" inputmode="decimal" value="1" /></td>
      <td><input class="itUnit" inputmode="decimal" placeholder="0.00" /></td>
      <td class="nowrap"><button class="btn btn-small btn-ghost" type="button">-</button></td>
    `;
    tbody.appendChild(tr);
    tr.querySelector(".itType").value = def.type || "PIECE";
    tr.querySelector(".itDesc").value = def.desc || "";
    tr.querySelector(".itQty").value  = (def.qty ?? 1);
    tr.querySelector(".itUnit").value = (def.unit ?? "");
    tr.querySelector("button").onclick = ()=>{ tr.remove(); recalc(); };
    ["input","change"].forEach(evt=>{
      tr.querySelector(".itType").addEventListener(evt, recalc);
      tr.querySelector(".itDesc").addEventListener(evt, recalc);
      tr.querySelector(".itQty").addEventListener(evt, recalc);
      tr.querySelector(".itUnit").addEventListener(evt, recalc);
    });
    recalc();
  }

  function collectItems(){
    const rows = [...tbody.querySelectorAll("tr")];
    return rows.map(r=>({
      type: r.querySelector(".itType").value,
      desc: r.querySelector(".itDesc").value,
      qty:  r.querySelector(".itQty").value,
      unit: r.querySelector(".itUnit").value
    }));
  }

  function recalc(){
    const items = collectItems();
    const t = calcTotals(items, settings.tpsRate, settings.tvqRate);
    totalsBox.innerHTML = `
      <div class="row-between"><span>Sous-total</span><strong>${money(t.subtotal)}</strong></div>
      <div class="row-between"><span>TPS (${pct(settings.tpsRate)})</span><strong>${money(t.tpsAmount)}</strong></div>
      <div class="row-between"><span>TVQ (${pct(settings.tvqRate)})</span><strong>${money(t.tvqAmount)}</strong></div>
      <div class="divider"></div>
      <div class="row-between" style="font-size:16px"><span><strong>Total TTC</strong></span><strong>${money(t.total)}</strong></div>
    `;
  }

  $("btnAddLine").onclick = ()=>addLine({});
  for(let i=0;i<5;i++) addLine({type:"PIECE", qty:1});

  $("woForm").onsubmit = async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const status = String(fd.get("status")||"OUVERT");
    const km = String(fd.get("km")||"").trim();
    const reportedIssue = String(fd.get("reportedIssue")||"").trim();
    const diagnostic = String(fd.get("diagnostic")||"").trim();
    const workDone = String(fd.get("workDone")||"").trim();
    const notes = String(fd.get("notes")||"").trim();
    const paymentMethod = String(fd.get("paymentMethod")||"").trim();
    const paymentStatus = String(fd.get("paymentStatus")||"NON_PAYE").trim();
    const assignedTo = String(fd.get("assignedTo")||"").trim();
    const assignedName = mechanics.find(m=>m.uid===assignedTo)?.name || "";

    const items = collectItems();
    const t = calcTotals(items, settings.tpsRate, settings.tvqRate);

    const err = $("woError");
    if(!reportedIssue && !workDone && t.items.length===0){
      err.style.display="";
      err.textContent = "Ajoute au moins un problème, un travail, ou une ligne de facture.";
      return;
    }
    try{
      await createWorkorder({
        vehicleId,
        status: (status==="TERMINE"?"TERMINE":(status==="EN_COURS"?"EN_COURS":"OUVERT")),
        km, reportedIssue, diagnostic, workDone, notes, paymentMethod, paymentStatus,
        assignedTo: (currentRole==="admin" ? assignedTo : currentUid),
        assignedName: (currentRole==="admin" ? assignedName : (currentUserName || "")),
        
        items: t.items,
        subtotal: t.subtotal,
        tpsRate: settings.tpsRate,
        tvqRate: settings.tvqRate,
        tpsAmount: t.tpsAmount,
        tvqAmount: t.tvqAmount,
        total: t.total
      });
      closeModal();
    }catch(ex){
      alert("Erreur sauvegarde réparation.");
    }
  };
}

async function setWorkorderStatus(id, status){
  const ref = docWorkorder(id);
  await updateDoc(ref, { status, updatedAt: isoNow(), updatedAtTs: serverTimestamp(), updatedBy: currentUid });
}

async function toggleWorkorderStatus(id, next){
  await updateDoc(doc(colWorkorders(), id), { status: next, updatedAt: serverTimestamp() });
}
async function deleteWorkorder(id){
  await deleteDoc(doc(colWorkorders(), id));
}

function openWorkorderView(workorderId){
  const wo = workorders.find(w=>w.id===workorderId);
  if(!wo){ alert("Réparation introuvable."); return; }
  const v = getVehicle(wo.vehicleId);
  const c = v ? getCustomer(v.customerId) : null;
  const vehTxt = v ? [v.year,v.make,v.model].filter(Boolean).join(" ") : "—";
  const pill = wo.status==="TERMINE" ? "pill-ok" : (wo.status==="EN_COURS" ? "pill-blue" : "pill-warn");

  const itemsRows = (wo.items && wo.items.length) ? wo.items.map(it=>`
    <tr>
      <td>${it.type==="MO" ? "Main d’œuvre" : "Pièce"}</td>
      <td>${safe(it.desc)}</td>
      <td>${safe(it.qty)}</td>
      <td>${money(it.unit)}</td>
      <td>${money(it.line)}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="muted">Aucune ligne.</td></tr>`;

  openModal("Réparation", `
    <div class="row-between">
      <div>
        <h2 style="margin:0">Réparation</h2>
        <div class="muted" style="margin-top:6px">
          Date: ${safe(String(wo.createdAt||"").slice(0,16))} —
          Statut: <span class="pill ${pill}">${safe(wo.status)}</span> — Assigné: <strong>${safe(wo.assignedName || "—")}</strong>
        </div>
      </div>
      <div class="row">
        <button class="btn btn-small" onclick="window.__printWorkorder('${wo.id}')">Imprimer / PDF</button>
        ${wo.status!=="EN_COURS" ? `<button class="btn btn-small btn-ghost" onclick="window.__setWoStatus('${wo.id}', 'EN_COURS')">Démarrer</button>` : ``}
        ${wo.status!=="TERMINE" ? `<button class="btn btn-small btn-ghost" onclick="window.__setWoStatus('${wo.id}', 'TERMINE')">Terminer</button>` : `<button class="btn btn-small btn-ghost" onclick="window.__setWoStatus('${wo.id}', 'OUVERT')">Rouvrir</button>`}
        ${currentRole==="admin" ? `<button class="btn btn-small btn-danger" onclick="window.__deleteWo('${wo.id}')">Supprimer</button>` : ``}
      </div>
    </div>
    <div class="divider"></div>
    <div class="grid" style="grid-template-columns:1fr; gap:12px">
      <div class="note">
        <strong>Client</strong><br/>
        ${safe(c?.fullName||"—")}<br/>
        ${safe(c?.phone||"")}<br/>
        ${safe(c?.email||"")}
      </div>
      <div class="note">
        <strong>Véhicule</strong><br/>
        ${safe(vehTxt)}<br/>
        Plaque: ${safe(v?.plate||"")}<br/>
        VIN: ${safe(v?.vin||"")}<br/>
        KM (visite): ${safe(wo.km||"")}
      </div>
    </div>
    ${wo.reportedIssue ? `<h3>Problème rapporté</h3><div class="note">${safe(wo.reportedIssue).replace(/\n/g,'<br>')}</div>` : ""}
    ${wo.diagnostic ? `<h3>Diagnostic</h3><div class="note">${safe(wo.diagnostic).replace(/\n/g,'<br>')}</div>` : ""}
    ${wo.workDone ? `<h3>Travaux effectués</h3><div class="note">${safe(wo.workDone).replace(/\n/g,'<br>')}</div>` : ""}
    <h3>Détails</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Type</th><th>Description</th><th>Qté</th><th>Prix</th><th>Total</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>
    </div>
    <div class="divider"></div>
    <div class="note">
      <div class="row-between"><span>Sous-total</span><strong>${money(wo.subtotal)}</strong></div>
      <div class="row-between"><span>TPS (${pct(wo.tpsRate)})</span><strong>${money(wo.tpsAmount)}</strong></div>
      <div class="row-between"><span>TVQ (${pct(wo.tvqRate)})</span><strong>${money(wo.tvqAmount)}</strong></div>
      <div class="divider"></div>
      <div class="row-between" style="font-size:16px"><span><strong>Total TTC</strong></span><strong>${money(wo.total)}</strong></div>
    </div>
    ${wo.notes ? `<h3>Notes</h3><div class="note">${safe(wo.notes).replace(/\n/g,'<br>')}</div>` : ""}
  `);
}
window.__setWoStatus = async (id, next)=>{ await setWorkorderStatus(id, next); closeModal(); };
window.__deleteWo = async (id)=>{ if(!confirm("Supprimer cette réparation ?")) return; await deleteWorkorder(id); closeModal(); };

/* Print */
window.__printWorkorder = async (workorderId)=>{
  const wo = workorders.find(w=>w.id===workorderId);
  if(!wo) return;
  const v = getVehicle(wo.vehicleId);
  const c = v ? getCustomer(v.customerId) : null;
  const vehTxt = v ? [v.year,v.make,v.model].filter(Boolean).join(" ") : "—";
  const rows = (wo.items||[]).map(it=>`
    <tr>
      <td>${it.type==="MO"?"Main d'œuvre":"Pièce"}</td>
      <td>${safe(it.desc)}</td>
      <td>${safe(it.qty)}</td>
      <td>${money(it.unit)}</td>
      <td>${money(it.line)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">Aucune ligne</td></tr>`;

    const html = `
  <!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safe(wo.invoiceNo||"Réparation")} — ${safe(GARAGE.name)}</title>
  <style>
  body{font-family:Arial,sans-serif;margin:24px;color:#111;}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}
  h1{margin:0 0 6px 0;font-size:20px;}
  h2{margin:0 0 2px 0;font-size:16px;}
  .muted{color:#555;font-size:12px;}
  .small{font-size:11px;color:#555;}
  .box{border:1px solid #ddd;padding:12px;border-radius:10px;}
  .headerCard{border:1px solid #ddd;border-radius:12px;padding:14px;}
  .brandRow{display:flex;gap:12px;align-items:center;}
  table{width:100%;border-collapse:collapse;margin-top:12px;}
  th,td{border-bottom:1px solid #eee;padding:8px;text-align:left;font-size:13px;}
  th{background:#fafafa;}
  .tot{margin-top:12px;max-width:360px;margin-left:auto;}
  .tot div{display:flex;justify-content:space-between;padding:4px 0;}
  .grand{font-weight:bold;font-size:16px;border-top:1px solid #ddd;padding-top:8px;}
  @media print{.no-print{display:none;}body{margin:0;}}
  </style></head><body>
  <div class="no-print" style="margin-bottom:12px;"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
  
  <div class="headerCard">
    <div class="top">
      <div class="brandRow">
        <div>${GARAGE_LOGO_SVG}</div>
        <div>
          <h1>${safe(GARAGE.name)}</h1>
          <div class="muted">${safe(GARAGE.address1)} — ${safe(GARAGE.address2)} — ${safe(GARAGE.country)}</div>
          <div class="muted">${safe(GARAGE.email)} • ${safe(GARAGE.phone)}</div>
          <div class="small">${safe(GARAGE.tagline)}</div>
        </div>
      </div>
      <div class="muted" style="text-align:right">
        <div><strong>Date:</strong> ${safe(String(wo.createdAt||"").slice(0,16))}</div>
        <div><strong>Statut:</strong> ${safe(wo.status)}</div>
        <div class="small" style="margin-top:6px">TPS/TVH: ${safe(GARAGE.tps)}<br/>TVQ: ${safe(GARAGE.tvq)}</div>
      </div>
    </div>
  </div>
  
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
    <div class="box"><strong>Client</strong><br>${safe(c?.fullName||"—")}<br>${safe(c?.phone||"")}<br>${safe(c?.email||"")}</div>
    <div class="box"><strong>Véhicule</strong><br>${safe(vehTxt)}<br>Plaque: ${safe(v?.plate||"")}<br>VIN: ${safe(v?.vin||"")}<br>KM (visite): ${safe(wo.km||"")}</div>
  </div>
  <h2 style="margin-top:14px;">Détails</h2>
  <table><thead><tr><th>Type</th><th>Description</th><th>Qté</th><th>Prix</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="tot">
    <div><span>Sous-total</span><span>${money(wo.subtotal)}</span></div>
    <div><span>TPS (${pct(wo.tpsRate)})</span><span>${money(wo.tpsAmount)}</span></div>
    <div><span>TVQ (${pct(wo.tvqRate)})</span><span>${money(wo.tvqAmount)}</span></div>
    <div class="grand"><span>Total TTC</span><span>${money(wo.total)}</span></div>
  </div>
  </body></html>`;
  // Sauvegarde automatique (HTML) dans l'historique
  try{ await updateDoc(doc(colWorkorders(), workorderId), { invoiceHtml: html, invoiceSavedAt: serverTimestamp() }); }catch(e){}
  const w = window.open("", "_blank");
  w.document.open(); w.document.write(html); w.document.close();
};

/* Auth boot */
onAuthStateChanged(auth, async (user)=>{
  if(user){
    currentUid = user.uid;
    DATA_MODE = await detectDataMode();
    await ensureUserProfile(user);
    await loadRole();

    // If profile is missing, loadRole() signs out.
    if(!currentUid || currentRole === "unknown") return;

    $("viewAuth").style.display = "none";
    $("viewApp").style.display = "";
    $("navAuthed").style.display = "";

    if(unsubProfile) try{unsubProfile();}catch(e){}
    unsubProfile = onSnapshot(docUserProfile(), (snap)=>{
      if(snap.exists()){
        const d = snap.data();
        currentRole = (d.role === "admin") ? "admin" : "mechanic";
        currentUserName = d.name || d.email || "";
        applyRoleUI();
      }
    });

    // settings/meta are admin-only (rules)
    if(currentRole === "admin"){
      if (currentRole === "admin") {
        await ensureSettingsDoc();
      }
      await loadMechanics();
    }
    unsubscribeAll();
    subscribeAll();

    if(currentRole === "mechanic"){
      go("repairs");
    }else{
      go("dashboard");
    }
    if(currentRole === "admin") renderSettings();
  }else{
    currentUid = null;
    currentRole = "unknown";
    currentUserName = "";
    if(unsubProfile) try{unsubProfile();}catch(e){}
    unsubProfile = null;

    unsubscribeAll();
    customers = []; vehicles = []; workorders = [];
    $("viewApp").style.display = "none";
    $("navAuthed").style.display = "none";
    $("viewAuth").style.display = "";
    showAuthMessage("", "");
  }
});
