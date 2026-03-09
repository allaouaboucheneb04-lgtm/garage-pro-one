
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
    import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
    import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
    import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
    import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm';
    import { jsPDF } from 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm';

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
    function getSelectedGarage(){
      return garagesCache.find(g => g.id === selectedGarageIdForQr) || null;
    }
    function buildClientQrMessage(garage){
      const garageName = garage?.name || garage?.garageName || garage?.id || 'ce garage';
      return [
        `Bienvenue chez ${garageName}`,
        '',
        'Nouveau client ?',
        'Scannez ce code QR pour créer votre dossier client et enregistrer votre véhicule.',
        '',
        'Préparez simplement :',
        '- vos coordonnées',
        '- les informations de votre véhicule',
        '',
        'Inscription rapide, simple et sécurisée.'
      ].join('\n');
    }
    function setClientQrMessage(garage){
      const el = $('qrClientMessage');
      if(!el) return;
      el.value = buildClientQrMessage(garage);
    }
    function splitTextToSize(doc, text, maxWidth){
      return doc.splitTextToSize(String(text || '').replace(/\r/g, ''), maxWidth);
    }
    function loadImageAsDataUrl(url){
      return new Promise((resolve, reject) => {
        if(!url){ reject(new Error('missing-image-url')); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch(err){ reject(err); }
        };
        img.onerror = () => reject(new Error('image-load-failed'));
        img.src = url;
      });
    }
    async function downloadGarageQrPdf(){
      if(!selectedGarageIdForQr){ setMsg('error', 'Sélectionne un garage pour télécharger son affiche A4.'); return; }
      const canvas = $('garageQrCanvas');
      if(!canvas){ setMsg('error', 'QR code introuvable.'); return; }
      const garage = getSelectedGarage();
      const garageName = garage?.name || garage?.garageName || selectedGarageIdForQr;
      const registerUrl = getGarageRegisterUrl(selectedGarageIdForQr);
      const message = ($('qrClientMessage')?.value || buildClientQrMessage(garage)).trim();
      try {
        setMsg('hint', "Préparation de l'affiche A4...");
        const docPdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
        const pageW = docPdf.internal.pageSize.getWidth();
        const pageH = docPdf.internal.pageSize.getHeight();
        const margin = 14;
        const contentX = margin;
        const contentY = margin;
        const contentW = pageW - (margin * 2);
        const contentH = pageH - (margin * 2);
        const brand = [15, 23, 42];
        const brandSoft = [245, 247, 250];
        const accent = [212, 175, 55];
        const textMain = [25, 35, 52];
        const textMuted = [97, 108, 125];
        const line = [225, 229, 236];

        docPdf.setFillColor(255,255,255);
        docPdf.rect(0,0,pageW,pageH,'F');
        docPdf.setDrawColor(...line);
        docPdf.setLineWidth(0.6);
        docPdf.roundedRect(contentX, contentY, contentW, contentH, 6, 6, 'S');

        docPdf.setFillColor(...brand);
        docPdf.roundedRect(contentX, contentY, contentW, 42, 6, 6, 'F');
        docPdf.rect(contentX, contentY + 20, contentW, 22, 'F');

        let logoData = null;
        const logoUrl = garage?.logoUrl || garage?.garageLogoUrl || '';
        if(logoUrl){
          try { logoData = await loadImageAsDataUrl(logoUrl); } catch(err){ console.warn('Logo non chargé pour le PDF', err); }
        }

        const logoBoxX = contentX + 10;
        const logoBoxY = contentY + 8;
        const logoBoxSize = 26;
        docPdf.setFillColor(255,255,255);
        docPdf.roundedRect(logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 6, 6, 'F');
        if(logoData){
          docPdf.addImage(logoData, 'PNG', logoBoxX + 2, logoBoxY + 2, logoBoxSize - 4, logoBoxSize - 4);
        } else {
          docPdf.setTextColor(...brand);
          docPdf.setFont('helvetica','bold');
          docPdf.setFontSize(14);
          docPdf.text(String(garageName || 'G').trim().slice(0,2).toUpperCase(), logoBoxX + (logoBoxSize/2), logoBoxY + 16, { align:'center' });
        }

        docPdf.setTextColor(255,255,255);
        docPdf.setFont('helvetica','bold');
        docPdf.setFontSize(20);
        docPdf.text(garageName, logoBoxX + logoBoxSize + 8, contentY + 17);
        docPdf.setFont('helvetica','normal');
        docPdf.setFontSize(10.5);
        docPdf.text('Inscription nouveau client et véhicule', logoBoxX + logoBoxSize + 8, contentY + 25);

        docPdf.setFillColor(...accent);
        docPdf.roundedRect(contentX + 10, contentY + 48, 62, 10, 5, 5, 'F');
        docPdf.setTextColor(...brand);
        docPdf.setFont('helvetica','bold');
        docPdf.setFontSize(10.5);
        docPdf.text('AFFICHE CLIENT À SCANNER', contentX + 41, contentY + 54.5, { align:'center' });

        const leftX = contentX + 10;
        const leftY = contentY + 66;
        const leftW = 103;
        const rightW = 63;
        const rightX = contentX + contentW - rightW - 10;
        const qrFrameY = leftY;

        docPdf.setTextColor(...textMain);
        docPdf.setFont('helvetica','bold');
        docPdf.setFontSize(23);
        docPdf.text('Nouveau client ?', leftX, leftY);
        docPdf.setFontSize(16);
        docPdf.text('Créez votre dossier en quelques secondes', leftX, leftY + 10);

        docPdf.setFont('helvetica','normal');
        docPdf.setFontSize(11.2);
        docPdf.setTextColor(...textMuted);
        const introLines = docPdf.splitTextToSize('Scannez le code QR pour entrer vos informations personnelles et les informations de votre véhicule avant votre visite au garage.', leftW);
        docPdf.text(introLines, leftX, leftY + 20);

        const infoBoxY = leftY + 43;
        docPdf.setFillColor(...brandSoft);
        docPdf.setDrawColor(...line);
        docPdf.roundedRect(leftX, infoBoxY, leftW, 53, 5, 5, 'FD');
        docPdf.setTextColor(...textMain);
        docPdf.setFont('helvetica','bold');
        docPdf.setFontSize(12.5);
        docPdf.text('Informations demandées', leftX + 6, infoBoxY + 10);
        docPdf.setFont('helvetica','normal');
        docPdf.setFontSize(10.5);
        const bullets = [
          'Vos coordonnées client',
          'Les informations de votre véhicule',
          'Une inscription simple et sécurisée'
        ];
        bullets.forEach((item, idx) => {
          const yy = infoBoxY + 20 + (idx * 11);
          docPdf.setFillColor(...accent);
          docPdf.circle(leftX + 6, yy - 1.5, 1.2, 'F');
          docPdf.setTextColor(...textMain);
          docPdf.text(item, leftX + 10, yy);
        });

        const msgBoxY = infoBoxY + 61;
        const msgBoxH = 78;
        docPdf.setFillColor(255,255,255);
        docPdf.setDrawColor(...line);
        docPdf.roundedRect(leftX, msgBoxY, leftW, msgBoxH, 5, 5, 'FD');
        docPdf.setFont('helvetica','bold');
        docPdf.setFontSize(12.5);
        docPdf.setTextColor(...textMain);
        docPdf.text('Message affiché au client', leftX + 6, msgBoxY + 10);
        docPdf.setFont('helvetica','normal');
        docPdf.setFontSize(10.3);
        const messageLines = docPdf.splitTextToSize(String(message || '').replace(/\r/g, ''), leftW - 12);
        docPdf.text(messageLines, leftX + 6, msgBoxY + 18, { baseline:'top' });

        docPdf.setFillColor(...brandSoft);
        docPdf.setDrawColor(...line);
        docPdf.roundedRect(rightX, qrFrameY, rightW, 128, 5, 5, 'FD');
        docPdf.setFont('helvetica','bold');
        docPdf.setFontSize(13);
        docPdf.setTextColor(...textMain);
        docPdf.text('Scannez ici', rightX + (rightW/2), qrFrameY + 12, { align:'center' });
        docPdf.setFont('helvetica','normal');
        docPdf.setFontSize(9.8);
        docPdf.setTextColor(...textMuted);
        const qrSubLines = docPdf.splitTextToSize('Ouvre directement le formulaire de ce garage.', rightW - 10);
        docPdf.text(qrSubLines, rightX + (rightW/2), qrFrameY + 20, { align:'center' });

        const qrCardX = rightX + 7;
        const qrCardY = qrFrameY + 30;
        const qrCardSize = rightW - 14;
        docPdf.setFillColor(255,255,255);
        docPdf.roundedRect(qrCardX, qrCardY, qrCardSize, qrCardSize, 4, 4, 'F');
        docPdf.addImage(canvas.toDataURL('image/png'), 'PNG', qrCardX + 4, qrCardY + 4, qrCardSize - 8, qrCardSize - 8);

        docPdf.setFont('helvetica','bold');
        docPdf.setFontSize(10.5);
        docPdf.setTextColor(...brand);
        docPdf.text('Service rapide au comptoir', rightX + (rightW/2), qrCardY + qrCardSize + 12, { align:'center' });

        const bottomY = contentY + contentH - 34;
        docPdf.setDrawColor(...line);
        docPdf.line(contentX + 10, bottomY, contentX + contentW - 10, bottomY);
        docPdf.setFont('helvetica','bold');
        docPdf.setFontSize(11);
        docPdf.setTextColor(...textMain);
        docPdf.text("Lien direct d'inscription", leftX, bottomY + 9);
        docPdf.setFont('helvetica','normal');
        docPdf.setFontSize(8.8);
        docPdf.setTextColor(...textMuted);
        const urlLines = docPdf.splitTextToSize(registerUrl, contentW - 20);
        docPdf.text(urlLines, leftX, bottomY + 16);

        docPdf.setFontSize(8.5);
        docPdf.text('Affiche générée depuis le Super Admin', contentX + contentW - 10, contentY + contentH - 8, { align:'right' });

        docPdf.save(`${selectedGarageIdForQr}-affiche-client-a4.pdf`);
        setMsg('ok', 'Affiche A4 téléchargée.');
      } catch(e) {
        console.error(e);
        setMsg('error', e?.message || 'Erreur génération affiche A4.');
      }
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
        setClientQrMessage(null);
        setQrGarageLabel('Sélectionne un garage dans la liste.');
        return;
      }
      const garage = garagesCache.find(g => g.id === selectedGarageIdForQr);
      setClientQrMessage(garage);
      const url = getGarageRegisterUrl(selectedGarageIdForQr);
      if(urlBox) urlBox.textContent = url;
      if(nameBox) nameBox.textContent = `QR code — ${garage?.name || garage?.garageName || selectedGarageIdForQr}`;
      setQrGarageLabel(`Garage sélectionné: ${garage?.name || garage?.garageName || selectedGarageIdForQr}`);
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
    $('btnDownloadQrPdf').addEventListener('click', downloadGarageQrPdf);
    $('btnCopyQrLink').addEventListener('click', async () => { try { await copyGarageQrLink(); } catch(e){ console.error(e); setMsg('error', e?.message || 'Erreur copie lien QR.'); } });
    $('btnCopyQrImage').addEventListener('click', async () => { try { await copyGarageQrImage(); } catch(e){ console.error(e); setMsg('error', e?.message || 'Erreur copie image QR.'); } });
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
  