console.log('🚀 App starting...');
console.log('🔥 window.firebaseConfig:', window.firebaseConfig);


// ===== Helper: normalizeEmail (added fix) =====
function normalizeEmail(data){
  const v =
    data?.email ??
    data?.Email ??
    data?.courriel ??
    data?.mail ??
    data?.Mail ??
    "";
  return String(v).trim().toLowerCase();
}
// ===== End helper =====

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp, onSnapshot, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

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
const functions = getFunctions(app);

/* ============
   Roles (admin / mechanic)
=========== */
// role is stored in Firestore at /users/{uid}.role
// possible values: "admin" | "mechanic"
let currentRole = "unknown";
let currentUserName = "";
let unsubProfile = null;
let mechanics = [];
let unsubStaffLive = null;
let unsubInvitesLive = null;
let staffLiveRows = [];
let invitesLiveRows = [];

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


// Normalize customer email field (supports different schemas)
function getCustomerEmail(c){
  const v = ((c && (c.email ?? c.mail ?? c.emailAddress ?? c.email_address ?? c.courriel ?? c.emailClient)) ?? "");
  return String(v).trim();
}

function docUserProfile(uid=currentUid){
  return doc(db, "users", uid);
}

function docStaffProfile(uid=currentUid){
  return doc(db, "staff", uid);
}

async function ensureUserProfile(_user){
  // IMPORTANT: with your Firestore rules, ONLY an admin can create/update /users/{uid}.
  // So we do NOT auto-create anything here.
  return;
}

async function loadRole(){
  if(!currentUid) return;
  try{
    const snap = await getDoc(docStaffProfile());
    if(!snap.exists()){
      currentRole = "unknown";
      currentUserName = "";
      applyRoleUI();
      alert(
        "Compte non autorisé (staff manquant).\\n\\n"+
        "Demande à l’admin de t’envoyer une invitation, puis crée ton compte via le code.\\n\\n"+
        "UID: "+currentUid
      );
      await signOut(auth);
      return;
    }
    const d = snap.data() || {};
    if(d.disabled === true){
      alert("Compte désactivé. Contacte l’admin.");
      await signOut(auth);
      return;
    }
    const normalized = normalizeRole(d.role);
    if (!normalized) {
      roleNeedsSetup = true;
      currentRole = "mechanic";
    } else {
      roleNeedsSetup = false;
      currentRole = normalized;
    }
    currentUserName = d.fullName || d.name || d.email || auth.currentUser.email || "";
    window.currentRole = currentRole;
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
    const snap = await getDocs(query(collection(db, "staff"), where("role","==","mechanic")));
    mechanics = snap.docs.map(d=>({uid:d.id, ...(d.data()||{})}))
      .map(u=>({uid:u.uid, name:u.fullName || u.name || u.email || u.uid, email:u.email||""}));
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
  promotions: $("viewPromotions"),
  settings: $("viewSettings"),
  revenue: $("viewRevenue"),
  invoices: $("viewInvoices"),
};
const pageTitle = $("pageTitle");

function safe(s){ return String(s??"").replace(/[&<>"]/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
function money(n){
  const x = Number(n||0);
  return x.toLocaleString('fr-CA', {minimumFractionDigits:2, maximumFractionDigits:2}) + " $";
}

function monthKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function drawBarChart(canvas, labels, values){
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,w,h);

  const max = Math.max(1, ...values.map(v=>Math.max(0,v)));
  const pad = 28;
  const bw = (w - pad*2) / Math.max(1, values.length);
  ctx.strokeStyle = "#ddd";
  ctx.beginPath();
  ctx.moveTo(pad, h-pad);
  ctx.lineTo(w-pad, h-pad);
  ctx.stroke();

  for(let i=0;i<values.length;i++){
    const v = Math.max(0, values[i]);
    const bh = (h - pad*2) * (v / max);
    const x = pad + i*bw + 2;
    const y = (h - pad) - bh;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(x, y, bw-4, bh);

    ctx.fillStyle = "#666";
    ctx.font = "12px system-ui";
    ctx.fillText(labels[i], x, h-10);
  }
  ctx.fillStyle="#666";
  ctx.font="12px system-ui";
  ctx.fillText(money(max), 6, 14);
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

const toastEl = $("toast");
let toastTimer = null;
function showToast(message, ms=3500){
  if(!toastEl) return;
  // compat: ancien code passait true/false
  if(ms === true) ms = 7000;
  if(ms === false) ms = 3500;
  toastEl.textContent = String(message||"");
  toastEl.style.display = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ toastEl.style.display="none"; }, ms);
}
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

// Delegation click (iOS Safari peut ignorer onclick dans du HTML injecté)
modalBody.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button[data-act]");
  if(!btn) return;
  const act = btn.dataset.act;
  try{
    if(act==="printWo"){
      await window.__printWorkorder(btn.dataset.id);
    }else if(act==="setWoStatus"){
      await window.__setWoStatus(btn.dataset.id, btn.dataset.status);
    }else if(act==="deleteWo"){
      await window.__deleteWo(btn.dataset.id);
    }
  }catch(err){
    console.error(err);
    alert("Erreur: action impossible (vérifie les règles Firestore / connexion).");
  }
});

function _handleModalAction(e){
  const btn = e.target && e.target.closest ? e.target.closest("button[data-act]") : null;
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const act = btn.dataset.act;
  (async ()=>{
    try{
      if(act==="printWo"){
        await window.__printWorkorder(btn.dataset.id);
      }else if(act==="setWoStatus"){
        await window.__setWoStatus(btn.dataset.id, btn.dataset.status);
      }else if(act==="deleteWo"){
        await window.__deleteWo(btn.dataset.id);
      }
    }catch(err){
      console.error(err);
      alert("Erreur: action impossible (vérifie les règles Firestore / connexion).");
    }
  })();
}
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
  if(currentRole === "mechanic" && (view==="dashboard" || view==="settings" || view==="revenue" || view==="promotions" || view==="invoices")){
    view = "repairs";
  }
  for(const k in views) views[k].style.display = (k===view) ? "" : "none";
  const titles = {dashboard:"Dashboard", clients:"Clients", repairs:"Réparations", promotions:"Promotions", revenue:"Revenus", invoices:"Factures pièces", settings:"Paramètres"};
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

function colInvoices(){
  if(DATA_MODE==="root") return collection(db, "invoices");
  if(DATA_MODE==="nested") return collection(db, "users", currentUid, "invoices");
  return collection(db, "invoices");
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

function colPromotions(){
  if(DATA_MODE==="root") return collection(db, "promotions");
  if(DATA_MODE==="nested") return collection(db, "promotions", "promotions", "promotions");
  return collection(db, "users", currentUid, "promotions");
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
let invoices = [];
let settings = { tpsRate: 0.05, tvqRate: 0.09975 , cardFeeRate: 0.025, laborRate: 80, garageName:"Garage Pro One", garageAddress:"", garagePhone:"", garageEmail:"", signatureName:"" };

let promotions = [];
let selectedPromotionId = null;

let unsubSettings = null;
let unsubCustomers = null;
let unsubVehicles = null;
let unsubWorkorders = null;
let unsubPromotions = null;
let unsubInvoices = null;

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

    // Promotions (admin only)
    unsubPromotions = onSnapshot(query(colPromotions(), orderBy("createdAt", "desc"), limit(200)), (snap)=>{
      promotions = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderPromotions();
    });
    // Staff list (admin only) - realtime
    if(unsubStaffLive) try{unsubStaffLive();}catch(e){}
    unsubStaffLive = onSnapshot(query(collection(db,"staff"), orderBy("createdAt","desc"), limit(200)), (snap)=>{
      staffLiveRows = snap.docs.map(d=>({uid:d.id, ...(d.data()||{})}));
      renderStaffRows(staffLiveRows);
    });

    // Invites list (admin only) - realtime
    if(unsubInvitesLive) try{unsubInvitesLive();}catch(e){}
    unsubInvitesLive = onSnapshot(query(collection(db,"invites"), orderBy("createdAt","desc"), limit(200)), (snap)=>{
      invitesLiveRows = snap.docs.map(d=>({code:d.id, ...(d.data()||{})}));
      renderInviteRows(invitesLiveRows);
    });

  }

  unsubCustomers = onSnapshot(query(colCustomers(), orderBy("fullName", "asc")), (snap)=>{
    // Normalisation: certains clients ont l'email sous Email/courriel/mail...
    // On force un champ `email` unique utilisé partout (Clients, Promotions, etc.).
    customers = snap.docs.map(d=>{
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        fullName: String(data.fullName || data.name || "").trim(),
        phone: String(data.phone || data.tel || data.mobile || "").trim(),
        email: normalizeEmail(data),
        promoSelected: data.promoSelected === true,
      };
    });
    if(currentRole === "admin") renderDashboard();
    renderClients();
    fillInvoiceCustomers();
    fillInvoiceWorkorders();
    if(currentRole === "admin") renderRevenue();
    if(currentRole === "admin") renderPromotions();
  });

  unsubVehicles = onSnapshot(query(colVehicles(), orderBy("createdAt", "desc")), (snap)=>{
    vehicles = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(currentRole === "admin") renderDashboard();
    renderClients();
    fillInvoiceCustomers();
    fillInvoiceWorkorders();
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
      fillInvoiceWorkorders();
      if(currentRole === "admin") renderRevenue();
    },
    (err)=>{
      console.warn('workorders onSnapshot error', err);
      showToast("Accès refusé: réparations. Vérifie le champ role dans /users/{uid} (admin ou mechanic).", true);
    }
  );


  // Invoices (admin)
  if(currentRole === "admin"){
    const invQ = query(colInvoices(), orderBy("date", "desc"), limit(500));
    unsubInvoices = onSnapshot(invQ,
      (snap)=>{
        invoices = snap.docs.map(d=>({id:d.id, ...d.data()}));
        renderInvoices();
        renderRevenue();
        renderFinanceDashboard();
      },
      (err)=>{
        console.warn('invoices onSnapshot error', err);
        showToast("Accès refusé: factures. Vérifie les rules /invoices et ton rôle admin.", 7000);
      }
    );
  }

}

function unsubscribeAll(){
  if(unsubSettings) try{unsubSettings();}catch(e){}
  if(unsubCustomers) try{unsubCustomers();}catch(e){}
  if(unsubVehicles) try{unsubVehicles();}catch(e){}
  if(unsubWorkorders) try{unsubWorkorders();}catch(e){}
  if(unsubPromotions) try{unsubPromotions();}catch(e){}
  if(unsubInvoices) try{unsubInvoices();}catch(e){}
  if(unsubStaffLive) try{unsubStaffLive();}catch(e){}
  if(unsubInvitesLive) try{unsubInvitesLive();}catch(e){}
  unsubSettings = unsubCustomers = unsubVehicles = unsubWorkorders = unsubPromotions = unsubInvoices = null;
  unsubStaffLive = unsubInvitesLive = null;
}

/* ============
   Renderers
=========== */
const kpiEl = $("kpi");
const finSalesEl = $("finSales");
const finPartsEl = $("finParts");
const finProfitEl = $("finProfit");
const finCountEl = $("finCount");
const finByPayTbody = $("finByPayTbody");
const finByDayTbody = $("finByDayTbody");
const chartSalesEl = $("chartSales");
const chartNetEl = $("chartNet");
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

  renderFinanceDashboard();

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

