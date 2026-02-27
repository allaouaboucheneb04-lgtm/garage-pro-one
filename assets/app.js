setNavVisible(false);

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, runTransaction, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const GARAGE = {
  name: "Garage Pro One",
  phone: "(514) 727-0522",
  email: "garageproone@gmail.com",
  address: "7880 Boul PIE-IX, Montréal (QC) H1Z 3T3, Canada",
  tps: "73259 0344",
  tvq: "1230268666",
};

const $ = (q)=>document.querySelector(q);
const $$ = (q)=>Array.from(document.querySelectorAll(q));
const safe = (s)=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const money = (n)=>Number(n||0).toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
const isoNow = ()=>{
  const d=new Date(); const p=(x)=>String(x).padStart(2,"0");
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes());
};
const formatInvoiceNo = (n)=>"GP-"+String(Number(n||0)).padStart(4,"0");
const pill = (status)=> status==="TERMINE" ? '<span class="pill ok">Terminé</span>' : '<span class="pill warn">'+safe(status||"OUVERT")+'</span>';

if(!window.firebaseConfig) alert("firebase-config.js manquant.");
const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let uid=null;
let customers=[], vehicles=[], workorders=[];
let settings={tpsRate:0.05, tvqRate:0.09975};

let unsubC=null, unsubV=null, unsubW=null, unsubS=null;

const colCustomers = ()=>collection(db,"users",uid,"customers");
const colVehicles  = ()=>collection(db,"users",uid,"vehicles");
const colWorkorders= ()=>collection(db,"users",uid,"workorders");
const docSettings  = ()=>doc(db,"users",uid,"meta","settings");
const docCounters  = ()=>doc(db,"users",uid,"meta","counters");
const docUser      = ()=>doc(db,"users",uid);


function setNavVisible(isVisible){
  const nav = document.getElementById("navBar");
  const logout = document.getElementById("logoutBtn");
  if(nav) nav.classList.toggle("hidden", !isVisible);
  if(logout) logout.classList.toggle("hidden", !isVisible);
}
function showTab(name){
  $("#dashboardTab").classList.toggle("hidden", name!=="dashboard");
  $("#clientsTab").classList.toggle("hidden", name!=="clients");
  $("#repairsTab").classList.toggle("hidden", name!=="repairs");
  $("#settingsTab").classList.toggle("hidden", name!=="settings");
  $$(".nav .btn[data-tab]").forEach(b=>b.classList.toggle("primary", b.getAttribute("data-tab")===name));
}
$$(".nav .btn[data-tab]").forEach(b=>b.addEventListener("click", ()=>showTab(b.getAttribute("data-tab"))));

function openModal(title, html){
  $("#modalTitle").textContent=title;
  $("#modalBody").innerHTML=html;
  $("#modalBack").classList.add("show");
}
function closeModal(){ $("#modalBack").classList.remove("show"); }
$("#closeModalBtn").addEventListener("click", closeModal);
$("#modalBack").addEventListener("click",(e)=>{ if(e.target.id==="modalBack") closeModal(); });

async function ensureMeta(){
  const sref=docSettings(); const ss=await getDoc(sref);
  if(!ss.exists()) await setDoc(sref,{tpsRate:0.05,tvqRate:0.09975,updatedAt:serverTimestamp()});
  const cref=docCounters(); const cs=await getDoc(cref);
  if(!cs.exists()) await setDoc(cref,{invoiceNext:1,updatedAt:serverTimestamp()});
}

// migrate legacy "fullName" on users/{uid} to customers (your screenshot case)
async function migrateLegacyClient(){
  const uref=docUser(); const us=await getDoc(uref);
  if(!us.exists()) return;
  const d=us.data()||{};
  const hasLegacy=(d.fullName||d.phone||d.email) && !d.legacyMigrated;
  if(!hasLegacy) return;
  await addDoc(colCustomers(),{
    fullName:d.fullName||"Client",
    phone:d.phone||"",
    email:d.email||"",
    notes:d.notes||"",
    createdAt:d.createdAt||isoNow(),
    createdAtTs:serverTimestamp()
  });
  await updateDoc(uref,{legacyMigrated:true,updatedAt:serverTimestamp()});
}

function getCustomer(id){ return customers.find(c=>c.id===id)||null; }
function getVehicle(id){ return vehicles.find(v=>v.id===id)||null; }

