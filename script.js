
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
    import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
    import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
    import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
    import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';

    const app = initializeApp(window.FIREBASE_CONFIG);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);

    let me = null;
    let myStaff = null;
    let garagesCache = [];
    let selectedGarageIdForPages = "";
    let selectedGarageIdForQr = "";

    const $ = (id) => document.getElementById(id);
    const slugify = (s='') => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);

    function setMsg(type, text){ const box = $('createMsg'); if(!box) return; box.className = type; box.textContent = text; }
    function setPageStatus(text){ const el=$('pageStatus'); if(el) el.textContent=text||''; }
    function updateSuperLogoPreview(url){ const img = $('gLogoPreview'); if(img) img.src = String(url || '').trim() || 'assets/logo.png'; }

    const pageKeys = ['dashboard','clients','repairs','notifications','promotions','revenue','fiscal','partsExpenses','suppliers','invoices','settings'];
    const defaultEnabledPages = {
      dashboard:true, clients:true, repairs:true, notifications:true, promotions:true, revenue:true, fiscal:true, partsExpenses:true, suppliers:true, invoices:true, settings:true
    };
    function pageCheckboxId(key){ return `pg_${key}`; }
    function setPagesFormState(enabledPages={}){
      const merged = { ...defaultEnabledPages, ...(enabledPages || {}) };
      pageKeys.forEach((key)=>{ const el = $(pageCheckboxId(key)); if(el) el.checked = merged[key] !== false; });
    }
    function getPagesFormState(){
      const out = {};
      pageKeys.forEach((key)=>{ const el = $(pageCheckboxId(key)); out[key] = !!el?.checked; });
      return out;
    }
    function setPagesGarageLabel(text){ const el = $('pagesGarageLabel'); if(el) el.textContent = text || ''; }
    async function loadGaragePages(garageId){
      selectedGarageIdForPages = garageId || '';
      if(!selectedGarageIdForPages){ setPagesFormState(defaultEnabledPages); setPagesGarageLabel('Sélectionne un garage dans la liste.'); return; }
      setPagesGarageLabel(`Chargement des pages pour ${selectedGarageIdForPages}...`);
      try{
        const snap = await getDoc(doc(db,'garages',selectedGarageIdForPages,'settings','main'));
        const data = snap.exists() ? (snap.data() || {}) : {};
        setPagesFormState(data.enabledPages || defaultEnabledPages);
        const garage = garagesCache.find(g => g.id === selectedGarageIdForPages);
        setPagesGarageLabel(`Pages du garage: ${garage?.name || garage?.garageName || selectedGarageIdForPages}`);
      }catch(e){
        console.error(e);
        setPagesFormState(defaultEnabledPages);
        setPagesGarageLabel('Erreur chargement pages garage.');
      }
    }
    async function saveGaragePages(){
      if(!selectedGarageIdForPages){ setMsg('error', 'Sélectionne un garage dans la liste pour gérer ses pages.'); return; }
      try{
        setMsg('hint', 'Enregistrement des pages...');
        await setDoc(doc(db,'garages',selectedGarageIdForPages,'settings','main'), {
          garageId: selectedGarageIdForPages,
          enabledPages: getPagesFormState(),
          updatedAt: serverTimestamp(),
          updatedBy: me?.uid || ''
        }, { merge:true });
        setMsg('ok', 'Pages du garage mises à jour.');
        setPageStatus('Pages activées mises à jour');
        await loadGarages();
        await loadGaragePages(selectedGarageIdForPages);
      }catch(e){
        console.error(e);
        setMsg('error', e?.message || 'Erreur enregistrement pages.');
      }
    }
    function applyPagePreset(preset){
      const packs = {
        all: { dashboard:true, clients:true, repairs:true, notifications:true, promotions:true, revenue:true, fiscal:true, partsExpenses:true, suppliers:true, invoices:true, settings:true },
        basic: { dashboard:true, clients:true, repairs:true, notifications:false, promotions:false, revenue:false, fiscal:false, partsExpenses:false, suppliers:false, invoices:false, settings:false },
        pro: { dashboard:true, clients:true, repairs:true, notifications:true, promotions:true, revenue:true, fiscal:true, partsExpenses:true, suppliers:true, invoices:true, settings:true }
      };
      setPagesFormState(packs[preset] || defaultEnabledPages);
    }

    function getBaseRegisterUrl(){
      const current = new URL('./register.html', window.location.href);
      if(current.pathname.includes('/repairtest/')){
        current.pathname = current.pathname.replace('/repairtest/register.html', '/register.html');
      }
      return current.toString();
    }
    function getGarageRegisterUrl(garageId){
      const url = new URL(getBaseRegisterUrl());
      url.searchParams.set('garageId', garageId);
      return url.toString();
    }
    function setQrGarageLabel(text){ const el = $('qrGarageLabel'); if(el) el.textContent = text || ''; }
    function getDefaultClientMessage(garageName){
      const safeName = garageName || 'ce garage';
      return `🚗 Nouveau client ?

Scannez ce code QR pour créer votre dossier client chez ${safeName}.

Vous pourrez entrer :
- vos informations personnelles
- les informations de votre véhicule

Rapide, simple et sécuritaire.`;
    }
    function setQrClientMessage(message, garageName){
      const box = $('qrClientMessage');
      if(box) box.value = String(message || '').trim() || getDefaultClientMessage(garageName);
    }
    function getQrClientMessage(){
      const box = $('qrClientMessage');
      return String(box?.value || '').trim();
    }
    async function persistQrClientMessage(garageId, garageName){
      const message = getQrClientMessage() || getDefaultClientMessage(garageName);
      try{
        await setDoc(doc(db,'garages',garageId,'settings','main'), {
          clientRegistrationMessage: message,
          updatedAt: serverTimestamp(),
          updatedBy: me?.uid || ''
        }, { merge:true });
        const idx = garagesCache.findIndex(g => g.id === garageId);
        if(idx >= 0) garagesCache[idx].clientRegistrationMessage = message;
      }catch(err){
        console.warn('Impossible d\'enregistrer le message client', err);
      }
      return message;
    }
    async function imageUrlToDataUrl(url){
      if(!url) return null;
      try{
        const res = await fetch(url, { mode:'cors' });
        if(!res.ok) throw new Error('fetch image failed');
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }catch(err){
        console.warn('Logo non chargé dans le PDF', err);
        return null;
      }
    }
    function splitPdfText(pdf, text, maxWidth){
      const lines = [];
      String(text || '').split(/\n/).forEach((paragraph) => {
        const clean = paragraph.trim();
        if(!clean){ lines.push(''); return; }
        lines.push(...pdf.splitTextToSize(clean, maxWidth));
      });
      return lines;
    }
    async function downloadGaragePosterPdf(){
      if(!selectedGarageIdForQr){ setMsg('error', 'Sélectionne un garage pour générer son affiche PDF.'); return; }
      const canvas = $('garageQrCanvas');
      if(!canvas){ setMsg('error', 'QR code introuvable.'); return; }
      const garage = garagesCache.find(g => g.id === selectedGarageIdForQr) || { id: selectedGarageIdForQr };
      const garageName = garage?.name || garage?.garageName || selectedGarageIdForQr;
      const message = await persistQrClientMessage(selectedGarageIdForQr, garageName);
      const registerUrl = getGarageRegisterUrl(selectedGarageIdForQr);
      const qrDataUrl = canvas.toDataURL('image/png');
      const logoUrl = garage?.logoUrl || garage?.garageLogoUrl || 'assets/logo.png';
      const logoDataUrl = await imageUrlToDataUrl(logoUrl);
      const jsPDFCtor = window.jspdf?.jsPDF;
      if(!jsPDFCtor){ setMsg('error', 'Bibliothèque PDF non chargée.'); return; }

      const pdf = new jsPDFCtor({ orientation:'portrait', unit:'mm', format:'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentW = pageW - margin * 2;

      pdf.setFillColor(248,250,252);
      pdf.rect(0,0,pageW,pageH,'F');
      pdf.setDrawColor(221,227,234);
      pdf.setLineWidth(0.6);
      pdf.roundedRect(margin, margin, contentW, pageH - margin * 2, 6, 6, 'S');

      let y = 24;
      if(logoDataUrl){
        try{ pdf.addImage(logoDataUrl, 'PNG', margin + 8, y - 2, 28, 28); }catch(e){ try{ pdf.addImage(logoDataUrl, 'JPEG', margin + 8, y - 2, 28, 28); }catch(_){} }
      }

      pdf.setTextColor(16,32,51);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.text(garageName, logoDataUrl ? margin + 42 : margin + 8, y + 6);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(93,107,122);
      pdf.text('Affiche d'inscription client - prête à imprimer', logoDataUrl ? margin + 42 : margin + 8, y + 14);

      y += 40;
      pdf.setDrawColor(37,99,235);
      pdf.setFillColor(255,255,255);
      pdf.roundedRect(margin + 8, y, contentW - 16, 24, 5, 5, 'FD');
      pdf.setTextColor(37,99,235);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.text('NOUVEAU CLIENT ?', pageW / 2, y + 15, { align:'center' });

      y += 34;
      pdf.setTextColor(16,32,51);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12.5);
      const messageLines = splitPdfText(pdf, message, contentW - 28);
      const messageLineH = 7;
      const messageBoxH = Math.max(44, (messageLines.length * messageLineH) + 14);
      pdf.setFillColor(255,255,255);
      pdf.setDrawColor(221,227,234);
      pdf.roundedRect(margin + 8, y, contentW - 16, messageBoxH, 5, 5, 'FD');
      pdf.text(messageLines, margin + 16, y + 12);

      y += messageBoxH + 10;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(93,107,122);
      pdf.text('Scannez ici pour ouvrir le formulaire d'inscription', pageW / 2, y, { align:'center' });

      y += 6;
      pdf.setFillColor(255,255,255);
      pdf.setDrawColor(221,227,234);
      pdf.roundedRect((pageW - 86) / 2, y, 86, 86, 6, 6, 'FD');
      pdf.addImage(qrDataUrl, 'PNG', (pageW - 70) / 2, y + 8, 70, 70);

      y += 95;
      pdf.setFillColor(236,253,245);
      pdf.setDrawColor(187,247,208);
      pdf.roundedRect(margin + 8, y, contentW - 16, 22, 5, 5, 'FD');
      pdf.setTextColor(22,101,52);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('Informations à préparer : nom, téléphone, courriel, véhicule, plaque, VIN.', pageW / 2, y + 14, { align:'center', maxWidth: contentW - 28 });

      y += 32;
      pdf.setTextColor(93,107,122);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text('Lien direct d'inscription', pageW / 2, y, { align:'center' });
      y += 6;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const urlLines = pdf.splitTextToSize(registerUrl, contentW - 28);
      pdf.text(urlLines, pageW / 2, y, { align:'center' });

      pdf.save(`${selectedGarageIdForQr}-affiche-inscription-a4.pdf`);
      setMsg('ok', 'Affiche A4 PDF téléchargée.');
    }
    async function renderGarageQr(garageId){
      selectedGarageIdForQr = garageId || '';
      const preview = $('qrPreview');
      const urlBox = $('qrRegisterUrl');
      const nameBox = $('qrGarageName');
      if(!selectedGarageIdForQr){
        if(preview) preview.innerHTML = '<div class="muted">Aucun QR code</div>';
        if(urlBox) urlBox.textContent = '-';
        if(nameBox) nameBox.textContent = 'QR code garage';
        setQrClientMessage('', '');
        setQrGarageLabel('Sélectionne un garage dans la liste.');
        return;
      }
      const garage = garagesCache.find(g => g.id === selectedGarageIdForQr);
      const url = getGarageRegisterUrl(selectedGarageIdForQr);
      if(urlBox) urlBox.textContent = url;
      const garageName = garage?.name || garage?.garageName || selectedGarageIdForQr;
      if(nameBox) nameBox.textContent = `QR code — ${garageName}`;
      setQrGarageLabel(`Garage sélectionné: ${garageName}`);
      setQrClientMessage(garage?.clientRegistrationMessage, garageName);
      if(preview){
        preview.innerHTML = '<canvas id="garageQrCanvas" width="320" height="320"></canvas>';
        const canvas = $('garageQrCanvas');
        await QRCode.toCanvas(canvas, url, { width: 320, margin: 2, errorCorrectionLevel: 'M' });
      }
    }
    async function downloadGarageQr(){
      if(!selectedGarageIdForQr){ setMsg('error', 'Sélectionne un garage pour télécharger son QR code.'); return; }
      const canvas = $('garageQrCanvas');
      if(!canvas){ setMsg('error', 'QR code introuvable.'); return; }
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${selectedGarageIdForQr}-qr-register.png`;
      link.click();
    }
    async function copyGarageQrLink(){
      if(!selectedGarageIdForQr){ setMsg('error', 'Sélectionne un garage pour copier son lien.'); return; }
      const url = getGarageRegisterUrl(selectedGarageIdForQr);
      await navigator.clipboard.writeText(url);
      setMsg('ok', 'Lien du QR code copié.');
    }
    async function copyGarageQrImage(){
      if(!selectedGarageIdForQr){ setMsg('error', 'Sélectionne un garage pour copier son image QR.'); return; }
      const canvas = $('garageQrCanvas');
      if(!canvas || !navigator.clipboard || !window.ClipboardItem){ throw new Error('Copie image non supportée sur cet appareil.'); }
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setMsg('ok', 'Image du QR code copiée.');
    }

    function formData(){
      return {
        garageId: $('editingGarageId').value.trim(),
        name: $('gName').value.trim(),
        slug: slugify($('gSlug').value.trim() || $('gName').value.trim()),
        phone: $('gPhone').value.trim(),
        email: $('gEmail').value.trim(),
        address: $('gAddress').value.trim(),
        logoUrl: $('gLogo').value.trim(),
        tpsNumber: $('gTpsNo').value.trim(),
        tvqNumber: $('gTvqNo').value.trim(),
        tpsRate: Number($('gTps').value || 0),
        tvqRate: Number($('gTvq').value || 0),
        laborRate: Number($('gLabor').value || 0),
        cardFeeRate: Number($('gCardFee').value || 0),
        plan: $('gPlan').value,
        status: $('gStatus').value,
        active: $('gStatus').value !== 'inactive',
        adminName: $('gAdminName').value.trim(),
        adminEmail: $('gAdminEmail').value.trim(),
        notes: $('gNotes').value.trim(),
      };
    }

    function resetForm(){
      $('editingGarageId').value='';
      ['gName','gSlug','gPhone','gEmail','gAddress','gLogo','gTpsNo','gTvqNo','gAdminName','gAdminEmail','gNotes'].forEach(id=>$(id).value='');
      $('gPlan').value='pro'; $('gStatus').value='active'; $('gTps').value='0.05'; $('gTvq').value='0.09975'; $('gLabor').value='80'; $('gCardFee').value='0.025';
      $('formTitle').textContent='Créer un garage';
      $('editBadge').style.display='none';
      $('btnCancelEdit').style.display='none';
      $('btnSave').textContent='Créer le garage';
      $('gSlug').disabled=false;
      updateSuperLogoPreview('');
      setMsg('', '');
    }

    function enterEditMode(g){
      $('editingGarageId').value = g.id || g.slug || '';
      $('gName').value = g.name || g.garageName || '';
      $('gSlug').value = g.id || g.slug || '';
      $('gPhone').value = g.phone || g.garagePhone || '';
      $('gEmail').value = g.email || g.garageEmail || '';
      $('gAddress').value = g.address || g.garageAddress || '';
      $('gLogo').value = g.logoUrl || g.garageLogoUrl || '';
      $('gTpsNo').value = g.tpsNumber || g.garageTpsNo || '';
      $('gTvqNo').value = g.tvqNumber || g.garageTvqNo || '';
      $('gTps').value = g.tpsRate ?? 0.05;
      $('gTvq').value = g.tvqRate ?? 0.09975;
      $('gLabor').value = g.laborRate ?? 80;
      $('gCardFee').value = g.cardFeeRate ?? 0.025;
      $('gPlan').value = g.plan || 'pro';
      $('gStatus').value = g.status || (g.active === false ? 'inactive' : 'active');
      $('gAdminName').value = g.adminName || '';
      $('gAdminEmail').value = g.adminEmail || '';
      $('gNotes').value = g.notes || '';
      $('formTitle').textContent = `Modifier le garage: ${g.name || g.garageName || g.id}`;
      $('editBadge').style.display='inline-flex';
      $('btnCancelEdit').style.display='inline-block';
      $('btnSave').textContent='Enregistrer les modifications';
      $('gSlug').disabled=true;
      updateSuperLogoPreview(g.logoUrl || g.garageLogoUrl || '');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setMsg('hint', 'Mode modification activé.');
    }

    async function uploadSuperLogoFile(){
      if(!me) throw new Error('not-authenticated');
      const file = $('gLogoFile')?.files?.[0];
      if(!file) throw new Error("Choisis une image d'abord.");
      const safeName = String(file.name || 'logo').replace(/[^a-zA-Z0-9._-]+/g,'-');
      const data = formData();
      const slug = data.garageId || data.slug || 'garage';
      const path = `garage-logos/${slug}/${Date.now()}-${safeName}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file, { contentType: file.type || 'application/octet-stream' });
      const url = await getDownloadURL(ref);
      $('gLogo').value = url; updateSuperLogoPreview(url); return url;
    }

    async function loadStaff(uid){
      const snap = await getDoc(doc(db,'staff',uid));
      if(!snap.exists()) throw new Error('Document staff introuvable pour cet utilisateur.');
      return snap.data();
    }

    function renderGarages(garages){
      const list = $('garagesList');
      if(!garages.length){ list.innerHTML = '<div class="muted">Aucun garage trouvé.</div>'; return; }
      garages.sort((a,b)=> String(a.name || a.garageName || a.id).localeCompare(String(b.name || b.garageName || b.id), 'fr'));
      list.innerHTML = garages.map(g => `
        <article class="garage">
          <div class="garage-head">
            <div style="display:flex;gap:12px;align-items:center">
              <img src="${g.logoUrl || g.garageLogoUrl || 'assets/logo.png'}" alt="logo" style="height:56px;width:56px;object-fit:cover;border-radius:14px;border:1px solid var(--line);background:#fff">
              <div>
                <div style="font-weight:900;font-size:18px">${g.name || g.garageName || g.id}</div>
                <div class="small">ID: ${g.id}</div>
              </div>
            </div>
            <span class="badge ${g.active === false || g.status === 'inactive' ? 'off' : ''}">${g.status || (g.active === false ? 'inactive' : 'active')}</span>
          </div>
          <div class="mini">
            <div><b>Plan</b><br>${g.plan || '-'}</div>
            <div><b>Slug</b><br>${g.slug || g.id || '-'}</div>
            <div><b>Email</b><br>${g.email || g.garageEmail || '-'}</div>
            <div><b>Téléphone</b><br>${g.phone || g.garagePhone || '-'}</div>
            <div><b>TPS / TVQ</b><br>${g.tpsNumber || g.garageTpsNo || '-'} / ${g.tvqNumber || g.garageTvqNo || '-'}</div>
            <div><b>Main-d'œuvre</b><br>${g.laborRate ?? '-'} $/h</div>
            <div style="grid-column:1/-1"><b>Adresse</b><br>${g.address || g.garageAddress || '-'}</div>
          </div>
          <div class="garage-meta">${Object.entries({ ...defaultEnabledPages, ...((g.enabledPages)||{}) }).map(([k,v]) => `<span class="chip">${k}: ${v === false ? 'off' : 'on'}</span>`).join('')}</div>
          <div class="list-actions">
            <button class="ghost" data-action="edit" data-id="${g.id}">Modifier</button>
            <button class="ghost" data-action="pages" data-id="${g.id}">Pages</button>
            <button class="ghost" data-action="qr" data-id="${g.id}">QR code</button>
            <button class="ghost" data-action="open" data-id="${g.id}">Ouvrir</button>
            <button class="danger" data-action="delete" data-id="${g.id}">Supprimer</button>
          </div>
        </article>`).join('');

      list.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const action = btn.dataset.action;
          const garage = garagesCache.find(x => x.id === id);
          if(action === 'edit' && garage) return enterEditMode(garage);
          if(action === 'pages') return await loadGaragePages(id);
          if(action === 'qr') return await renderGarageQr(id);
          if(action === 'open') return window.location.href = `./index.html?garageId=${encodeURIComponent(id)}`;
          if(action === 'delete') return await deleteGarage(id);
        });
      });
    }

    async function loadGarages(){
      $('garagesList').innerHTML = '<div class="muted">Chargement des garages...</div>';
      setPageStatus('Chargement de la liste des garages...');
      try {
        const qs = await getDocs(collection(db,'garages'));
        garagesCache = await Promise.all(qs.docs.map(async (d) => {
          const root = d.data() || {};
          let main = {};
          try {
            const mainSnap = await getDoc(doc(db,'garages',d.id,'settings','main'));
            if (mainSnap.exists()) main = mainSnap.data() || {};
          } catch(err) {}
          return { id:d.id, ...root, ...main };
        }));
        renderGarages(garagesCache);
        if(selectedGarageIdForPages){ await loadGaragePages(selectedGarageIdForPages); }
        setPageStatus(`Garages chargés: ${garagesCache.length}`);
      } catch(e) {
        console.error('loadGarages', e);
        $('garagesList').innerHTML = `<div class="error">Impossible de charger les garages.<br>Erreur: ${e?.code || ''} ${e?.message || e}<br><br>Vérifie que les règles Firestore sont publiées et que ton compte a bien <b>role: "superadmin"</b> dans <b>staff/{uid}</b>.</div>`;
        setPageStatus('Erreur chargement garages');
      }
    }

    async function saveGarage(){
      try{
        const data = formData();
        if(!data.name) throw new Error('Nom obligatoire.');
        const garageId = data.garageId || data.slug;
        if(!garageId) throw new Error('Slug / ID garage obligatoire.');
        const isEdit = Boolean(data.garageId);
        setMsg('hint', isEdit ? 'Modification en cours...' : 'Création en cours...');
        setPageStatus(isEdit ? 'Modification du garage...' : 'Création du garage...');

        const garageRef = doc(db,'garages',garageId);
        const exists = await getDoc(garageRef);
        if(!isEdit && exists.exists()) throw new Error('Ce garage existe déjà.');
        if(isEdit && !exists.exists()) throw new Error('Garage introuvable.');

        const payload = {
          name: data.name,
          garageName: data.name,
          slug: garageId,
          phone: data.phone,
          garagePhone: data.phone,
          email: data.email,
          garageEmail: data.email,
          address: data.address,
          garageAddress: data.address,
          logoUrl: data.logoUrl,
          garageLogoUrl: data.logoUrl,
          tpsNumber: data.tpsNumber,
          tvqNumber: data.tvqNumber,
          garageTpsNo: data.tpsNumber,
          garageTvqNo: data.tvqNumber,
          tpsRate: data.tpsRate,
          tvqRate: data.tvqRate,
          laborRate: data.laborRate,
          cardFeeRate: data.cardFeeRate,
          plan: data.plan,
          status: data.status,
          active: data.active,
          adminName: data.adminName,
          adminEmail: data.adminEmail,
          notes: data.notes,
          updatedAt: serverTimestamp(),
          updatedBy: me.uid
        };
        if(!isEdit){ payload.createdAt = serverTimestamp(); payload.createdBy = me.uid; }

        await setDoc(garageRef, payload, { merge:true });
        await setDoc(doc(db,'garages',garageId,'settings','main'), {
          garageName: data.name,
          garageId,
          garageAddress: data.address,
          address: data.address,
          garagePhone: data.phone,
          phone: data.phone,
          garageEmail: data.email,
          email: data.email,
          logoUrl: data.logoUrl,
          garageLogoUrl: data.logoUrl,
          garageTpsNo: data.tpsNumber,
          garageTvqNo: data.tvqNumber,
          tpsNumber: data.tpsNumber,
          tvqNumber: data.tvqNumber,
          tpsRate: data.tpsRate,
          tvqRate: data.tvqRate,
          laborRate: data.laborRate,
          cardFeeRate: data.cardFeeRate,
          plan: data.plan,
          status: data.status,
          active: data.active,
          adminName: data.adminName,
          adminEmail: data.adminEmail,
          notes: data.notes,
          enabledPages: ((garagesCache.find(x => x.id === garageId)?.enabledPages) || defaultEnabledPages),
          updatedAt: serverTimestamp(),
          updatedBy: me.uid
        }, { merge:true });
        await setDoc(doc(db,'garages',garageId,'settings','counters'), {
          garageId,
          invoiceNext: 1,
          updatedAt: serverTimestamp(),
          updatedBy: me.uid
        }, { merge:true });

        setMsg('ok', isEdit ? 'Garage modifié avec succès.' : 'Garage créé avec succès.');
        setPageStatus(isEdit ? 'Garage modifié avec succès' : 'Garage créé avec succès');
        await loadGarages();
        await loadGaragePages(garageId);
        await renderGarageQr(garageId);
        resetForm();
      }catch(e){
        console.error(e);
        setMsg('error', e?.code ? `${e.code} — ${e.message || 'Erreur.'}` : (e.message || 'Erreur.'));
        setPageStatus('Erreur sauvegarde garage');
      }
    }

    async function deleteGarage(garageId){
      if(!confirm(`Supprimer le garage ${garageId} ?

Attention: cela supprime seulement le document principal du garage. Les sous-collections éventuelles devront être supprimées séparément.`)) return;
      try {
        setPageStatus(`Suppression du garage ${garageId}...`);
        await deleteDoc(doc(db,'garages',garageId));
        if($('editingGarageId').value === garageId) resetForm();
        setMsg('ok', `Garage ${garageId} supprimé.`);
        await loadGarages();
        setPageStatus('Garage supprimé');
      } catch(e) {
        console.error(e);
        setMsg('error', e?.message || 'Erreur suppression garage.');
        setPageStatus('Erreur suppression garage');
      }
    }

    $('gLogoFile').addEventListener('change', async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try { updateSuperLogoPreview(URL.createObjectURL(file)); } catch(_) {}
    });
    $('btnUploadLogo').addEventListener('click', async () => {
      try { setMsg('hint', 'Upload du logo en cours...'); await uploadSuperLogoFile(); setMsg('ok', 'Logo uploadé.'); }
      catch(e) { console.error(e); setMsg('error', e.message || 'Erreur upload logo.'); }
    });

    $('btnSave').addEventListener('click', saveGarage);
    $('btnCancelEdit').addEventListener('click', resetForm);
    $('btnReload').addEventListener('click', loadGarages);
    $('btnReloadTop').addEventListener('click', loadGarages);
    $('btnReloadList').addEventListener('click', loadGarages);
    $('gName').addEventListener('input', () => { if(!$('editingGarageId').value && !$('gSlug').value.trim()) $('gSlug').value = slugify($('gName').value); });
    $('gLogo').addEventListener('input', (e) => updateSuperLogoPreview(e.target.value));
    $('btnSavePages').addEventListener('click', saveGaragePages);
    $('btnPagesAll').addEventListener('click', () => applyPagePreset('all'));
    $('btnPagesBasic').addEventListener('click', () => applyPagePreset('basic'));
    $('btnPagesPro').addEventListener('click', () => applyPagePreset('pro'));
    $('btnDownloadQr').addEventListener('click', downloadGarageQr);
    $('btnCopyQrLink').addEventListener('click', async () => { try { await copyGarageQrLink(); } catch(e){ console.error(e); setMsg('error', e?.message || 'Erreur copie lien QR.'); } });
    $('btnCopyQrImage').addEventListener('click', async () => { try { await copyGarageQrImage(); } catch(e){ console.error(e); setMsg('error', e?.message || 'Erreur copie image QR.'); } });
    $('btnDownloadPosterPdf').addEventListener('click', async () => { try { await downloadGaragePosterPdf(); } catch(e){ console.error(e); setMsg('error', e?.message || 'Erreur génération PDF.'); } });
    $('btnLogout').addEventListener('click', async () => {      try { await signOut(auth); window.location.replace('./index.html'); }
      catch(e){ console.error(e); setMsg('error', 'Erreur déconnexion.'); }
    });

    onAuthStateChanged(auth, async (user) => {
      setPageStatus('Vérification de la session...');
      if(!user){ window.location.replace('./index.html'); return; }
      me = user;
      try{
        myStaff = await loadStaff(user.uid);
        $('who').textContent = `${myStaff.displayName || user.email} — rôle: ${myStaff.role || '-'} — garage: ${myStaff.garageId || '-'}`;
        if(myStaff.role !== 'superadmin'){ setPageStatus('Compte non superadmin'); window.location.replace('./index.html'); return; }
        setPageStatus('Session superadmin validée');
        resetForm();
        setPagesFormState(defaultEnabledPages);
        setPagesGarageLabel('Sélectionne un garage dans la liste.');
        await renderGarageQr('');
        await loadGarages();
      }catch(e){
        console.error(e);
        $('garagesList').innerHTML = `<div class="error">${e?.code || ''} ${e.message || 'Erreur chargement staff.'}</div>`;
        setPageStatus('Erreur lecture staff');
      }
    });
  