function renderFinanceDashboard(){
  try{
    if(currentRole !== "admin") return;
    if(!finSalesEl) return;

    const now = new Date();
    const monthFrom = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthTo = isoDate(new Date(now.getFullYear(), now.getMonth()+1, 0));

    const monthInv = (invoices||[]).filter(inv=>{
      const k = invoiceDateKey(inv);
      return k >= monthFrom && k <= monthTo;
    });

    let sales=0, parts=0, profit=0;
    for(const inv of monthInv){
      const t = getInvoiceTotals(inv);
      sales += t.sell;
      parts += t.cost;
      profit += t.profit;
    }

    finSalesEl.textContent = money(sales);
    if(finPartsEl) finPartsEl.textContent = money(parts);
    if(finProfitEl) finProfitEl.textContent = money(profit);
    if(finCountEl) finCountEl.textContent = String(monthInv.length);

    // Par méthode (mois)
    if(finByPayTbody){
      const map = new Map();
      for(const inv of monthInv){
        const k = String(inv.paymentMethod||"").toLowerCase() || "unknown";
        const cur = map.get(k) || {k, total:0, cost:0, profit:0};
        const t = getInvoiceTotals(inv);
        cur.total += t.sell;
        cur.cost += t.cost;
        cur.profit += t.profit;
        map.set(k, cur);
      }
      const list=[...map.values()].sort((a,b)=>b.profit-a.profit);
      finByPayTbody.innerHTML = list.map(r=>`
        <tr>
          <td>${safe(invPaymentLabel(r.k))}</td>
          <td style="text-align:right">${money(r.total)}</td>
          <td style="text-align:right">${money(r.cost)}</td>
          <td style="text-align:right"><b>${money(r.profit)}</b></td>
        </tr>
      `).join('') || '<tr><td class="muted" colspan="4">Aucune donnée.</td></tr>';
    }

    // Par jour (14 derniers jours)
    if(finByDayTbody){
      const dayFrom = new Date(now.getTime() - 13*24*60*60*1000);
      const map = new Map();
      for(const inv of (invoices||[])){
        const d = invoiceDateAsDate(inv);
        if(d < dayFrom) continue;
        const k = invoiceDateKey(inv);
        const cur = map.get(k) || {k, total:0, cost:0, profit:0};
        const t = getInvoiceTotals(inv);
        cur.total += t.sell;
        cur.cost += t.cost;
        cur.profit += t.profit;
        map.set(k, cur);
      }
      const list=[...map.values()].sort((a,b)=>String(b.k).localeCompare(String(a.k)));
      finByDayTbody.innerHTML = list.map(r=>`
        <tr>
          <td>${safe(r.k)}</td>
          <td style="text-align:right">${money(r.total)}</td>
          <td style="text-align:right">${money(r.cost)}</td>
          <td style="text-align:right"><b>${money(r.profit)}</b></td>
        </tr>
      `).join('') || '<tr><td class="muted" colspan="4">Aucune donnée.</td></tr>';
    }
  

    // Graphiques 12 mois (revenus & profit net)
    if(chartSalesEl || chartNetEl){
      const m = new Map();
      for(const inv of (invoices||[])){
        const d = invoiceDateAsDate(inv);
        const k = monthKey(d);
        const t = getInvoiceTotals(inv);
        const cur = m.get(k) || {sales:0, net:0};
        cur.sales += t.sell;
        cur.net += t.profit;
        m.set(k, cur);
      }
      const keys = [...m.keys()].sort().slice(-12);
      const labels = keys.map(k=>k.slice(5));
      const salesVals = keys.map(k=>m.get(k)?.sales||0);
      const netVals = keys.map(k=>m.get(k)?.net||0);
      drawBarChart(chartSalesEl, labels, salesVals);
      drawBarChart(chartNetEl, labels, netVals);
    }
}catch(e){
    console.error("renderFinanceDashboard error:", e);
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
const clientStatsModal = $("clientStatsModal");
const btnCloseClientStats = $("btnCloseClientStats");
const csTitle = $("csTitle");
const csSubtitle = $("csSubtitle");
const csCount = $("csCount");
const csSales = $("csSales");
const csParts = $("csParts");
const csNet = $("csNet");
const csTbody = $("csTbody");
if(btnCloseClientStats) btnCloseClientStats.onclick = ()=>{ if(clientStatsModal) clientStatsModal.style.display="none"; };
if(clientStatsModal) clientStatsModal.addEventListener("click", (e)=>{ if(e.target===clientStatsModal) clientStatsModal.style.display="none"; });

const clientsCount = $("clientsCount");
const promoSelCount = $("promoSelCount");
const btnPromoSelectAll = $("btnPromoSelectAll");
const btnPromoSelectHasEmail = $("btnPromoSelectHasEmail");
const btnPromoSelectNone = $("btnPromoSelectNone");
$("btnClientsSearch").onclick = ()=>renderClients();
$("btnClientsClear").onclick = ()=>{ $("clientsSearch").value=""; renderClients(); };

if(btnPromoSelectAll) btnPromoSelectAll.onclick = ()=>window.__promoSelectAll(true);
if(btnPromoSelectHasEmail) btnPromoSelectHasEmail.onclick = ()=>window.__promoSelectHasEmail();
if(btnPromoSelectNone) btnPromoSelectNone.onclick = ()=>window.__promoSelectAll(false);



/* ============
   Revenue view
=========== */
const revPresetEl = $("revPreset");
const revPayFilterEl = $("revPayFilter");
const revFromEl = $("revFrom");
const revToEl = $("revTo");
const revTotalEl = $("revTotal");
const revCountEl = $("revCount");
const revAvgEl = $("revAvg");
const revPartsCostEl = $("revPartsCost");
const revProfitEl = $("revProfit");
const revTbody = $("revTbody");
const revByPayTbody = $("revByPayTbody");
const revByDateTbody = $("revByDateTbody");
const btnRevApply = $("btnRevApply");


/* ============
   Invoices (Parts) / Profit
=========== */
const btnNewInvoice = $("btnNewInvoice");
const invoiceFormBox = $("invoiceFormBox");
const formInvoice = $("formInvoice");
const invCustomerEl = $("invCustomer");
const invEmailEl = $("invEmail");
const invDateEl = $("invDate");
const invPurchaseDateEl = $("invPurchaseDate");
const invInstallDateEl = $("invInstallDate");
const invRefEl = $("invRef");
const invWorkorderEl = $("invWorkorder");
const invPayMethodEl = $("invPayMethod");
const invHoursEl = $("invHours");
const invLaborEl = $("invLabor");
const invSubTotalEl = $("invSubTotal");
const invTaxTotalEl = $("invTaxTotal");
const invGrandTotalEl = $("invGrandTotal");
const invCardFeeEl = $("invCardFee");
const invNetProfitEl = $("invNetProfit");
const invItemsTbody = $("invItemsTbody");
const btnInvAddLine = $("btnInvAddLine");
const btnInvCancel = $("btnInvCancel");
const btnInvPrint = $("btnInvPrint");
const btnInvPdf = $("btnInvPdf");
const btnInvEmail = $("btnInvEmail");
const invCostTotalEl = $("invCostTotal");
const invSellTotalEl = $("invSellTotal");
const invProfitTotalEl = $("invProfitTotal");
const inv30CountEl = $("inv30Count");
const inv30ProfitEl = $("inv30Profit");
const inv30MarginEl = $("inv30Margin");
const invListTbody = $("invListTbody");
const invTopClientsTbody = $("invTopClientsTbody");
const invMonthlyTbody = $("invMonthlyTbody");
const invMonthlyChartEl = $("invMonthlyChart");
const invPayTbody = $("invPayTbody");
const invTopRepairsTbody = $("invTopRepairsTbody");
const invFromEl = $("invFrom");
const invToEl = $("invTo");
const btnInvThisMonth = $("btnInvThisMonth");
const btnInvLastMonth = $("btnInvLastMonth");
const btnInvAll = $("btnInvAll");
const btnInvExport = $("btnInvExport");

let editingInvoiceId = null;
let invFilter = { from: null, to: null };

// UI wiring (Invoices)
if(invDateEl) invDateEl.value = todayISO();
if(invHoursEl) invHoursEl.value = "0";
    if(invLaborEl) invLaborEl.value = "0";
if(btnNewInvoice) btnNewInvoice.onclick = ()=>{
  if(currentRole !== "admin"){ showToast("Accès réservé admin."); return; }
  openInvoiceForm(true);
};
if(btnInvAddLine) btnInvAddLine.onclick = ()=>{ ensureInvoiceLine(); recalcInvoiceTotals(); };
if(btnInvCancel) btnInvCancel.onclick = ()=>{ openInvoiceForm(false); };
if(formInvoice) formInvoice.onsubmit = createInvoiceFromForm;
if(invLaborEl) invLaborEl.addEventListener("input", recalcInvoiceTotals);
if(invHoursEl) invHoursEl.addEventListener("input", recalcInvoiceTotals);
if(invPayMethodEl) invPayMethodEl.addEventListener("change", recalcInvoiceTotals);


function invSetMonth(which){
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + (which==="last"?-1:0), 1);
  const from = isoDate(firstDayOfMonth(d));
  const to = isoDate(lastDayOfMonth(d));
  setInvFilter(from, to);
}
if(btnInvThisMonth) btnInvThisMonth.onclick = ()=>invSetMonth("this");
if(btnInvLastMonth) btnInvLastMonth.onclick = ()=>invSetMonth("last");
if(btnInvAll) btnInvAll.onclick = ()=>setInvFilter(null, null);
if(invFromEl) invFromEl.onchange = ()=>setInvFilter(invFromEl.value||null, invToEl?.value||null);
if(invToEl) invToEl.onchange = ()=>setInvFilter(invFromEl?.value||null, invToEl.value||null);
if(btnInvExport) btnInvExport.onclick = ()=>exportInvoicesCSV();
 // dates (YYYY-MM-DD)

function todayISO(){
  const d = new Date();
  const tzOff = d.getTimezoneOffset()*60000;
  return new Date(d.getTime()-tzOff).toISOString().slice(0,10);
}

function openInvoiceForm(open=true){
  if(!invoiceFormBox) return;
  invoiceFormBox.style.display = open ? "" : "none";
}

function ensureInvoiceLine(desc="", qty=1, cost=0, price=0){
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="input input-mini" data-k="desc" placeholder="ex: Plaquettes de frein" value="${safe(desc)}" /></td>
    <td><input class="input input-mini" data-k="qty" type="number" min="1" value="${Number(qty||1)}" /></td>
    <td style="text-align:right"><input class="input input-mini" data-k="cost" type="number" step="0.01" min="0" value="${Number(cost||0)}" /></td>
    <td style="text-align:right"><input class="input input-mini" data-k="price" type="number" step="0.01" min="0" value="${Number(price||0)}" /></td>
    <td class="no-print" style="text-align:right"><button class="btn btn-ghost btn-icon" type="button" title="Supprimer">✕</button></td>
  `;
  tr.querySelector('button').addEventListener('click', ()=>{ tr.remove(); recalcInvoiceTotals(); });
  tr.querySelectorAll('input').forEach(inp=> inp.addEventListener('input', recalcInvoiceTotals));
  invItemsTbody.appendChild(tr);
}

function readInvoiceItems(){
  const items = [];
  invItemsTbody.querySelectorAll('tr').forEach(tr=>{
    const getv = (k)=> tr.querySelector(`[data-k="${k}"]`)?.value;
    const desc = String(getv('desc')||"").trim();
    const qty = Math.max(1, Number(getv('qty')||1));
    const cost = Math.max(0, Number(getv('cost')||0));
    const price = Math.max(0, Number(getv('price')||0));
    if(desc || cost || price){
      items.push({desc, qty, cost, price});
    }
  });
  return items;
}

function recalcInvoiceTotals(){
  const items = readInvoiceItems();
  const hours = Math.max(0, Number(invHoursEl?.value || 0));
  const laborManual = Math.max(0, Number(invLaborEl?.value || 0));
  const labor = hours>0 ? (hours * Number(settings.laborRate||0)) : laborManual;
  if(invLaborEl) invLaborEl.value = String(labor.toFixed(2));
  let partsCost = 0;
  let partsSell = 0;
  for(const it of items){
    partsCost += Number(it.cost||0) * Number(it.qty||1);
    partsSell += Number(it.price||0) * Number(it.qty||1);
  }
  const subTotal = partsSell + labor;

  const tps = Number(settings.tpsRate||0);
  const tvq = Number(settings.tvqRate||0);
  const tax = subTotal * (tps + tvq);
  const grandTotal = subTotal + tax;

  const isCard = (invPayMethodEl?.value || "") === "card";
  const cardFeeRate = Number(settings.cardFeeRate||0);
  const cardFee = isCard ? (grandTotal * cardFeeRate) : 0;

  // Profit net: on exclut les taxes (pas un revenu) et on retire les frais carte
  const netProfit = subTotal - partsCost - cardFee;

  if(invCostTotalEl) invCostTotalEl.textContent = money(partsCost);
  if(invSubTotalEl) invSubTotalEl.textContent = money(subTotal);
  if(invTaxTotalEl) invTaxTotalEl.textContent = money(tax);
  if(invGrandTotalEl) invGrandTotalEl.textContent = money(grandTotal);
  if(invCardFeeEl) invCardFeeEl.textContent = money(cardFee);
  if(invNetProfitEl) invNetProfitEl.textContent = money(netProfit);
}

function fillInvoiceCustomers(){
  if(!invCustomerEl) return;
  const list = [...customers].sort((a,b)=> String(a.fullName||"").localeCompare(String(b.fullName||""), 'fr'));
  invCustomerEl.innerHTML = list.map(c=>`<option value="${c.id}">${safe(c.fullName||'(Sans nom)')}</option>`).join('');
}


function workorderDisplay(wo){
  if(!wo) return "";
  const v = getVehicle(wo.vehicleId) || {};
  const c = v.customerId ? (getCustomer(v.customerId) || {}) : {};
  const client = c.fullName || "";
  const veh = [v.year,v.make,v.model].filter(Boolean).join(" ") + (v.plate?` (${v.plate})`:"");
  const d = String(wo.createdAt||"").slice(0,10);
  const total = money(wo.total||0);
  const parts = [d, client, veh].filter(Boolean).join(" — ");
  return parts ? `${parts} — ${total}` : `${wo.id} — ${total}`;
}


function invPaymentLabel(pm){
  const v = String(pm||"").toLowerCase();
  if(v==="cash") return "Cash";
  if(v==="card") return "Carte";
  if(v==="etransfer") return "Interac";
  if(v==="bank") return "Virement";
  if(v==="cheque") return "Chèque";
  if(v==="other") return "Autre";
  return v || "—";
}

function fillInvoiceWorkorders(){
  if(!invWorkorderEl) return;
  // option vide
  const opts = ['<option value="">— Aucune —</option>'];
  // On ne liste que les réparations (workorders) existantes, triées par date desc
  const list = [...workorders].sort(byCreatedDesc);
  for(const wo of list){
    opts.push(`<option value="${wo.id}">${safe(workorderDisplay(wo))}</option>`);
  }
  invWorkorderEl.innerHTML = opts.join('');
}


async function createInvoiceFromForm(e){
  e.preventDefault();
  const customerId = invCustomerEl.value;
  const customer = customers.find(c=>c.id===customerId);
  const workorderId = (invWorkorderEl && invWorkorderEl.value) ? invWorkorderEl.value : "";

  // Référence auto format GP-0001 si vide
  let refVal = String(invRefEl?.value || "").trim();
  if(!refVal){
    try{
      const cRef = doc(db, "meta", "counters");
      // runTransaction peut ne pas être importé selon version; on teste
      if(typeof runTransaction === "function"){
        const seq = await runTransaction(db, async (tx)=>{
          const snap = await tx.get(cRef);
          const cur = (snap.exists() && snap.data().invoiceSeq) ? Number(snap.data().invoiceSeq) : 0;
          const next = cur + 1;
          tx.set(cRef, { invoiceSeq: next, updatedAt: serverTimestamp() }, { merge:true });
          return next;
        });
        refVal = "GP-" + String(seq).padStart(4,"0");
      }else{
        // fallback: timestamp
        refVal = "GP-" + String(Date.now()).slice(-6);
      }
      if(invRefEl) invRefEl.value = refVal;
    }catch(e){
      refVal = "GP-" + String(Date.now()).slice(-6);
      if(invRefEl) invRefEl.value = refVal;
    }
  }
  const items = readInvoiceItems();
  if(items.length===0){
    alert("Ajoute au moins une ligne (pièce / service). ");
    return;
  }
  const dateStr = invDateEl.value || todayISO();
  const d = new Date(dateStr+"T12:00:00");
  let costTotal = 0, sellTotal = 0;
  for(const it of items){
    costTotal += Number(it.cost||0) * Number(it.qty||1);
    sellTotal += Number(it.price||0) * Number(it.qty||1);
  }
  const profit = sellTotal - costTotal;
  const ref = String(invRefEl.value||"").trim();

  // Si la référence existe déjà, propose: 1) modifier la facture existante, 2) ajouter au même facture
  if(ref && !editingInvoiceId){
    const existing = invoices.find(x => String(x.ref||"").trim() === ref);
    if(existing){
      const wantEdit = confirm(`La référence "${ref}" existe déjà.\n\nOK = Modifier cette facture\nAnnuler = Autre option`);
      if(wantEdit){
        // Ouvre en mode édition
        editingInvoiceId = existing.id;
        openInvoiceForm(true);
        invCustomerEl.value = existing.customerId || "";
        const dt = existing.date instanceof Date ? existing.date : (existing.date?.toDate ? existing.date.toDate() : new Date(existing.date));
        invDateEl.value = isoDate(dt);
        if(invPurchaseDateEl) invPurchaseDateEl.value = existing.purchaseDate || "";
        if(invInstallDateEl) invInstallDateEl.value = existing.installDate || "";
        invRefEl.value = existing.ref || ref;
        if(invPayMethodEl) invPayMethodEl.value = existing.paymentMethod || "cash";
        if(invWorkorderEl) invWorkorderEl.value = existing.workorderId || "";
        invItemsTbody.innerHTML = "";
        (existing.items||[]).forEach(it=>ensureInvoiceLine(it.desc,it.qty,it.cost,it.price));
        recalcInvoiceTotals();
        showToast("Facture ouverte en modification.");
        return;
      }

      const wantMerge = confirm(`Ajouter ces lignes à la facture "${ref}" (même facture) ?`);
      if(wantMerge){
        try{
          const mergedItems = [...(existing.items||[]), ...items];
          let cTot=0, sTot=0;
          for(const it of mergedItems){
            cTot += Number(it.cost||0) * Number(it.qty||1);
            sTot += Number(it.price||0) * Number(it.qty||1);
          }
          const pTot = sTot - cTot;

          // On garde le client de la facture existante (référence unique = 1 facture)
          const upd = {
            // garde ref identique
            ref: ref,
            customerId: existing.customerId || customerId,
            customerName: existing.customerName || (customer?.fullName||""),
            customerEmail: existing.customerEmail || String(invEmailEl?.value||"").trim(),
            workorderId: existing.workorderId || workorderId || "",
            workorderLabel: existing.workorderLabel || (workorderId ? workorderDisplay(workorders.find(w=>w.id===workorderId)) : ""),
            paymentMethod: (invPayMethodEl?.value || existing.paymentMethod || "cash"),
            date: existing.date || d,
            purchaseDate: existing.purchaseDate || (invPurchaseDateEl?.value||""),
            installDate: existing.installDate || (invInstallDateEl?.value||""),
            items: mergedItems,
            totals: (function(){
  const hours = Number(existing.hours||0);
  const labor = Number(existing.labor||0);
  const subTotal = sTot + labor;
  const tax = subTotal * (Number(settings.tpsRate||0)+Number(settings.tvqRate||0));
  const grandTotal = subTotal + tax;
  const cardFee = (String(upd.paymentMethod||"").toLowerCase()==="card") ? (grandTotal*Number(settings.cardFeeRate||0)) : 0;
  const netProfit = subTotal - cTot - cardFee;
  return { partsCost: cTot, partsSell: sTot, labor, subTotal, tax, grandTotal, cardFee, netProfit };
})(),
            updatedAt: serverTimestamp(),
            updatedBy: currentUid,
          };

          await updateDoc(doc(colInvoices(), existing.id), upd);
          openInvoiceForm(false);
          formInvoice.reset();
          invItemsTbody.innerHTML = "";
          ensureInvoiceLine();
          invDateEl.value = todayISO();
          if(invWorkorderEl) invWorkorderEl.value = "";
          if(invPayMethodEl) invPayMethodEl.value = "cash";
    if(invHoursEl) invHoursEl.value = "0";
    if(invLaborEl) invLaborEl.value = "0";
          if(invPurchaseDateEl) invPurchaseDateEl.value = "";
          if(invInstallDateEl) invInstallDateEl.value = "";
          recalcInvoiceTotals();
          showToast("Lignes ajoutées à la facture existante.");
          return;
        }catch(err){
          console.error(err);
          alert("Erreur ajout au même facture: "+(err?.message||err));
          return;
        }
      }

      // Si l'utilisateur refuse les 2 options, on laisse continuer (créera une 2e facture sans ref, ou changer ref)
      alert("Change la référence si tu veux créer une nouvelle facture.");
      return;
    }
  }

  const hoursCalc = Math.max(0, Number(invHoursEl?.value || 0));
  const laborCalc = hoursCalc>0 ? (hoursCalc*Number(settings.laborRate||0)) : Math.max(0, Number(invLaborEl?.value || 0));
  const subCalc = sellTotal + laborCalc;
  const taxCalc = subCalc * (Number(settings.tpsRate||0) + Number(settings.tvqRate||0));
  const grandCalc = subCalc + taxCalc;
  const cardCalc = ((invPayMethodEl?.value||"")==="card") ? (grandCalc*Number(settings.cardFeeRate||0)) : 0;
  const netCalc = subCalc - costTotal - cardCalc;

  const payload = {
    ref: ref,

    paymentMethod: (invPayMethodEl?.value || "cash"),
    customerId,
    customerName: customer?.fullName || "",
    customerEmail: String(invEmailEl?.value||"").trim(),
    workorderId: workorderId || "",
    workorderLabel: workorderId ? workorderDisplay(workorders.find(w=>w.id===workorderId)) : "",
    date: d,
    purchaseDate: invPurchaseDateEl?.value || "",
    installDate: invInstallDateEl?.value || "",
    items,
    hours: hoursCalc,
    labor: laborCalc,
    totals: {
      partsCost: costTotal,
      partsSell: sellTotal,
      labor: laborCalc,
      subTotal: subCalc,
      tax: taxCalc,
      grandTotal: grandCalc,
      cardFee: cardCalc,
      netProfit: netCalc
    },
    createdAt: serverTimestamp(),
    createdBy: currentUid,
  };
  try{
    if(editingInvoiceId){
      await updateDoc(doc(colInvoices(), editingInvoiceId), payload);
    }else{
      await addDoc(colInvoices(), payload);
    }
    openInvoiceForm(false);
    formInvoice.reset();
    invItemsTbody.innerHTML = "";
    ensureInvoiceLine();
    invDateEl.value = todayISO();
    if(invWorkorderEl) invWorkorderEl.value = "";
    if(invPayMethodEl) invPayMethodEl.value = "cash";
    if(invHoursEl) invHoursEl.value = "0";
    if(invLaborEl) invLaborEl.value = "0";
    recalcInvoiceTotals();
    editingInvoiceId = null;
    alert("Facture enregistrée.");
  }catch(err){
    console.error(err);
    alert("Erreur enregistrement facture: "+(err?.message||err));
  }
}

async function deleteInvoice(id){
  if(!confirm("Supprimer cette facture ?")) return;
  try{
    await deleteDoc(doc(colInvoices(), id));
  }catch(err){
    console.error(err);
    alert("Erreur suppression: "+(err?.message||err));
  }
}


function setInvFilter(fromISO, toISO){
  invFilter.from = fromISO || null;
  invFilter.to = toISO || null;
  if(invFromEl) invFromEl.value = invFilter.from || "";
  if(invToEl) invToEl.value = invFilter.to || "";
  renderInvoices();
}
function invInRange(inv){
  // inv.date stored as string YYYY-MM-DD or Timestamp/Date
  const d = inv.date instanceof Date ? inv.date : (inv.date?.toDate ? inv.date.toDate() : new Date(inv.date));
  const iso = isoDate(d);
  if(invFilter.from && iso < invFilter.from) return false;
  if(invFilter.to && iso > invFilter.to) return false;
  return true;
}
function getFilteredInvoices(){
  return invoices.filter(invInRange);
}
function downloadText(filename, text){
  const blob = new Blob([text], {type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 500);
}
function exportInvoicesCSV(){
  const list = getFilteredInvoices().sort((a,b)=>{
    const da = a.date instanceof Date ? a.date : (a.date?.toDate ? a.date.toDate() : new Date(a.date));
    const db = b.date instanceof Date ? b.date : (b.date?.toDate ? b.date.toDate() : new Date(b.date));
    return db - da;
  });
  const header = ["date","ref","client","payment_method","labor","sub_total","tax","grand_total","card_fee","parts_cost","net_profit","item_desc","item_qty","item_cost","item_price"];
  const rows = [header.join(",")];
  for(const inv of list){
    const dt = isoDate(inv.date instanceof Date ? inv.date : (inv.date?.toDate ? inv.date.toDate() : new Date(inv.date)));
    const ref = (inv.ref||"").replaceAll('"','""');
    const client = (inv.customerName||"").replaceAll('"','""');
    const pm = (inv.paymentMethod||"").replaceAll('"','""');
    const labor = Number(inv.labor||0);
    const subT = Number(inv.totals?.subTotal ?? 0);
    const taxT = Number(inv.totals?.tax ?? 0);
    const grandT = Number(inv.totals?.grandTotal ?? inv.totals?.sell ?? 0);
    const cardF = Number(inv.totals?.cardFee ?? 0);
    const costT = Number(inv.totals?.partsCost ?? inv.totals?.cost ?? 0);
    const netP = Number(inv.totals?.netProfit ?? inv.totals?.profit ?? 0);
    const sellT = grandT;
    const profitT = netP;
    const items = Array.isArray(inv.items) ? inv.items : [];
    if(items.length===0){
      rows.push([dt, `"${ref}"`, `"${client}"`, `"${pm}"`, labor, subT, taxT, grandT, cardF, costT, netP, "", "", "", ""].join(","));
    }else{
      for(const it of items){
        const desc = String(it.desc||"").replaceAll('"','""');
        const qty = Number(it.qty||0);
        const cost = Number(it.cost||0);
        const price = Number(it.price||0);
        rows.push([dt, `"${ref}"`, `"${client}"`, `"${pm}"`, labor, subT, taxT, grandT, cardF, costT, netP, `"${desc}"`, qty, cost, price].join(","));
      }
    }
  }
  const fname = "factures_pieces.csv";
  downloadText(fname, rows.join("\n"));
}

function renderInvoices(){
  if(!invListTbody) return;
  // 30 derniers jours
  const now = new Date();
  const from = new Date(now.getTime() - 30*24*60*60*1000);
  const inv30 = invoices.filter(inv=>{
    const dt = inv.date instanceof Date ? inv.date : (inv.date?.toDate ? inv.date.toDate() : new Date(inv.date));
    return dt >= from;
  });
  const count = inv30.length;
  let profit = 0, sell=0;
  for(const inv of inv30){
    profit += Number(inv.totals?.netProfit ?? inv.totals?.profit ?? 0);
    sell += Number(inv.totals?.grandTotal ?? inv.totals?.sell ?? 0);
  }
  const margin = sell>0 ? (profit/sell*100) : 0;
  inv30CountEl.textContent = String(count);
  inv30ProfitEl.textContent = money(profit);
  inv30MarginEl.textContent = `${margin.toFixed(1)}%`;

  const list = [...getFilteredInvoices()].sort((a,b)=>{
    const da = a.date instanceof Date ? a.date : (a.date?.toDate ? a.date.toDate() : new Date(a.date));
    const db = b.date instanceof Date ? b.date : (b.date?.toDate ? b.date.toDate() : new Date(b.date));
    return db - da;
  });
  if(list.length===0){
    invListTbody.innerHTML = '<tr><td class="muted" colspan="7">Aucune facture pour ce filtre.</td></tr>';
    return;
  }
  invListTbody.innerHTML = list.map(inv=>{
    const dt = inv.date instanceof Date ? inv.date : (inv.date?.toDate ? inv.date.toDate() : new Date(inv.date));
    const ds = isoDate(dt);
    const ref = safe(inv.ref||"");
    const wo = safe(inv.workorderLabel||"");
    const cust = safe(inv.customerName||"");
    const c = money(inv.totals?.partsCost ?? inv.totals?.cost ?? 0);
    const s = money(inv.totals?.grandTotal ?? inv.totals?.sell ?? 0);
    const p = money(inv.totals?.netProfit ?? inv.totals?.profit ?? 0);
    return `
      <tr>
        <td>${ds}</td>
        <td>${ref}</td>
        <td>${cust}</td>
        <td>${safe(invPaymentLabel(inv.paymentMethod))}</td>
        <td style="text-align:right">${c}</td>
        <td style="text-align:right">${s}</td>
        <td style="text-align:right"><b>${p}</b></td>
        <td class="no-print" style="text-align:right"><button class="btn btn-ghost" data-edit-inv="${inv.id}">Modifier</button> <button class="btn btn-ghost" data-del-inv="${inv.id}">Supprimer</button></td>
      </tr>
    `;
  }).join('');

  renderInvoicesAnalytics(list);

  
  invListTbody.querySelectorAll('[data-edit-inv]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const inv = invoices.find(i=>i.id===btn.getAttribute('data-edit-inv'));
      if(!inv) return;
      editingInvoiceId = inv.id;
      openInvoiceForm(true);
      invCustomerEl.value = inv.customerId || "";
      invDateEl.value = isoDate(inv.date instanceof Date ? inv.date : inv.date.toDate());
      if(invPurchaseDateEl) invPurchaseDateEl.value = inv.purchaseDate || "";
      if(invInstallDateEl) invInstallDateEl.value = inv.installDate || "";
      invRefEl.value = inv.ref || "";
  if(invEmailEl) invEmailEl.value = inv.customerEmail || "";
      if(invPayMethodEl) invPayMethodEl.value = inv.paymentMethod || "cash";
      if(invHoursEl) invHoursEl.value = String(inv.hours ?? 0);
      if(invLaborEl) invLaborEl.value = String(inv.labor ?? 0);
      recalcInvoiceTotals();
      invItemsTbody.innerHTML = "";
      (inv.items||[]).forEach(it=>ensureInvoiceLine(it.desc,it.qty,it.cost,it.price));
      recalcInvoiceTotals();
    });
  });

  invListTbody.querySelectorAll('[data-del-inv]').forEach(btn=>{
    btn.addEventListener('click', ()=>deleteInvoice(btn.getAttribute('data-del-inv')));
  });

function renderInvoicesAnalytics(list){
  // list = factures filtrées
  if(!invTopClientsTbody || !invMonthlyTbody || !invMonthlyChartEl) return;
  // invPayTbody is optional

  if(!Array.isArray(list) || list.length===0){
    invTopClientsTbody.innerHTML = '<tr><td class="muted" colspan="5">Aucune donnée.</td></tr>';
    invMonthlyTbody.innerHTML = '<tr><td class="muted" colspan="5">Aucune donnée.</td></tr>';
    invMonthlyChartEl.textContent = "—";
    if(invPayTbody) invPayTbody.innerHTML = '<tr><td class="muted" colspan="5">Aucune donnée.</td></tr>';
    return;
  }

  // ---- Top clients ----
  const byClient = new Map();
  for(const inv of list){
    const key = inv.customerId || inv.customerName || "(Sans client)";
    const name = inv.customerName || "(Sans client)";
    const cur = byClient.get(key) || {name, sell:0, cost:0, profit:0};
    const cost = Number(inv.totals?.partsCost ?? inv.totals?.cost ?? 0);
    const sell = Number(inv.totals?.grandTotal ?? inv.totals?.sell ?? 0);
    const profit = Number(inv.totals?.netProfit ?? inv.totals?.profit ?? 0);
    cur.sell += sell; cur.cost += cost; cur.profit += profit;
    byClient.set(key, cur);
  }
  const top = [...byClient.values()].sort((a,b)=>b.profit-a.profit).slice(0,10);
  invTopClientsTbody.innerHTML = top.map(r=>{
    const m = r.sell>0 ? (r.profit/r.sell) : 0;
    return `<tr>
      <td>${safe(r.name)}</td>
      <td style="text-align:right">${money(r.sell)}</td>
      <td style="text-align:right">${money(r.cost)}</td>
      <td style="text-align:right"><b>${money(r.profit)}</b></td>
      <td style="text-align:right">${(m*100).toFixed(1)}%</td>
    </tr>`;
  }).join('') || '<tr><td class="muted" colspan="5">Aucune donnée.</td></tr>';

  // ---- Par mois (12 derniers) ----
  const byMonth = new Map(); // YYYY-MM
  for(const inv of list){
    const dt = inv.date instanceof Date ? inv.date : (inv.date?.toDate ? inv.date.toDate() : new Date(inv.date));
    const ym = dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,'0');
    const cur = byMonth.get(ym) || {ym, sell:0, cost:0, profit:0};
    cur.cost += Number(inv.totals?.cost||0);
    cur.sell += Number(inv.totals?.sell||0);
    cur.profit += Number(inv.totals?.profit||0);
    byMonth.set(ym, cur);
  }
  const months = [...byMonth.values()].sort((a,b)=> String(b.ym).localeCompare(String(a.ym))).slice(0,12);
  invMonthlyTbody.innerHTML = months.map(r=>{
    const m = r.sell>0 ? (r.profit/r.sell) : 0;
    return `<tr>
      <td>${safe(r.ym)}</td>
      <td style="text-align:right">${money(r.sell)}</td>
      <td style="text-align:right">${money(r.cost)}</td>
      <td style="text-align:right"><b>${money(r.profit)}</b></td>
      <td style="text-align:right">${(m*100).toFixed(1)}%</td>
    </tr>`;
  }).join('') || '<tr><td class="muted" colspan="5">Aucune donnée.</td></tr>';

  // ---- Mini graphique texte ----
  const maxP = Math.max(...months.map(m=>m.profit), 0);
  if(maxP<=0){
    invMonthlyChartEl.textContent = "Pas assez de données pour un graphique (bénéfice ≤ 0).";

  // ---- Par méthode de paiement ----
  if(invPayTbody){
    const byPay = new Map();
    for(const inv of list){
      const key = inv.paymentMethod || "unknown";
      const cur = byPay.get(key) || {method:key, sell:0, cost:0, profit:0};
      const cost = Number(inv.totals?.partsCost ?? inv.totals?.cost ?? 0);
      const sell = Number(inv.totals?.grandTotal ?? inv.totals?.sell ?? 0);
      const profit = Number(inv.totals?.netProfit ?? inv.totals?.profit ?? 0);
      cur.sell += sell; cur.cost += cost; cur.profit += profit;
      byPay.set(key, cur);
    }
    const rows = [...byPay.values()].sort((a,b)=>b.profit-a.profit);
    invPayTbody.innerHTML = rows.map(r=>{
      const margin = r.sell>0 ? (r.profit/r.sell*100) : 0;

  // ---- Par réparation (Top 10) ----
  if(invTopRepairsTbody){
    const byWo = new Map();
    for(const inv of list){
      const woId = inv.workorderId || "";
      if(!woId) continue;
      const cur = byWo.get(woId) || { woId, label: inv.workorderLabel || woId, sell:0, cost:0, cardFee:0, net:0 };
      cur.sell += Number(inv.totals?.grandTotal ?? inv.totals?.sell ?? 0);
      cur.cost += Number(inv.totals?.partsCost ?? inv.totals?.cost ?? 0);
      cur.cardFee += Number(inv.totals?.cardFee ?? 0);
      cur.net += Number(inv.totals?.netProfit ?? inv.totals?.profit ?? 0);
      byWo.set(woId, cur);
    }
    const topWo = [...byWo.values()].sort((a,b)=>b.net-a.net).slice(0,10);
    invTopRepairsTbody.innerHTML = topWo.map(r=>`
      <tr>
        <td>${safe(r.label||r.woId)}</td>
        <td style="text-align:right">${money(r.sell)}</td>
        <td style="text-align:right">${money(r.cost)}</td>
        <td style="text-align:right">${money(r.cardFee)}</td>
        <td style="text-align:right"><b>${money(r.net)}</b></td>
      </tr>
    `).join('') || '<tr><td class="muted" colspan="5">Aucune donnée.</td></tr>';
  }
      return `
        <tr>
          <td>${safe(invPaymentLabel(r.method))}</td>
          <td style="text-align:right">${money(r.sell)}</td>
          <td style="text-align:right">${money(r.cost)}</td>
          <td style="text-align:right"><b>${money(r.profit)}</b></td>
          <td style="text-align:right">${margin.toFixed(1)}%</td>
        </tr>
      `;
    }).join('') || '<tr><td class="muted" colspan="5">Aucune donnée.</td></tr>';
  }
  }else{
    const bars = months.slice().reverse().map(r=>{
      const w = Math.round((r.profit/maxP)*16);
      const bar = "▮".repeat(Math.max(1,w));
      return `${r.ym}: ${bar} ${money(r.profit)}`;
    }).join("<br>");
    invMonthlyChartEl.innerHTML = `<div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; line-height:1.5">${bars}</div>`;
  }
}


}

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