function unsubscribeAll(){
  if(unsubC) unsubC(); if(unsubV) unsubV(); if(unsubW) unsubW(); if(unsubS) unsubS();
  unsubC=unsubV=unsubW=unsubS=null;
}

function subscribeAll(){
  unsubS = onSnapshot(docSettings(), (snap)=>{
    if(snap.exists()){
      settings={...settings,...snap.data()};
      $("#tpsRate").value=String(settings.tpsRate??0.05);
      $("#tvqRate").value=String(settings.tvqRate??0.09975);
    }
  });

  unsubC = onSnapshot(query(colCustomers(), orderBy("fullName","asc")), (snap)=>{
    customers=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  });
  unsubV = onSnapshot(query(colVehicles(), orderBy("createdAt","desc")), (snap)=>{
    vehicles=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  });
  unsubW = onSnapshot(query(colWorkorders(), orderBy("createdAt","desc"), limit(400)), (snap)=>{
    workorders=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderAll();
  });
}

function renderAll(){
  renderDashboard();
  renderClients();
  renderRepairs();
}

// ===== Auth =====
$("#loginBtn").addEventListener("click", async ()=>{
  const e=$("#email").value.trim(); const p=$("#pass").value;
  $("#authMsg").textContent="Connexion...";
  try{
    await signInWithEmailAndPassword(auth,e,p);
    $("#authMsg").textContent="OK";
  }catch(err){
    console.error(err);
    $("#authMsg").textContent="Erreur: "+(err.code||err.message||"");
    alert("Erreur connexion: "+(err.message||err));
  }
});

$("#logoutBtn").addEventListener("click", ()=>signOut(auth));

onAuthStateChanged(auth, async (user)=>{
  unsubscribeAll();
  if(!user){
    uid=null;
    setNavVisible(false);
    $("#authView").classList.remove("hidden");
    $("#appView").classList.add("hidden");
    return;
  }
  uid=user.uid;
  setNavVisible(true);
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  showTab("dashboard");
  await ensureMeta();
  await migrateLegacyClient();
  subscribeAll();
});

// ===== Dashboard =====
$("#search").addEventListener("input", ()=>renderSearch());
$("#newClientBtn").addEventListener("click", ()=>openClientForm());
$("#newClientBtn2").addEventListener("click", ()=>openClientForm());
$("#newRepairBtn").addEventListener("click", ()=>openRepairWizard());
$("#newRepairBtn2").addEventListener("click", ()=>openRepairWizard());

function renderDashboard(){
  const monthKey=new Date().toISOString().slice(0,7);
  const monthTotal=workorders.filter(w=>String(w.createdAt||"").slice(0,7)===monthKey).reduce((a,w)=>a+Number(w.total||0),0);
  const open=workorders.filter(w=>w.status!=="TERMINE").length;
  $("#kpis").innerHTML=`
    <div class="card" style="box-shadow:none;flex:1"><div class="muted">Clients</div><div style="font-size:22px;font-weight:900">${customers.length}</div></div>
    <div class="card" style="box-shadow:none;flex:1"><div class="muted">Véhicules</div><div style="font-size:22px;font-weight:900">${vehicles.length}</div></div>
    <div class="card" style="box-shadow:none;flex:1"><div class="muted">Ouvert</div><div style="font-size:22px;font-weight:900">${open}</div></div>
    <div class="card" style="box-shadow:none;flex:1"><div class="muted">Total (${monthKey})</div><div style="font-size:22px;font-weight:900">${money(monthTotal)}</div></div>
  `;
  renderSearch();
}