function getInvoiceTotals(inv){
  // Supporte plusieurs formats (anciens / nouveaux)
  const t = inv?.totals || inv?.total || {};
  // 1) si totals existe
  let sell = Number(t.grandTotal ?? t.totalClient ?? t.sell ?? t.total ?? 0);
  let cost = Number(t.partsCost ?? t.cost ?? 0);
  let profit = Number(t.netProfit ?? t.profit ?? 0);

  // 2) si totals absent ou à 0 mais items existent -> recalcul
  const items = Array.isArray(inv?.items) ? inv.items : [];
  if((!sell && !cost && !profit) && items.length){
    let s=0, c=0;
    for(const it of items){
      const qty = Number(it.qty ?? 1);
      const price = Number(it.price ?? 0);
      const icost = Number(it.cost ?? 0);
      s += qty * price;
      c += qty * icost;
    }
    sell = s;
    cost = c;
    profit = sell - cost;
  }

  // 3) fallback: si un seul champ existe
  if(!profit && sell) profit = sell - cost;

  return { sell, cost, profit };
}

function invoiceDateAsDate(inv){
  const d = inv?.date instanceof Date ? inv.date : (inv?.date?.toDate ? inv.date.toDate() : (inv?.date ? new Date(inv.date) : new Date(0)));
  return isNaN(d.getTime()) ? new Date(0) : d;
}
function invoiceDateKey(inv){
  return isoDate(invoiceDateAsDate(inv));
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

function filterRevenueInvoices(){
  const from = revFromEl?.value || null;
  const to = revToEl?.value || null;
  const pay = String(revPayFilterEl?.value || "").trim().toLowerCase();

  return (invoices||[]).filter(inv=>{
    const k = invoiceDateKey(inv);
    if(from && k < from) return false;
    if(to && k > to) return false;
    if(pay && String(inv.paymentMethod||"").toLowerCase() !== pay) return false;
    return true;
  });
}

function renderRevenue(){
  if(!$("viewRevenue")) return;
  if(currentRole !== "admin"){
    if(revTotalEl) revTotalEl.textContent = money(0);
    if(revCountEl) revCountEl.textContent = "0";
    if(revAvgEl) revAvgEl.textContent = money(0);
    if(revPartsCostEl) revPartsCostEl.textContent = money(0);
    if(revProfitEl) revProfitEl.textContent = money(0);
    if(revTbody) revTbody.innerHTML = '<tr><td colspan="9" class="muted">Accès réservé à l\'administrateur.</td></tr>';
    if(revByPayTbody) revByPayTbody.innerHTML = '<tr><td class="muted" colspan="4">—</td></tr>';
    if(revByDateTbody) revByDateTbody.innerHTML = '<tr><td class="muted" colspan="4">—</td></tr>';
    return;
  }

  const rows = filterRevenueInvoices().sort((a,b)=> invoiceDateAsDate(b) - invoiceDateAsDate(a));

  let total=0, parts=0, profit=0;
  for(const inv of rows){
    const t = getInvoiceTotals(inv);
    total += t.sell;
    parts += t.cost;
    profit += t.profit;
  }
  const count = rows.length;
  const avg = count ? total/count : 0;

  if(revTotalEl) revTotalEl.textContent = money(total);
  if(revCountEl) revCountEl.textContent = String(count);
  if(revAvgEl) revAvgEl.textContent = money(avg);
  if(revPartsCostEl) revPartsCostEl.textContent = money(parts);
  if(revProfitEl) revProfitEl.textContent = money(profit);

  if(!revTbody) return;

  while(revTbody.firstChild) revTbody.removeChild(revTbody.firstChild);

  if(count === 0){
    const tr=document.createElement('tr');
    const td=document.createElement('td');
    td.colSpan=9;
    td.className='muted';
    td.textContent='Aucune facture pour cette période.';
    tr.appendChild(td);
    revTbody.appendChild(tr);
  }else{
    for(const inv of rows){
      const ref = String(inv.ref || '—');
      const date = invoiceDateKey(inv) || '—';
      const client = String(inv.customerName || '—');
      const repair = String(inv.workorderLabel || '—');
      const method = invPaymentLabel(inv.paymentMethod);
      const t = getInvoiceTotals(inv);
      const tot = money(t.sell);
      const cst = money(t.cost);
      const prf = money(t.profit);

      const tr=document.createElement('tr');
      const cells=[ref, date, client, repair, method, tot, cst, prf];
      cells.forEach((val, idx)=>{
        const td=document.createElement('td');
        if(idx>=5) td.style.textAlign='right';
        td.textContent=val;
        tr.appendChild(td);
      });

      const tdBtn=document.createElement('td');
      tdBtn.className='no-print';
      tdBtn.style.textAlign='right';
      const btn=document.createElement('button');
      btn.className='btn btn-ghost';
      btn.textContent='Voir';
      btn.addEventListener('click', ()=>{
        try{
          go('invoices');
          const b=document.querySelector(`[data-edit-inv="${inv.id}"]`);
          if(b) b.click();
        }catch(e){}
      });
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);

      revTbody.appendChild(tr);
    }
  }

  // ---- Par méthode de paiement ----
  if(revByPayTbody){
    const map=new Map();
    for(const inv of rows){
      const k=String(inv.paymentMethod||'').toLowerCase()||'unknown';
      const cur=map.get(k)||{k,total:0,cost:0,profit:0};
      const t = getInvoiceTotals(inv);
      cur.total += t.sell;
      cur.cost += t.cost;
      cur.profit += t.profit;
      map.set(k,cur);
    }
    const list=[...map.values()].sort((a,b)=>b.profit-a.profit);
    revByPayTbody.innerHTML = list.map(r=>`
      <tr>
        <td>${safe(invPaymentLabel(r.k))}</td>
        <td style="text-align:right">${money(r.total)}</td>
        <td style="text-align:right">${money(r.cost)}</td>
        <td style="text-align:right"><b>${money(r.profit)}</b></td>
      </tr>
    `).join('') || '<tr><td class="muted" colspan="4">Aucune donnée.</td></tr>';
  }

  // ---- Par date (par jour) ----
  if(revByDateTbody){
    const map=new Map();
    for(const inv of rows){
      const k=invoiceDateKey(inv);
      const cur=map.get(k)||{k,total:0,cost:0,profit:0};
      const t = getInvoiceTotals(inv);
      cur.total += t.sell;
      cur.cost += t.cost;
      cur.profit += t.profit;
      map.set(k,cur);
    }
    const list=[...map.values()].sort((a,b)=>String(b.k).localeCompare(String(a.k))).slice(0,60);
    revByDateTbody.innerHTML = list.map(r=>`
      <tr>
        <td>${safe(r.k)}</td>
        <td style="text-align:right">${money(r.total)}</td>
        <td style="text-align:right">${money(r.cost)}</td>
        <td style="text-align:right"><b>${money(r.profit)}</b></td>
      </tr>
    `).join('') || '<tr><td class="muted" colspan="4">Aucune donnée.</td></tr>';
  }
}

// init revenue controls
if(revPresetEl && revFromEl && revToEl){
  setRevenuePreset(revPresetEl.value || "month");
  revPresetEl.addEventListener("change", ()=>{
    setRevenuePreset(revPresetEl.value);
    renderRevenue();
  });
  if(btnRevApply) btnRevApply.addEventListener("click", ()=>renderRevenue());
  if(revPayFilterEl) revPayFilterEl.addEventListener("change", ()=>renderRevenue());
}



// ===== Promo selection (clients) =====
window.__togglePromoSelected = async (customerId, checked)=>{
  if(currentRole !== "admin") return;
  try{
    await updateDoc(doc(db, "customers", customerId), {
      promoSelected: !!checked,
      promoSelectedAtTs: serverTimestamp()
    });
  }catch(err){
    console.error(err);
    alert("Impossible de modifier la sélection promo. Vérifie les permissions Firestore (admin).");
  }
};

window.__promoSelectAll = async (checked)=>{
  if(currentRole !== "admin") return;
  const list = customers.filter(c=>c && c.id);
  if(list.length===0) return;
  const label = checked ? "Tout sélectionner" : "Tout désélectionner";
  if(!confirm(`${label} pour ${list.length} client(s) ?`)) return;

  try{
    // batch updates (max 500 writes per batch)
    for(let i=0; i<list.length; i+=450){
      const chunk = list.slice(i, i+450);
      const batch = writeBatch(db);
      chunk.forEach(c=>{
        batch.update(doc(db, "customers", c.id), {
          promoSelected: !!checked,
          promoSelectedAtTs: serverTimestamp()
        });
      });
      await batch.commit();
    }
  }catch(err){
    console.error(err);
    alert("Erreur: impossible de mettre à jour la sélection promo.");
  }
};