function renderSearch(){
  const q=$("#search").value.trim().toLowerCase();
  if(!q){ $("#searchResults").textContent="Tape une recherche."; return; }
  const hitsC = customers.filter(c=> (c.fullName||"").toLowerCase().includes(q) || (c.phone||"").includes(q) || (c.email||"").toLowerCase().includes(q));
  const hitsV = vehicles.filter(v=> (v.plate||"").toLowerCase().includes(q) || (v.vin||"").toLowerCase().includes(q));
  const out=[];
  hitsC.forEach(c=>{
    out.push(`<div class="card" style="box-shadow:none">
      <b>${safe(c.fullName||"")}</b> <span class="muted">${safe(c.phone||"")}</span><br/>
      <span class="muted">${safe(c.email||"")}</span><div class="row" style="margin-top:8px">
        <button class="btn small" onclick="window.__openClient('${c.id}')">Ouvrir</button>
        <button class="btn small primary" onclick="window.__newVehicle('${c.id}')">+ Véhicule</button>
      </div>
    </div>`);
  });
  hitsV.forEach(v=>{
    const c=getCustomer(v.customerId);
    const txt=[v.year,v.make,v.model].filter(Boolean).join(" ");
    out.push(`<div class="card" style="box-shadow:none">
      <b>${safe(txt||"Véhicule")}</b> <span class="muted">${safe(v.plate||"")}</span><br/>
      <span class="muted">Client: ${safe(c?.fullName||"—")} • VIN: ${safe(v.vin||"")}</span>
      <div class="row" style="margin-top:8px"><button class="btn small primary" onclick="window.__newRepair('${v.id}')">+ Réparation</button></div>
    </div>`);
  });
  $("#searchResults").innerHTML=out.length?out.join(""):"<div class='muted'>Aucun résultat.</div>";
}

// ===== Clients CRUD =====
function renderClients(){
  $("#clientsCount").textContent = customers.length ? `${customers.length} client(s)` : "Aucun client";
  $("#clientsBody").innerHTML = customers.map(c=>`
    <tr>
      <td><b>${safe(c.fullName||"")}</b></td>
      <td>${safe(c.phone||"")}</td>
      <td>${safe(c.email||"")}</td>
      <td class="nowrap">
        <button class="btn small" onclick="window.__openClient('${c.id}')">Ouvrir</button>
        <button class="btn small primary" onclick="window.__newVehicle('${c.id}')">+ Véhicule</button>
      </td>
    </tr>
  `).join("");
}

function openClientForm(existing=null){
  const c=existing;
  openModal(c?"Modifier client":"Nouveau client", `
    <div class="row">
      <div class="field"><label>Nom complet *</label><input id="cName" value="${safe(c?.fullName||"")}" /></div>
      <div class="field"><label>Téléphone</label><input id="cPhone" value="${safe(c?.phone||"")}" /></div>
    </div>
    <div class="row">
      <div class="field"><label>Email</label><input id="cEmail" type="email" value="${safe(c?.email||"")}" /></div>
      <div class="field"><label>Notes</label><input id="cNotes" value="${safe(c?.notes||"")}" /></div>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:10px">
      <button class="btn primary" id="saveClientBtn">Enregistrer</button>
    </div>
  `);
  $("#saveClientBtn").addEventListener("click", async ()=>{
    const fullName=$("#cName").value.trim();
    if(!fullName) return alert("Nom requis.");
    const phone=$("#cPhone").value.trim();
    const email=$("#cEmail").value.trim();
    const notes=$("#cNotes").value.trim();
    if(c?.id){
      await updateDoc(doc(db,"users",uid,"customers",c.id),{fullName,phone,email,notes,updatedAt:serverTimestamp()});
    }else{
      await addDoc(colCustomers(),{fullName,phone,email,notes,createdAt:isoNow(),createdAtTs:serverTimestamp()});
    }
    closeModal();
  },{once:true});
}

window.__openClient = (id)=>{
  const c=getCustomer(id);
  const vlist=vehicles.filter(v=>v.customerId===id);
  openModal("Client", `
    <div class="row" style="align-items:flex-start">
      <div style="flex:1">
        <b>${safe(c?.fullName||"")}</b><br/>
        <span class="muted">${safe(c?.phone||"")} • ${safe(c?.email||"")}</span><br/>
        <span class="muted">${safe(c?.notes||"")}</span>
      </div>
      <div class="row">
        <button class="btn small" id="editClientBtn">Modifier</button>
        <button class="btn small primary" id="addVehicleBtn">+ Véhicule</button>
      </div>
    </div>
    <div class="hr"></div>
    <h2>Véhicules</h2>
    <div class="table">
      <table style="min-width:0">
        <thead><tr><th>Véhicule</th><th>Plaque</th><th>VIN</th><th>KM</th><th></th></tr></thead>
        <tbody>
          ${vlist.map(v=>{
            const txt=[v.year,v.make,v.model].filter(Boolean).join(" ");
            return `<tr>
              <td><b>${safe(txt||"")}</b></td>
              <td>${safe(v.plate||"")}</td>
              <td class="muted">${safe(v.vin||"")}</td>
              <td>${safe(v.currentKm||"")}</td>
              <td class="nowrap"><button class="btn small primary" onclick="window.__newRepair('${v.id}')">+ Réparation</button></td>
            </tr>`;
          }).join("") || `<tr><td colspan="5" class="muted">Aucun véhicule.</td></tr>`}
        </tbody>
      </table>
    </div>
  `);
  $("#editClientBtn").addEventListener("click", ()=>openClientForm(c), {once:true});
  $("#addVehicleBtn").addEventListener("click", ()=>openVehicleForm(id), {once:true});
};