// Sélectionner uniquement les clients qui ont un email
window.__promoSelectHasEmail = async ()=>{
  if(currentRole !== "admin") return;
  const list = customers.filter(c=>c && c.id);
  if(list.length===0) return;
  if(!confirm(`Sélectionner uniquement les clients avec email (et désélectionner les autres) ?`)) return;

  try{
    // Mise à jour locale (pour rafraîchir l'UI tout de suite)
    customers = customers.map(c=>{
      const email = String(c?.email||"").trim();
      const hasEmail = email.includes("@") && email.includes(".");
      return { ...c, promoSelected: hasEmail };
    });
    renderClients();
    fillInvoiceCustomers();
    fillInvoiceWorkorders();
    if(typeof renderPromotions === "function") renderPromotions();

    // batch updates (max 500 writes per batch)
    for(let i=0; i<list.length; i+=450){
      const chunk = list.slice(i, i+450);
      const batch = writeBatch(db);
      chunk.forEach(c=>{
        const email = String(c?.email||"").trim();
        const hasEmail = email.includes("@") && email.includes(".");
        batch.update(doc(db, "customers", c.id), {
          promoSelected: !!hasEmail,
          promoSelectedAtTs: serverTimestamp()
        });
      });
      await batch.commit();
    }
  }catch(err){
    console.error(err);
    alert("Erreur: impossible de sélectionner ceux avec email.");
  }
};

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
  if(promoSelCount){
    const sel = customers.filter(c=>c && c.promoSelected===true).length;
    promoSelCount.textContent = `${sel} sélectionné(s)`;
  }
  if(list.length===0){
    clientsTbody.innerHTML = '<tr><td colspan="5" class="muted">Aucun client.</td></tr>';
    return;
  }
  clientsTbody.innerHTML = list.map(c=>`
    <tr>
      <td>${safe(c.fullName)}</td>
      <td>${safe(c.phone||"")}</td>
      <td>${safe(c.email||"")}</td>
      <td class="nowrap">
        <label class="row" style="gap:6px; align-items:center">
          <input type="checkbox" ${c.promoSelected ? "checked" : ""} onchange="window.__togglePromoSelected('${c.id}', this.checked)">
          <span class="muted" style="font-size:12px">Oui</span>
        </label>
      </td>
      <td class="nowrap">
        <button class="btn btn-small" onclick="window.__openClientView('${c.id}')">Ouvrir</button>
        <button class="btn btn-small btn-ghost" onclick="window.__openClientForm('${c.id}')">Modifier</button>
      </td>
    </tr>
  `).join("");
}


function openClientStats(customerId){
  const c = customers.find(x=>x.id===customerId) || {};
  if(csTitle) csTitle.textContent = `Stats: ${c.fullName||"Client"}`;
  if(csSubtitle) csSubtitle.textContent = `${c.phone||""} ${c.email?("• "+c.email):""}`.trim();

  const invs = (invoices||[]).filter(inv=> (inv.customerId===customerId) || (String(inv.customerName||"").toLowerCase()===String(c.fullName||"").toLowerCase()));
  invs.sort((a,b)=> invoiceDateAsDate(b)-invoiceDateAsDate(a));

  let sales=0, parts=0, net=0;
  for(const inv of invs){
    const t = getInvoiceTotals(inv);
    sales += t.sell;
    parts += t.cost;
    net += t.profit;
  }
  if(csCount) csCount.textContent = String(invs.length);
  if(csSales) csSales.textContent = money(sales);
  if(csParts) csParts.textContent = money(parts);
  if(csNet) csNet.textContent = money(net);

  if(csTbody){
    if(invs.length===0){
      csTbody.innerHTML = '<tr><td class="muted" colspan="4">Aucune facture.</td></tr>';
    }else{
      csTbody.innerHTML = invs.slice(0,20).map(inv=>{
        const t = getInvoiceTotals(inv);
        return `
          <tr>
            <td>${safe(inv.ref||inv.id||"—")}</td>
            <td>${safe(invoiceDateKey(inv)||"—")}</td>
            <td style="text-align:right">${money(t.sell)}</td>
            <td style="text-align:right"><b>${money(t.profit)}</b></td>
          </tr>
        `;
      }).join("");
    }
  }

  if(clientStatsModal) clientStatsModal.style.display="flex";
}
window.__openClientStats = openClientStats;

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

/* Promotions */
const formPromo = $("formPromo");
const promosTbody = $("promosTbody");
const promoSaved = $("promoSaved");
const promoTestEmail = $("promoTestEmail");
const btnPromoSend = $("btnPromoSend");
const promoSendError = $("promoSendError");
const promoSendOk = $("promoSendOk");
const promoAudienceInfo = $("promoAudienceInfo");

function _selectedPromoCustomers(){
  return customers.filter(c=>c && c.promoSelected === true);
}
function _countPromoSelected(){
  return _selectedPromoCustomers().length;
}
function _countPromoSelectedWithEmail(){
  return _selectedPromoCustomers().filter(c=>String(c.email||"").includes("@")).length;
}

function renderPromotions(){
  if(!promosTbody) return;
  if(currentRole !== "admin"){
    promosTbody.innerHTML = `<tr><td class="muted" colspan="5">Accès réservé à l'administrateur.</td></tr>`;
    return;
  }

  // Audience info
  if(promoAudienceInfo){
    promoAudienceInfo.textContent = `Sélectionnés: ${_countPromoSelected()} (avec email: ${_countPromoSelectedWithEmail()})`;
  }

  if(!promotions.length){
    promosTbody.innerHTML = `<tr><td class="muted" colspan="5">Aucune promotion.</td></tr>`;
    selectedPromotionId = null;
    if(btnPromoSend) btnPromoSend.disabled = true;
    return;
  }

  promosTbody.innerHTML = promotions.map(p=>{
    const d = String(p.createdAt||"").slice(0,10) || "—";
    const valid = p.validUntil ? String(p.validUntil).slice(0,10) : "—";
    const sent = p.lastSentAt ? `Oui (${String(p.lastSentAt).slice(0,10)})` : "Non";
    const isSel = p.id === selectedPromotionId;
    return `
      <tr class="${isSel ? 'row-selected' : ''}">
        <td>${safe(d)}</td>
        <td>${safe(p.subject||'')}</td>
        <td>${safe(valid)}</td>
        <td>${safe(sent)}</td>
        <td class="nowrap"><button class="btn btn-small" data-promo-id="${p.id}">Sélectionner</button></td>
      </tr>
    `;
  }).join("");

  promosTbody.querySelectorAll("[data-promo-id]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      selectedPromotionId = btn.getAttribute("data-promo-id");
      if(btnPromoSend) btnPromoSend.disabled = false;
      renderPromotions();
    });
  });
}

if(formPromo){
  formPromo.onsubmit = async (e)=>{
    e.preventDefault();
    if(currentRole !== "admin") return;
    promoSaved.style.display = "none";
    const fd = new FormData(formPromo);
    const subject = String(fd.get("subject")||"").trim();
    const message = String(fd.get("message")||"").trim();
    const code = String(fd.get("code")||"").trim();
    const validUntil = String(fd.get("validUntil")||"").trim();
    if(!subject || !message){
      alert("Objet et message obligatoires.");
      return;
    }
    const docRef = await addDoc(colPromotions(), {
      subject,
      message,
      code: code || "",
      validUntil: validUntil || "",
      createdAt: isoNow(),
      createdAtTs: serverTimestamp(),
      createdBy: currentUid,
      lastSentAt: "",
      lastSentAtTs: null,
      sentCount: 0,
    });
    selectedPromotionId = docRef.id;
    if(btnPromoSend) btnPromoSend.disabled = false;
    promoSaved.textContent = "Promotion enregistrée. Sélectionnée pour l’envoi.";
    promoSaved.style.display = "";
    formPromo.reset();
    renderPromotions();
  };
}