window.__newVehicle = (customerId)=>openVehicleForm(customerId);

function openVehicleForm(customerId){
  openModal("Nouveau véhicule", `
    <div class="row">
      <div class="field"><label>Année</label><input id="vYear" inputmode="numeric" placeholder="2022"/></div>
      <div class="field"><label>Marque</label><input id="vMake" placeholder="Toyota"/></div>
      <div class="field"><label>Modèle</label><input id="vModel" placeholder="Corolla"/></div>
    </div>
    <div class="row">
      <div class="field"><label>Plaque</label><input id="vPlate" placeholder="ABC123"/></div>
      <div class="field"><label>VIN</label><input id="vVin" placeholder=""/></div>
      <div class="field"><label>KM</label><input id="vKm" inputmode="numeric" placeholder=""/></div>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:10px">
      <button class="btn primary" id="saveVehicleBtn">Enregistrer</button>
    </div>
  `);
  $("#saveVehicleBtn").addEventListener("click", async ()=>{
    const year=$("#vYear").value.trim();
    const make=$("#vMake").value.trim();
    const model=$("#vModel").value.trim();
    const plate=$("#vPlate").value.trim();
    const vin=$("#vVin").value.trim();
    const km=$("#vKm").value.trim();
    await addDoc(colVehicles(),{
      customerId, year, make, model, plate, vin,
      currentKm: km || "",
      createdAt: isoNow(),
      createdAtTs: serverTimestamp()
    });
    closeModal();
  },{once:true});
}

// ===== Repairs CRUD + invoice =====
function renderRepairs(){
  $("#repairsCount").textContent = workorders.length ? `${workorders.length} réparation(s)` : "Aucune réparation";
  $("#repairsBody").innerHTML = workorders.map(w=>{
    const v=getVehicle(w.vehicleId);
    const c=v?getCustomer(v.customerId):null;
    const veh=v?[v.year,v.make,v.model].filter(Boolean).join(" "):"—";
    return `
      <tr>
        <td class="nowrap">${safe(String(w.createdAt||"").slice(0,16))}</td>
        <td class="nowrap"><b>${safe(w.invoiceNo||"")}</b></td>
        <td>${safe(c?.fullName||"—")}</td>
        <td>${safe(veh)} <span class="muted">${safe(v?.plate||"")}</span></td>
        <td>${pill(w.status||"OUVERT")}</td>
        <td class="nowrap">${money(w.total||0)}</td>
        <td class="nowrap"><button class="btn small" onclick="window.__openRepair('${w.id}')">Ouvrir</button></td>
      </tr>
    `;
  }).join("");
}

window.__newRepair = (vehicleId)=>openWorkorderForm(vehicleId);

function openRepairWizard(){
  // select vehicle
  const options = vehicles.map(v=>{
    const c=getCustomer(v.customerId);
    const txt=[v.year,v.make,v.model].filter(Boolean).join(" ");
    return `<option value="${v.id}">${safe(txt)} — ${safe(v.plate||"")} — ${safe(c?.fullName||"")}</option>`;
  }).join("");
  openModal("Nouvelle réparation", `
    <div class="field"><label>Véhicule</label>
      <select id="rwVehicle">${options || "<option value=''>Aucun véhicule</option>"}</select>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:10px">
      <button class="btn primary" id="rwNextBtn" ${vehicles.length? "":"disabled"}>Continuer</button>
    </div>
  `);
  $("#rwNextBtn").addEventListener("click", ()=>{
    const vid=$("#rwVehicle").value;
    if(!vid) return;
    closeModal();
    openWorkorderForm(vid);
  },{once:true});
}