// ======= ENVOI PROMO via Firebase Extension (collection "mail") =======
function escHtml(s){
  return String(s||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function applyTemplate(str, vars){
  return String(str||"")
    .replace(/\{name\}/g, vars.name || "")
    .replace(/\{phone\}/g, vars.phone || "");
}
function buildPromoHtml(promo, vars){
  const subject = escHtml(applyTemplate(promo.subject, vars));
  const msg = applyTemplate(promo.message, vars);

  const msgHtml = escHtml(msg).replace(/\n/g,"<br>");
  const codeHtml = promo.code ? `<p><b>Code promo :</b> ${escHtml(promo.code)}</p>` : "";
  const validHtml = promo.validUntil ? `<p><b>Valable jusqu’au :</b> ${escHtml(String(promo.validUntil).slice(0,10))}</p>` : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5">
      <h2>${subject}</h2>
      <p>${msgHtml}</p>
      ${codeHtml}
      ${validHtml}
      <hr>
      <p style="color:#666;font-size:12px">
        Garage Pro One
      </p>
    </div>
  `;
}

if(btnPromoSend){
  btnPromoSend.addEventListener("click", async ()=>{
    promoSendError.style.display = "none";
    promoSendOk.style.display = "none";
    if(currentRole !== "admin") return;

    if(!selectedPromotionId){
      alert("Sélectionne une promotion.");
      return;
    }

    const promo = promotions.find(p=>p.id === selectedPromotionId);
    if(!promo){
      alert("Promotion introuvable. Recharge la page.");
      return;
    }

    const testEmail = String(promoTestEmail?.value||"").trim();
    const isTest = testEmail.includes("@");

    // liste destinataires
    const recipients = isTest
      ? [{ email: testEmail, name: "Test", phone: "" }]
      : customers
          .filter(c=>c && c.promoSelected === true)
          .filter(c=>String(c.email||"").includes("@"))
          .map(c=>({ email: String(c.email).trim(), name: String(c.name||"").trim(), phone: String(c.phone||"").trim() }));

    const msgConfirm = isTest
      ? `Envoyer un TEST à: ${testEmail} ?`
      : `Envoyer cette promotion aux clients sélectionnés avec email (${recipients.length}) ?`;

    if(!confirm(msgConfirm)) return;

    btnPromoSend.disabled = true;

    try{
      // ⚠️ Extension attend une collection ROOT nommée "mail"
      // On fait des batches (max 500 écritures par batch)
      let total = recipients.length;
      let sent = 0;

      for(let i=0; i<recipients.length; i+=400){
        const chunk = recipients.slice(i, i+400);
        const batch = writeBatch(db);

        chunk.forEach(r=>{
          const vars = { name: r.name, phone: r.phone };
          const html = buildPromoHtml(promo, vars);

          const mailRef = doc(collection(db, "mail")); // ROOT "mail"
          batch.set(mailRef, {
            to: [r.email],
            message: {
              subject: applyTemplate(promo.subject, vars),
              html
            },
            createdAt: isoNow(),
            createdAtTs: serverTimestamp(),
            promotionId: selectedPromotionId
          });
        });

        await batch.commit();
        sent += chunk.length;
      }

      // marque la promo comme envoyée (date + compteur)
      await updateDoc(doc(colPromotions(), selectedPromotionId), {
        lastSentAt: isoNow(),
        lastSentAtTs: serverTimestamp(),
        sentCount: (promo.sentCount || 0) + (isTest ? 0 : sent)
      });

      promoSendOk.textContent = `Envoi déclenché: ${sent} / ${total}` + (isTest ? " (test)" : "");
      promoSendOk.style.display = "";
    }catch(err){
      console.warn(err);
      promoSendError.textContent =
        (err?.message || "Erreur envoi. Vérifie Firestore rules + extension + collection 'mail'.");
      promoSendError.style.display = "";
    }finally{
      btnPromoSend.disabled = false;
    }
  });
}

/* Settings */
$("btnSaveSettings").onclick = async ()=>{
  const tps = parseFloat(String($("setTps").value).replace(',','.'))/100;
  const tvq = parseFloat(String($("setTvq").value).replace(',','.'))/100;
  const cardFee = parseFloat(String($("setCardFee").value||"0").replace(',','.'))/100;
  const laborRate = parseFloat(String($("setLaborRate")?.value||"0").replace(',','.'));
  const garageName = String($("setGarageName")?.value||"").trim();
  const garageAddress = String($("setGarageAddress")?.value||"").trim();
  const garagePhone = String($("setGaragePhone")?.value||"").trim();
  const garageEmail = String($("setGarageEmail")?.value||"").trim();
  const signatureName = String($("setSignatureName")?.value||"").trim();
  if(!isFinite(tps) || !isFinite(tvq) || !isFinite(cardFee) || !isFinite(laborRate) || tps<0 || tvq<0 || cardFee<0 || laborRate<0){
    alert("TPS/TVQ invalides.");
    return;
  }
  await setDoc(docSettings(), { tpsRate: tps, tvqRate: tvq, cardFeeRate: cardFee, laborRate: laborRate, garageName, garageAddress, garagePhone, garageEmail, signatureName, updatedAt: serverTimestamp() }, { merge:true });
  alert("Paramètres enregistrés.");
};
function renderSettings(){
  $("setTps").value = (settings.tpsRate*100).toFixed(3).replace(/\.000$/,'').replace(/0+$/,'').replace(/\.$/,'');
  $("setTvq").value = (settings.tvqRate*100).toFixed(3).replace(/\.000$/,'').replace(/0+$/,'').replace(/\.$/,'');
  $("setCardFee").value = (Number(settings.cardFeeRate||0)*100).toFixed(3).replace(/\.000$/,'').replace(/0+$/,'').replace(/\.$/,'');
}

/* Export / Import */
$("btnExport").onclick = ()=>{
  const hoursCalc = Math.max(0, Number(invHoursEl?.value || 0));
  const laborCalc = hoursCalc>0 ? (hoursCalc*Number(settings.laborRate||0)) : Math.max(0, Number(invLaborEl?.value || 0));
  const subCalc = sellTotal + laborCalc;
  const taxCalc = subCalc * (Number(settings.tpsRate||0) + Number(settings.tvqRate||0));
  const grandCalc = subCalc + taxCalc;
  const cardCalc = ((invPayMethodEl?.value||"")==="card") ? (grandCalc*Number(settings.cardFeeRate||0)) : 0;
  const netCalc = subCalc - costTotal - cardCalc;

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
    const cardFeeRate = Number(obj.settings?.cardFeeRate ?? 0.025);
    batch.set(docSettings(), { tpsRate, tvqRate, cardFeeRate, updatedAt: serverTimestamp() }, { merge:true });

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
            ${mechanics.map(m=>`<option value="${m.uid}">${safe(m.name)}</option>`).join("")}
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
  const ref = doc(colWorkorders(), id);
  await updateDoc(ref, { status, updatedAt: isoNow(), updatedAtTs: serverTimestamp(), updatedBy: currentUid });

  // Update local cache immediately (meilleure UX + évite impression "ça marche pas")
  const wo = workorders.find(w=>w.id===id);
  if(wo){
    wo.status = status;
    wo.updatedAt = isoNow();
    wo.updatedBy = currentUid;
  }
  try{ renderRepairs(); }catch(e){}
  try{ renderDashboard(); }catch(e){}
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
        <button type="button" class="btn btn-small" data-act="printWo" data-id="${wo.id}">Imprimer / PDF</button>
        ${wo.status!=="EN_COURS" ? `<button type="button" class="btn btn-small btn-ghost" data-act="setWoStatus" data-id="${wo.id}" data-status="EN_COURS">Démarrer</button>` : ``}
        ${wo.status!=="TERMINE" ? `<button type="button" class="btn btn-small btn-ghost" data-act="setWoStatus" data-id="${wo.id}" data-status="TERMINE">Terminer</button>` : `<button type="button" class="btn btn-small btn-ghost" data-act="setWoStatus" data-id="${wo.id}" data-status="OUVERT">Rouvrir</button>`}
        ${currentRole==="admin" ? `<button type="button" class="btn btn-small btn-danger" data-act="deleteWo" data-id="${wo.id}">Supprimer</button>` : ``}
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
window.__setWoStatus = async (id, next)=>{ await setWorkorderStatus(id, next); closeModal(); try{ toast("Statut mis à jour ✅"); }catch(e){} };
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
    unsubProfile = onSnapshot(docStaffProfile(), (snap)=>{
      if(snap.exists()){
        const d = snap.data();
        currentRole = (d.role === "admin") ? "admin" : "mechanic"; window.currentRole = currentRole; if(d.disabled===true){ alert("Compte désactivé."); signOut(auth); return; }
        currentUserName = d.fullName || d.name || d.email || "";
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

function renderInvoicePrint(){
  const area = document.getElementById("invPrintArea");
  if(!area) return;

  const custId = invCustomerEl?.value || "";
  const cust = customers.find(c=>c.id===custId) || {};
  const clientName = cust.fullName || "";
  const ref = String(invRefEl?.value || "").trim();
  const date = String(invDateEl?.value || "");
  const pay = invPaymentLabel(invPayMethodEl?.value || "cash");

  const items = readInvoiceItems();
  const partsSell = items.reduce((s,it)=> s + Number(it.price||0)*Number(it.qty||1), 0);
  const hours = Math.max(0, Number(invHoursEl?.value || 0));
  const labor = hours>0 ? (hours*Number(settings.laborRate||0)) : Math.max(0, Number(invLaborEl?.value || 0));
  const sub = partsSell + labor;
  const tax = sub * (Number(settings.tpsRate||0) + Number(settings.tvqRate||0));
  const grand = sub + tax;

  const setTxt=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent = val; };
  setTxt("printGarageLine", settings.garageName||"");
  setTxt("printGarageName", settings.garageName||"");
  setTxt("printGarageAddress", settings.garageAddress||"");
  setTxt("printGaragePhone", settings.garagePhone||"");
  setTxt("printGarageEmail", settings.garageEmail||"");
  setTxt("printClientName", clientName);
  setTxt("printInvoiceMeta", `${ref?("Réf: "+ref+" • "):""}${date?("Date: "+date+" • "):""}Paiement: ${pay}`);
  setTxt("printSub", money(sub));
  setTxt("printTax", money(tax));
  setTxt("printGrand", money(grand));
  setTxt("printSignature", settings.signatureName||"");

  const tbody = document.getElementById("printItemsTbody");
  if(tbody){
    tbody.innerHTML = items.map(it=>`
      <tr>
        <td>${safe(it.desc||"")}</td>
        <td>${safe(String(it.qty||1))}</td>
        <td style="text-align:right">${money(Number(it.price||0))}</td>
      </tr>
    `).join("");
  }
}

async function sendInvoiceEmail(){
  const to = String(invEmailEl?.value || "").trim();
  if(!to){
    alert("Ajoute l'email du client.");
    return;
  }
  const custId = invCustomerEl?.value || "";
  const cust = customers.find(c=>c.id===custId) || {};
  const clientName = cust.fullName || "";

  const ref = String(invRefEl?.value || "").trim() || "Facture";
  const date = String(invDateEl?.value || "");
  const pay = invPaymentLabel(invPayMethodEl?.value || "cash");

  const items = readInvoiceItems();
  const rows = items.map(it=>`
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${safe(it.desc||"")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${safe(String(it.qty||1))}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(Number(it.price||0))}</td>
    </tr>
  `).join("");

  const partsCost = items.reduce((s,it)=> s + Number(it.cost||0)*Number(it.qty||1), 0);
  const partsSell = items.reduce((s,it)=> s + Number(it.price||0)*Number(it.qty||1), 0);
  const hours = Math.max(0, Number(invHoursEl?.value || 0));
  const labor = hours>0 ? (hours*Number(settings.laborRate||0)) : Math.max(0, Number(invLaborEl?.value || 0));
  const sub = partsSell + labor;
  const tax = sub * (Number(settings.tpsRate||0) + Number(settings.tvqRate||0));
  const grand = sub + tax;
  const cardFee = (String(invPayMethodEl?.value||"") === "card") ? (grand*Number(settings.cardFeeRate||0)) : 0;
  const netProfit = sub - partsCost - cardFee;

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto;max-width:720px">
    <h2 style="margin:0 0 6px 0">${safe(settings.garageName||"Garage")}</h2>
    <div style="color:#666;margin-bottom:14px">${safe(settings.garageAddress||"")}</div>

    <h3 style="margin:0 0 8px 0">Facture ${safe(ref)}</h3>
    <div style="color:#666;margin-bottom:10px">Date: ${safe(date)} • Paiement: ${safe(pay)}</div>
    <div style="margin:10px 0"><b>Client:</b> ${safe(clientName)}</div>

    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:10px;overflow:hidden">
      <thead>
        <tr style="background:#f7f7f7">
          <th style="text-align:left;padding:8px">Description</th>
          <th style="text-align:right;padding:8px">Qté</th>
          <th style="text-align:right;padding:8px">Prix</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div></div>
      <div>
        <div style="display:flex;justify-content:space-between"><span>Sous-total</span><b>${money(sub)}</b></div>
        <div style="display:flex;justify-content:space-between;color:#666"><span>Taxes</span><b>${money(tax)}</b></div>
        <div style="display:flex;justify-content:space-between"><span>Total</span><b>${money(grand)}</b></div>
      </div>
    </div>

    <div style="margin-top:18px;color:#666">Merci.</div>
    <div style="margin-top:8px"><b>${safe(settings.signatureName||"")}</b></div>
  </div>`;

  await addDoc(collection(db, "mail"), {
    to,
    message: { subject: `Facture ${ref} - ${settings.garageName||"Garage"}`, html },
    createdAt: serverTimestamp()
  });

  alert("Email ajouté à la file d'envoi ✅");
}

// iOS Safari: parfois après window.print(), le scroll se bloque.
// On force un reset léger.
window.addEventListener("afterprint", ()=>{
  try{
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    window.scrollTo(0, window.scrollY);
  }catch(e){}
});

if(btnInvPdf) btnInvPdf.addEventListener("click", ()=>{
  try{
    renderInvoicePrint();
    const area = document.getElementById("invPrintArea");
    if(!area){ window.print(); return; }
    const w = window.open("", "_blank");
    if(!w){ window.print(); return; }
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Facture</title><link rel="stylesheet" href="assets/style.css"></head><body>${area.outerHTML}<script>setTimeout(()=>{window.print();},300);<\/script></body></html>`);
    w.document.close();
  }catch(e){ console.error(e); window.print(); }
});

function toast(msg){
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>{ el.classList.add("show"); }, 10);
  setTimeout(()=>{ el.classList.remove("show"); setTimeout(()=>el.remove(), 250); }, 2200);
}

async function copyText(txt){
  try{ await navigator.clipboard.writeText(String(txt||"")); return true; }
  catch(e){ try{ window.prompt("Copier:", String(txt||"")); return true; }catch(_){ return false; } }
}
function buildInviteLink(code, email){
  const base = window.location.origin + window.location.pathname;
  return base + `#invite=${encodeURIComponent(code||"")}&email=${encodeURIComponent(email||"")}`;
}
function parseHashParams(){
  const h = (window.location.hash||"").replace(/^#/, "");
  const out = {};
  h.split("&").forEach(part=>{
    const [k,v] = part.split("=");
    if(!k) return;
    out[decodeURIComponent(k)] = decodeURIComponent(v||"");
  });
  return out;
}

async function registerWithInvite(fullName, code, email, password){
  const invRef = doc(db,"invites",code);
  const invSnap = await getDoc(invRef);
  if(!invSnap.exists()) throw new Error("Code invitation invalide");
  const inv = invSnap.data()||{};
  if(String(inv.email||"").toLowerCase() !== String(email||"").toLowerCase()) throw new Error("Invitation pour un autre email");
  if(inv.used) throw new Error("Invitation déjà utilisée");
  const role = String(inv.role||"mechanic");

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  // Create staff profile for this user
  await setDoc(doc(db,"staff",uid), {
    fullName,
    email,
    role,
    inviteCode: code,
    disabled: false,
    createdAt: serverTimestamp()
  });

  await updateDoc(invRef, { used:true, usedBy:uid, usedAt:serverTimestamp() });

  try{ await logEvent("account_created",{inviteCode:code, role}); }catch(e){}
}

function wireAuthTabs(){
  const tabLogin = $("tabLogin");
  const tabReg = $("tabRegister");
  const fLogin = $("formLogin");
  const fReg = $("formRegisterInvite");
  if(!tabLogin || !tabReg || !fLogin || !fReg) return;

  tabLogin.onclick = ()=>{
    tabLogin.classList.add("active"); tabReg.classList.remove("active");
    fLogin.style.display = ""; fReg.style.display = "none";
  };
  tabReg.onclick = ()=>{
    tabReg.classList.add("active"); tabLogin.classList.remove("active");
    fReg.style.display = ""; fLogin.style.display = "none";
    const p = parseHashParams();
    if(p.invite) fReg.inviteCode.value = p.invite;
    if(p.email) fReg.email.value = p.email;
  };

  // default: login
  tabLogin.onclick();

  // if hash has invite, auto open register
  const p = parseHashParams();
  if(p.invite || p.email) tabReg.onclick();

  fReg.onsubmit = async (ev)=>{
    ev.preventDefault();
    const fullName = String(fReg.fullName.value||"").trim();
    const code = String(fReg.inviteCode.value||"").trim();
    const email = String(fReg.email.value||"").trim().toLowerCase();
    const password = String(fReg.password.value||"").trim();
    if(password.length < 6) return alert("Mot de passe: minimum 6 caractères");
    try{
      await registerWithInvite(fullName, code, email, password);
      alert("Compte créé ✅");
      // clean hash
      history.replaceState(null, "", window.location.pathname);
    }catch(e){
      console.error(e);
      alert("Erreur création compte: " + (e.message||e));
    }
  };
}
document.addEventListener("DOMContentLoaded", ()=>wireAuthTabs());

async function logEvent(type, data){
  try{
    if(!auth.currentUser) return;
    await addDoc(collection(db,"logs"), {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email || "",
      type: String(type||""),
      data: data || {},
      createdAt: serverTimestamp()
    });
  }catch(e){
    console.warn("logEvent failed", e);
  }
}

async function createInviteCode(email, role){
  const code = "GP-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  await setDoc(doc(db,"invites",code), {
    email: String(email||"").toLowerCase(),
    role: String(role||"mechanic"),
    used: false,
    createdAt: serverTimestamp()
  });
  try{ await logEvent("invite_created",{code,email,role}); }catch(e){}
  return code;
}

async function loadInvites(){
  const tbody = $("invitesTbody");
  if(!tbody) return;
  if(currentRole !== "admin"){ tbody.innerHTML = '<tr><td class="muted" colspan="6">Admin seulement.</td></tr>'; return; }
  tbody.innerHTML = '<tr><td class="muted" colspan="6">Chargement...</td></tr>';
  try{
    const snap = await getDocs(query(collection(db,"invites"), orderBy("createdAt","desc"), limit(100)));
    const rows = [];
    snap.forEach(d=>{
      const x=d.data()||{};
      rows.push({code:d.id, ...x});
    });
    if(rows.length===0){
      tbody.innerHTML = '<tr><td class="muted" colspan="6">Aucune invitation.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r=>{
      const used = r.used ? "Oui" : "Non";
      const dt = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : "—";
      const link = buildInviteLink(r.code, r.email);
      return `<tr>
        <td><code>${safe(r.code)}</code></td>
        <td>${safe(r.email||"")}</td>
        <td>${safe(r.role||"")}</td>
        <td>${used}</td>
        <td class="muted">${safe(dt)}</td>
        <td style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-small" data-act="copyInvite" data-link="${safe(link)}">Copier lien</button>
          <button class="btn btn-ghost btn-small" data-act="emailInvite" data-code="${safe(r.code)}" data-email="${safe(r.email)}" data-role="${safe(r.role)}">Envoyer email</button>
        </td>
      </tr>`;
    }).join("");
  }catch(e){
    console.error(e);
    tbody.innerHTML = '<tr><td class="muted" colspan="6">Erreur.</td></tr>';
  }
}

async function sendInviteEmail(code, email, role){
  const link = buildInviteLink(code, email);
  const subject = "Invitation — Garage Pro One";
  const html = `
  <div style="font-family:Arial,sans-serif;line-height:1.5">
    <h2>Invitation Garage Pro One</h2>
    <p>Bonjour,</p>
    <p>Vous avez été invité en tant que <b>${safe(role||"mechanic")}</b>.</p>
    <p><b>Lien direct:</b><br/><a href="${link}">${link}</a></p>
    <p><b>Code invitation:</b> <code>${safe(code)}</code></p>
    <p>Si le lien ne fonctionne pas, ouvrez le site puis collez le code dans “Créer un compte (invitation)”.</p>
    <hr/>
    <small>Garage Pro One — Montréal</small>
  </div>`;
  await addDoc(collection(db,"mail"), { to: email, message: { subject, html }, createdAt: serverTimestamp() });
  try{ await logEvent("invite_email_sent",{code,email,role,link}); }catch(e){}
}


function renderStaffRows(rows){
  const tbody = $("staffTbody");
  if(!tbody) return;
  if(currentRole !== "admin"){ tbody.innerHTML = '<tr><td class="muted" colspan="5">Admin seulement.</td></tr>'; return; }
  if(!rows || rows.length===0){
    tbody.innerHTML = '<tr><td class="muted" colspan="5">Aucun employé.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r=>{
    const active = (r.disabled===true) ? "Non" : "Oui";
    const isSelf = (r.uid === currentUid);
    const lockNote = isSelf ? '<span class="badge" style="margin-left:6px">Vous</span>' : '';
    return `<tr>
      <td>${safe(r.fullName||"")}${lockNote}</td>
      <td>${safe(r.email||"")}</td>
      <td>${safe(r.role||"")}</td>
      <td>${active}</td>
      <td style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-small" data-act="toggleDisabled" data-uid="${safe(r.uid)}" data-disabled="${r.disabled===true}" ${isSelf ? "disabled" : ""}>${r.disabled===true ? "Activer" : "Désactiver"}</button>
        <button class="btn btn-ghost btn-small" data-act="makeAdmin" data-uid="${safe(r.uid)}" ${isSelf ? "disabled" : ""}>Admin</button>
        <button class="btn btn-ghost btn-small" data-act="makeMech" data-uid="${safe(r.uid)}" ${isSelf ? "disabled" : ""}>Mécano</button>
      </td>
    </tr>`;
  }).join("");
}

function renderInviteRows(rows){
  const tbody = $("invitesTbody");
  if(!tbody) return;
  if(currentRole !== "admin"){ tbody.innerHTML = '<tr><td class="muted" colspan="6">Admin seulement.</td></tr>'; return; }
  if(!rows || rows.length===0){
    tbody.innerHTML = '<tr><td class="muted" colspan="6">Aucune invitation.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r=>{
    const used = r.used ? "Oui" : "Non";
    const createdAt = r.createdAt && r.createdAt.toDate ? r.createdAt.toDate().toLocaleString() : "";
    return `<tr>
      <td>${safe(r.code||"")}</td>
      <td>${safe(r.email||"")}</td>
      <td>${safe(r.role||"")}</td>
      <td>${used}</td>
      <td>${safe(createdAt)}</td>
      <td>
        <button class="btn btn-ghost btn-small" data-act="deleteInvite" data-code="${safe(r.code||"")}">Supprimer</button>
      </td>
    </tr>`;
  }).join("");
}

async function loadStaffList(){
  const tbody = $("staffTbody");
  if(!tbody) return;
  if(currentRole !== "admin"){ tbody.innerHTML = '<tr><td class="muted" colspan="5">Admin seulement.</td></tr>'; return; }
  // Prefer live data when available
  if(staffLiveRows && staffLiveRows.length){
    renderStaffRows(staffLiveRows);
    return;
  }
  tbody.innerHTML = '<tr><td class="muted" colspan="5">Chargement...</td></tr>';
  try{
    const snap = await getDocs(query(collection(db,"staff"), orderBy("createdAt","desc"), limit(200)));
    const rows = snap.docs.map(d=>({uid:d.id, ...(d.data()||{})}));
    renderStaffRows(rows);
  }catch(e){
    console.error(e);
    tbody.innerHTML = '<tr><td class="muted" colspan="5">Erreur.</td></tr>';
  }
}


async function countActiveAdmins(){
  // count admins that are NOT disabled (disabled != true)
  const snap = await getDocs(query(collection(db,"staff"), where("role","==","admin"), limit(200)));
  const admins = snap.docs.map(d=>({uid:d.id, ...(d.data()||{})}));
  return admins.filter(a => a.disabled !== true).length;
}

async function guardNotLastAdmin(targetUid, actionLabel){
  // Only needed if target is currently an active admin
  const targetSnap = await getDoc(doc(db,"staff", targetUid));
  if(!targetSnap.exists()) return;
  const t = targetSnap.data()||{};
  const targetIsActiveAdmin = (String(t.role||"").toLowerCase()==="admin" && t.disabled !== true);
  if(!targetIsActiveAdmin) return;

  const n = await countActiveAdmins();
  if(n <= 1){
    throw new Error("Action refusée: impossible de " + actionLabel + " le dernier admin actif.");
  }
}

async function setStaffDisabled(uid, disabled){
  await updateDoc(doc(db,"staff",uid), { disabled: !!disabled, updatedAt: serverTimestamp() });
  try{ await logEvent("staff_disabled_changed",{targetUid:uid, disabled:!!disabled}); }catch(e){}
}
async function setStaffRole(uid, role){
  await updateDoc(doc(db,"staff",uid), { role: String(role), updatedAt: serverTimestamp() });
  try{ await logEvent("staff_role_changed",{targetUid:uid, role:String(role)}); }catch(e){}
}

function labelLogType(t){
  const m = {
    invite_created: "Invitation créée",
    invite_email_sent: "Invitation email envoyé",
    account_created: "Compte créé",
    staff_role_changed: "Rôle changé",
    staff_disabled_changed: "Statut employé",
    workorder_status: "Statut réparation",
    invoice_saved: "Facture sauvegardée"
  };
  return m[t] || t || "—";
}
async function loadLogs(){
  const tbody = $("logsTbody");
  if(!tbody) return;
  tbody.innerHTML = '<tr><td class="muted" colspan="4">Chargement...</td></tr>';
  try{
    const typeFilter = String($("logsFilterType")?.value||"");
    let q = query(collection(db,"logs"), orderBy("createdAt","desc"), limit(80));
    if(currentRole !== "admin" && auth.currentUser){
      q = query(collection(db,"logs"), where("uid","==",auth.currentUser.uid), orderBy("createdAt","desc"), limit(80));
    }
    const snap = await getDocs(q);
    const rows=[];
    snap.forEach(d=>{
      const x=d.data()||{};
      if(typeFilter && x.type !== typeFilter) return;
      rows.push(x);
    });
    if(rows.length===0){
      tbody.innerHTML = '<tr><td class="muted" colspan="4">Aucun log.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r=>{
      const dt = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : "—";
      const details = safe(JSON.stringify(r.data||{}));
      return `<tr>
        <td class="muted">${safe(dt)}</td>
        <td>${safe(r.email||"")}</td>
        <td><b>${safe(labelLogType(r.type))}</b></td>
        <td><code style="white-space:pre-wrap">${details}</code></td>
      </tr>`;
    }).join("");
  }catch(e){
    console.error(e);
    tbody.innerHTML = '<tr><td class="muted" colspan="4">Erreur chargement logs.</td></tr>';
  }
}

function wireEmployeesUI(){
  const btnCreate = $("btnCreateInvite");
  if(btnCreate){
    btnCreate.onclick = async ()=>{
      const email = String($("inviteEmail").value||"").trim().toLowerCase();
      const role = String($("inviteRole").value||"mechanic");
      if(!email.includes("@")) return alert("Email invalide");
      try{
        const code = await createInviteCode(email, role);
        const link = buildInviteLink(code, email);
        $("inviteCreatedInfo").textContent = "Code: "+code;
        $("btnCopyInviteLink").style.display = "";
        $("btnSendInviteEmail").style.display = "";
        $("btnCopyInviteLink").onclick = ()=>copyText(link).then(()=>alert("Lien copié ✅"));
        $("btnSendInviteEmail").onclick = ()=>sendInviteEmail(code, email, role).then(()=>alert("Email envoyé ✅")).catch(e=>{console.error(e); alert("Erreur envoi email");});
        await loadInvites();
      }catch(e){
        console.error(e);
        alert("Erreur création invitation");
      }
    };
  }

  const invitesT = $("invitesTbody");
  if(invitesT){
    invitesT.addEventListener("click",(ev)=>{
      const btn = ev.target.closest("[data-act]");
      if(!btn) return;
      const act = btn.getAttribute("data-act");
      if(act==="copyInvite"){
        const link = btn.getAttribute("data-link")||"";
        copyText(link).then(()=>alert("Lien copié ✅"));
      }
      if(act==="emailInvite"){
        const code = btn.getAttribute("data-code")||"";
        const email = btn.getAttribute("data-email")||"";
        const role = btn.getAttribute("data-role")||"mechanic";
        sendInviteEmail(code, email, role).then(()=>alert("Email envoyé ✅")).catch(e=>{console.error(e); alert("Erreur email");});
      }
    });
  }

  const staffT = $("staffTbody");
  if(staffT){
    staffT.addEventListener("click",(ev)=>{
      const btn = ev.target.closest("[data-act]");
      if(!btn) return;
      const act = btn.getAttribute("data-act");
      const uid = btn.getAttribute("data-uid")||"";
      if(!uid) return;
      if(act==="toggleDisabled"){
        const cur = btn.getAttribute("data-disabled")==="true";
        setStaffDisabled(uid, !cur).then(()=>loadStaffList());
      }
      if(act==="makeAdmin"){
        setStaffRole(uid, "admin").then(()=>loadStaffList());
      }
      if(act==="makeMech"){
        setStaffRole(uid, "mechanic").then(()=>loadStaffList());
      }
    });
  }

  const btnLogs = $("btnRefreshLogs");
  if(btnLogs) btnLogs.onclick = ()=>loadLogs();
  const sel = $("logsFilterType");
  if(sel) sel.onchange = ()=>loadLogs();
}

document.addEventListener("DOMContentLoaded", ()=>wireEmployeesUI());

try{
  onAuthStateChanged(auth, (u)=>{
    console.log("👤 Auth state:", u ? {uid:u.uid,email:u.email} : null);
  });
}catch(e){
  console.warn("Auth debug hook failed", e);
}

function explainFirebaseError(e){
  const msg = (e && (e.message||e.code||e)) + "";
  if(msg.includes("permission-denied") || msg.includes("Missing or insufficient permissions")){
    console.error("🚫 Firestore permissions: vérifie les règles + ton compte admin/staff.");
  }
}
window.addEventListener("unhandledrejection", (ev)=>{
  try{ explainFirebaseError(ev.reason); }catch(_){}
});