function calcTotals(items){
  const subtotal = items.reduce((a,it)=>a + Number(it.total||0), 0);
  const tpsRate = Number(settings.tpsRate||0.05);
  const tvqRate = Number(settings.tvqRate||0.09975);
  const tpsAmount = subtotal * tpsRate;
  const tvqAmount = subtotal * tvqRate;
  const total = subtotal + tpsAmount + tvqAmount;
  return {subtotal,tpsRate,tvqRate,tpsAmount,tvqAmount,total};
}

function openWorkorderForm(vehicleId){
  openModal("Réparation", `
    <div class="row">
      <div class="field"><label>Statut</label>
        <select id="wStatus">
          <option value="OUVERT">Ouvert</option>
          <option value="EN_COURS">En cours</option>
          <option value="TERMINE">Terminé</option>
        </select>
      </div>
      <div class="field"><label>KM (visite)</label><input id="wKm" inputmode="numeric" placeholder=""/></div>
      <div class="field"><label>Rendez-vous (optionnel)</label><input id="wAppt" type="datetime-local"/></div>
    </div>

    <div class="row">
      <div class="field"><label>Paiement</label>
        <select id="wPayMethod">
          <option value="">Non défini</option>
          <option value="CASH">Cash</option>
          <option value="CARTE">Carte</option>
          <option value="VIREMENT">Virement</option>
          <option value="AUTRE">Autre</option>
        </select>
      </div>
      <div class="field"><label>Statut paiement</label>
        <select id="wPayStatus">
          <option value="NON_PAYE">Non payé</option>
          <option value="PAYE">Payé</option>
        </select>
      </div>
    </div>

    <div class="field"><label>Problème rapporté</label><textarea id="wIssue"></textarea></div>

    <div class="hr"></div>
    <h2>Main d'œuvre / Pièces</h2>
    <div id="items"></div>
    <div class="row" style="margin-top:10px">
      <button class="btn small" id="addLaborBtn">+ Main d'œuvre</button>
      <button class="btn small" id="addPartBtn">+ Pièce</button>
      <span class="muted" id="totalsTxt" style="margin-left:auto"></span>
    </div>

    <div class="row" style="justify-content:flex-end;margin-top:12px">
      <button class="btn primary" id="saveWorkBtn">Enregistrer</button>
    </div>
  `);

  const items=[];
  const itemsEl = $("#items");
  const totalsEl = $("#totalsTxt");

  const renderItems = ()=>{
    itemsEl.innerHTML = items.map((it,idx)=>`
      <div class="card" style="box-shadow:none;margin-bottom:10px">
        <div class="row">
          <div class="field"><label>Type</label><input value="${safe(it.type)}" disabled/></div>
          <div class="field"><label>Description</label><input data-i="${idx}" data-k="desc" value="${safe(it.desc)}"/></div>
        </div>
        <div class="row">
          <div class="field"><label>Qté</label><input data-i="${idx}" data-k="qty" inputmode="decimal" value="${safe(it.qty)}"/></div>
          <div class="field"><label>Prix</label><input data-i="${idx}" data-k="price" inputmode="decimal" value="${safe(it.price)}"/></div>
          <div class="field"><label>Total</label><input value="${money(it.total)}" disabled/></div>
          <button class="btn small danger" data-del="${idx}">Supprimer</button>
        </div>
      </div>
    `).join("");
    itemsEl.querySelectorAll("input[data-i]").forEach(inp=>{
      inp.addEventListener("input", ()=>{
        const i=Number(inp.getAttribute("data-i"));
        const k=inp.getAttribute("data-k");
        items[i][k]=inp.value;
        const qty=Number(items[i].qty||0);
        const price=Number(items[i].price||0);
        items[i].total=qty*price;
        updateTotals();
        renderItems();
      });
    });
    itemsEl.querySelectorAll("button[data-del]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const i=Number(b.getAttribute("data-del"));
        items.splice(i,1);
        updateTotals();
        renderItems();
      });
    });
  };

  const updateTotals = ()=>{
    const t = calcTotals(items);
    totalsEl.textContent = `Sous-total ${money(t.subtotal)} • TPS ${money(t.tpsAmount)} • TVQ ${money(t.tvqAmount)} • Total ${money(t.total)}`;
  };

  $("#addLaborBtn").addEventListener("click", ()=>{
    items.push({type:"LABOR", desc:"", qty:"1", price:"0", total:0});
    renderItems(); updateTotals();
  });
  $("#addPartBtn").addEventListener("click", ()=>{
    items.push({type:"PART", desc:"", qty:"1", price:"0", total:0});
    renderItems(); updateTotals();
  });

  renderItems(); updateTotals();

  $("#saveWorkBtn").addEventListener("click", async ()=>{
    const status=$("#wStatus").value;
    const km=$("#wKm").value.trim();
    const appointmentAt=$("#wAppt").value.trim();
    const paymentMethod=$("#wPayMethod").value.trim();
    const paymentStatus=$("#wPayStatus").value.trim();
    const reportedIssue=$("#wIssue").value.trim();
    const totals=calcTotals(items);

    const countersRef = docCounters();
    const woRef = doc(colWorkorders());

    const invoiceNo = await runTransaction(db, async (tx)=>{
      const csnap = await tx.get(countersRef);
      const next = csnap.exists() ? Number(csnap.data().invoiceNext||1) : 1;
      const inv = formatInvoiceNo(next);
      tx.set(woRef, {
        vehicleId,
        status,
        km,
        appointmentAt: appointmentAt || "",
        paymentMethod: paymentMethod || "",
        paymentStatus: (paymentStatus==="PAYE" ? "PAYE" : "NON_PAYE"),
        reportedIssue,
        items,
        ...totals,
        invoiceNo: inv,
        createdAt: isoNow(),
        createdAtTs: serverTimestamp()
      });
      tx.set(countersRef, { invoiceNext: next+1, updatedAt: serverTimestamp() }, { merge:true });
      return inv;
    });

    // update vehicle km
    if(km){
      await updateDoc(doc(db,"users",uid,"vehicles",vehicleId), { currentKm: km, updatedAt: serverTimestamp() });
    }

    closeModal();
    alert("Réparation enregistrée: " + invoiceNo);
  },{once:true});
});

window.__openRepair = (workorderId)=>{
  const w = workorders.find(x=>x.id===workorderId);
  if(!w) return;
  const v=getVehicle(w.vehicleId);
  const c=v?getCustomer(v.customerId):null;
  const veh=[v?.year,v?.make,v?.model].filter(Boolean).join(" ");
  openModal("Réparation", `
    <div class="row" style="align-items:flex-start">
      <div style="flex:1">
        <b>${safe(w.invoiceNo||"")}</b> — ${safe(String(w.createdAt||"").slice(0,16))}<br/>
        <span class="muted">Client: ${safe(c?.fullName||"—")} • Véhicule: ${safe(veh)} ${safe(v?.plate||"")}</span><br/>
        <span class="muted">Paiement: <b>${safe(w.paymentMethod||"")}</b> — <b>${safe(w.paymentStatus||"")}</b></span><br/>
        ${w.appointmentAt ? `<span class="muted">Rendez-vous: ${safe(w.appointmentAt)}</span><br/>` : ""}
        <span class="muted">Statut: ${safe(w.status||"")}</span>
      </div>
      <div class="row">
        <button class="btn small" onclick="window.__printInvoice('${w.id}')">Imprimer / PDF</button>
      </div>
    </div>
    <div class="hr"></div>
    <div><b>Problème</b><div class="muted">${safe(w.reportedIssue||"")}</div></div>
    <div class="hr"></div>
    <div class="table">
      <table style="min-width:0">
        <thead><tr><th>Type</th><th>Description</th><th>Qté</th><th>Prix</th><th>Total</th></tr></thead>
        <tbody>
          ${(w.items||[]).map(it=>`
            <tr>
              <td>${safe(it.type||"")}</td>
              <td>${safe(it.desc||"")}</td>
              <td>${safe(it.qty||"")}</td>
              <td>${money(it.price||0)}</td>
              <td>${money(it.total||0)}</td>
            </tr>
          `).join("") || `<tr><td colspan="5" class="muted">Aucun item</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="hr"></div>
    <div class="row" style="justify-content:flex-end">
      <div><b>Sous-total:</b> ${money(w.subtotal||0)}</div>
      <div><b>TPS:</b> ${money(w.tpsAmount||0)}</div>
      <div><b>TVQ:</b> ${money(w.tvqAmount||0)}</div>
      <div><b>Total:</b> ${money(w.total||0)}</div>
    </div>
  `);
};

window.__printInvoice = (workorderId)=>{
  const w = workorders.find(x=>x.id===workorderId);
  if(!w) return;
  const v=getVehicle(w.vehicleId);
  const c=v?getCustomer(v.customerId):null;
  const veh=[v?.year,v?.make,v?.model].filter(Boolean).join(" ");
  const rows=(w.items||[]).map(it=>`
    <tr>
      <td>${safe(it.type||"")}</td>
      <td>${safe(it.desc||"")}</td>
      <td>${safe(it.qty||"")}</td>
      <td>${money(it.price||0)}</td>
      <td>${money(it.total||0)}</td>
    </tr>
  `).join("");

  const html = `
<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Facture ${safe(w.invoiceNo||"")}</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#111}
.top{display:flex;justify-content:space-between;gap:14px}
.h1{font-size:20px;font-weight:800;margin:0}
.muted{color:#555;font-size:12px}
.box{border:1px solid #ddd;border-radius:12px;padding:12px}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border-bottom:1px solid #eee;padding:8px;text-align:left;font-size:13px}
th{background:#fafafa}
.tot{margin-top:12px;max-width:360px;margin-left:auto}
.tot div{display:flex;justify-content:space-between;padding:4px 0}
.grand{font-weight:800;border-top:1px solid #ddd;padding-top:8px}
@media print{.no-print{display:none}body{margin:0}}
</style></head><body>
<div class="no-print" style="margin-bottom:12px"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
<div class="top">
  <div class="box" style="flex:1">
    <div class="h1">${safe(GARAGE.name)}</div>
    <div class="muted">${safe(GARAGE.address)}</div>
    <div class="muted">${safe(GARAGE.email)} • ${safe(GARAGE.phone)}</div>
    <div class="muted">TPS/TVH: ${safe(GARAGE.tps)} • TVQ: ${safe(GARAGE.tvq)}</div>
  </div>
  <div class="box" style="width:320px">
    <div><b>Facture:</b> ${safe(w.invoiceNo||"")}</div>
    <div><b>Date:</b> ${safe(String(w.createdAt||"").slice(0,16))}</div>
    <div><b>Statut:</b> ${safe(w.status||"")}</div>
    <div class="muted" style="margin-top:6px"><b>Paiement:</b> ${safe(w.paymentMethod||"")} — ${safe(w.paymentStatus||"")}</div>
    ${w.appointmentAt ? `<div class="muted"><b>Rendez-vous:</b> ${safe(w.appointmentAt)}</div>` : ""}
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
  <div class="box"><b>Client</b><br/>${safe(c?.fullName||"—")}<br/>${safe(c?.phone||"")}<br/>${safe(c?.email||"")}</div>
  <div class="box"><b>Véhicule</b><br/>${safe(veh)}<br/>Plaque: ${safe(v?.plate||"")}<br/>VIN: ${safe(v?.vin||"")}<br/>KM (visite): ${safe(w.km||"")}</div>
</div>

<h3 style="margin-top:14px">Détails</h3>
<table><thead><tr><th>Type</th><th>Description</th><th>Qté</th><th>Prix</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>

<div class="tot">
  <div><span>Sous-total</span><span>${money(w.subtotal||0)}</span></div>
  <div><span>TPS</span><span>${money(w.tpsAmount||0)}</span></div>
  <div><span>TVQ</span><span>${money(w.tvqAmount||0)}</span></div>
  <div class="grand"><span>Total</span><span>${money(w.total||0)}</span></div>
</div>
</body></html>`;

  const win = window.open("", "_blank");
  win.document.open();
  win.document.write(html);
  win.document.close();
};

// ===== Settings =====
$("#saveSettingsBtn").addEventListener("click", async ()=>{
  const tps = Number($("#tpsRate").value || 0.05);
  const tvq = Number($("#tvqRate").value || 0.09975);
  try{
    await setDoc(docSettings(), { tpsRate: tps, tvqRate: tvq, updatedAt: serverTimestamp() }, { merge:true });
    $("#settingsMsg").textContent="Enregistré.";
  }catch(e){
    console.error(e);
    $("#settingsMsg").textContent="Erreur.";
    alert("Erreur settings: "+(e.message||e));
  }
});
