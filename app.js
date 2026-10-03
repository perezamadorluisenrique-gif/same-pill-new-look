/* Same Pill, New Look: the page. Depends on core.js (SPNL) and examples.js (SPNL_EXAMPLES). */
(function () {
  'use strict';

  const C = window.SPNL;
  const X = window.SPNL_EXAMPLES;
  const PREVIEW = !!window.SPNL_PREVIEW; // set when embedded as a hosted preview with no network
  const FULL_APP_URL = 'https://perezamadorluisenrique-gif.github.io/same-pill-new-look/';
  const STORE_KEY = 'spnl.v1';
  const $ = (id) => document.getElementById(id);
  const esc = C.esc;

  /* ---------- State ---------- */

  let real = load();
  let example = null;          // { meds } while example mode is on; never written to storage
  let mode = 'add';            // what the lookup form is for: 'add' | 'check'
  let pending = null;          // product waiting to be saved
  let lastView = 'home';
  let scannerStop = null;

  const data = () => (example || real);

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (v && Array.isArray(v.meds)) return v;
    } catch (e) { /* storage blocked: start empty */ }
    return { meds: [] };
  }
  function save() {
    if (example) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(real)); } catch (e) { /* keep working in memory */ }
  }

  function fetchFn() {
    if (example) return X.exampleFetch;
    return (url, opts) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(t));
    };
  }

  /* ---------- Views ---------- */

  const VIEWS = ['home', 'lookup', 'result', 'chart'];
  function show(name) {
    if (name !== 'result' && name !== 'lookup') lastView = name;
    for (const v of VIEWS) $('view-' + v).hidden = v !== name;
    window.scrollTo({ top: 0 });
    if (name === 'home') renderHome();
    if (name === 'chart') renderChart();
  }

  function renderBanner() {
    $('example-banner').hidden = !example;
    if (PREVIEW) {
      $('example-banner-text').innerHTML = `This preview runs on sample records from the NLM database. To look up your own medicines, open <a href="${FULL_APP_URL}" target="_blank" rel="noopener">the full app</a>.`;
      $('leave-example').hidden = true;
    }
  }

  function renderHome() {
    renderBanner();
    const meds = data().meds;
    $('intro').hidden = meds.length > 0;
    $('meds-block').hidden = meds.length === 0;
    $('meds').innerHTML = meds.map((m) => {
      const p = m.product;
      return `<li class="med">
        ${C.pillSvg(p)}
        <div class="med-body">
          ${m.who ? `<span class="med-who">${esc(m.who)}</span>` : ''}
          <span class="med-name">${esc(C.niceName(p))}</span>
          <span class="med-meta">${esc(capFirst(C.describeLook(p)))}</span>
          <span class="med-meta">Made by ${esc(p.labeler || 'unknown')} · <span class="mono">NDC ${esc(C.format11(p.ndc11) || p.ndc10)}</span></span>
          <span class="med-actions">
            <button type="button" data-remove="${m.id}">Remove</button>
            ${m.history && m.history.length ? `<span class="tiny">Changed look ${m.history.length}×</span>` : ''}
          </span>
        </div>
      </li>`;
    }).join('');
  }

  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function productCard(p) {
    return `${C.pillSvg(p)}
      <div style="min-width:0">
        <h2>${esc(C.niceName(p))}</h2>
        <dl>
          <dt>Maker</dt><dd>${esc(p.labeler || 'Not listed')}</dd>
          <dt>Looks like</dt><dd>${esc(capFirst(C.describeLook(p)))}${p.size ? `, ${esc(p.size)}` : ''}</dd>
          <dt>NDC</dt><dd class="mono">${esc(C.format11(p.ndc11) || p.ndc10)}</dd>
        </dl>
      </div>`;
  }

  /* ---------- Lookup form (add or check) ---------- */

  function openLookup(m) {
    mode = m;
    pending = null;
    $('lookup-title').textContent = m === 'add' ? 'Add a medicine' : 'Check a refill';
    $('lookup-lede').textContent = m === 'add'
      ? 'Use the bottle you have now. Type the NDC from the pharmacy label or the maker’s bottle, or scan its barcode.'
      : 'Before you open the new bottle, type the NDC from its label or scan its barcode. We’ll compare it with what you take now.';
    $('who-field').hidden = m !== 'add';
    $('lookup-submit').textContent = m === 'add' ? 'Look it up' : 'Compare with my medicines';
    $('lookup-form').hidden = false;
    $('preview-block').hidden = true;
    $('choose-block').hidden = true;
    $('lookup-error').hidden = true;
    $('ndc-input').value = '';
    $('who-input').value = '';
    const hint = $('example-hint');
    if (example) {
      const ndc = m === 'add' ? X.EXAMPLE_NDCS.savedFurosemide : X.EXAMPLE_NDCS.refillAmlodipine;
      hint.hidden = false;
      hint.querySelector('[data-fill]').textContent = ndc;
      hint.firstChild.textContent = m === 'add' ? 'Example NDC: ' : 'Example refill (amlodipine from a new maker): ';
    } else hint.hidden = true;
    show('lookup');
    renderBanner();
    setTimeout(() => $('ndc-input').focus(), 50);
  }

  async function submitLookup(e) {
    if (e) e.preventDefault();
    const raw = $('ndc-input').value.trim();
    const err = $('lookup-error');
    err.hidden = true;
    if (!raw) { showError('Type the NDC from the label, or scan the barcode.'); return; }
    const btn = $('lookup-submit');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Looking it up…';
    try {
      const product = await C.lookupNdc(raw, fetchFn());
      if (product.alternatives) return chooseAmong(product.alternatives);
      afterLookup(product);
    } catch (ex) {
      if (ex instanceof C.NotFoundError) showError(ex.message);
      else showError(PREVIEW
        ? 'This preview can only look up the example NDCs. Open the full app to look up any medicine.'
        : 'Couldn’t reach the national drug database. Check your internet connection and try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function showError(msg) {
    const err = $('lookup-error');
    err.textContent = msg;
    err.hidden = false;
  }

  function chooseAmong(list) {
    $('choose-block').hidden = false;
    $('choices').innerHTML = list.map((p, i) => `<li><button type="button" data-choice="${i}"><div class="card product">${productCard(p)}</div></button></li>`).join('');
    $('choices').onclick = (ev) => {
      const b = ev.target.closest('[data-choice]');
      if (!b) return;
      $('choose-block').hidden = true;
      afterLookup(list[+b.dataset.choice]);
    };
  }

  function afterLookup(product) {
    if (mode === 'add') {
      pending = product;
      $('preview').innerHTML = productCard(product);
      $('preview-block').hidden = false;
      $('preview-block').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      checkRefill(product);
    }
  }

  function saveMed() {
    if (!pending) return;
    const who = $('who-input').value.trim();
    data().meds.push({ id: 'm' + Date.now().toString(36), who, product: pending, history: [], addedAt: new Date().toISOString() });
    save();
    pending = null;
    toast('Saved to your medicines');
    show('home');
  }

  /* ---------- Refill check ---------- */

  function checkRefill(refill) {
    const meds = data().meds;
    const key = refill.clinicalRxcui || refill.rxcui;
    const matches = meds.filter((m) => (m.product.clinicalRxcui || m.product.rxcui) === key);
    if (matches.length === 1) return showResult(matches[0], refill);
    if (matches.length > 1) return pickSaved(matches, refill, `You have ${matches.length} saved entries for ${C.niceName(refill)}. Which one is this refill for?`, false);
    if (!meds.length) {
      return renderResult(`<div class="verdict v-same"><span class="tag">Not saved yet</span><h2>${esc(C.niceName(refill))}</h2>
        <p>You haven’t saved any medicines yet, so there’s nothing to compare with. Save this bottle now and the next refill will be checked against it.</p></div>
        <div class="card product">${productCard(refill)}</div>
        <div class="actions"><button class="primary" type="button" id="save-refill-new">Save as a new medicine</button></div>`, refill);
    }
    pickSaved(meds, refill, `This bottle is ${C.niceName(refill)}. None of your saved medicines match it.`, true);
  }

  function pickSaved(list, refill, message, noMatch) {
    renderResult(`<div class="verdict ${noMatch ? 'v-bad' : 'v-same'}"><span class="tag">${noMatch ? 'No match' : 'Choose one'}</span>
        <h2>${esc(message)}</h2>
        ${noMatch ? '<p>If you expected one of your usual medicines, don’t take this until you’ve talked to your pharmacist.</p>' : ''}</div>
      <div class="card product">${productCard(refill)}</div>
      <div class="actions">
        ${list.map((m) => `<button class="secondary" type="button" data-compare="${m.id}">Compare with ${esc(C.niceName(m.product))}${m.who ? ` (${esc(m.who)})` : ''}</button>`).join('')}
        ${noMatch ? '<button class="primary" type="button" id="save-refill-new">Save as a new medicine</button>' : ''}
      </div>`, refill);
  }

  let currentRefill = null;
  let currentMed = null;

  function renderResult(html, refill) {
    currentRefill = refill;
    $('result').innerHTML = `<div class="view">${html}</div>`;
    show('result');
  }

  function showResult(med, refill) {
    currentMed = med;
    const saved = med.product;
    const r = C.compareProducts(saved, refill);
    const name = C.niceName(refill);
    const oldMaker = C.shortMaker(saved.labeler), newMaker = C.shortMaker(refill.labeler);
    const forWho = med.who ? ` for ${esc(med.who)}` : '';
    let head;
    if (r.verdict === 'different-medicine') {
      head = `<div class="verdict v-bad"><span class="tag">Doesn’t match</span>
        <h2>This refill doesn’t match the medicine you saved${forWho}.</h2>
        <p>You saved <strong>${esc(C.niceName(saved))}</strong>. This bottle is listed as <strong>${esc(name)}</strong>. Don’t take it until you’ve talked to your pharmacist.</p></div>`;
    } else if (r.verdict === 'new-look') {
      const what = r.changes.map((c) => c.label.toLowerCase()).filter((x) => ['color', 'shape', 'size'].includes(x));
      head = `<div class="verdict v-new-look"><span class="tag">New look</span>
        <h2>This refill will look different. It is listed as the same medicine.</h2>
        <p>Both bottles are listed in the national drug database as <strong>${esc(name)}</strong>. This one is made by <strong>${esc(newMaker)}</strong> instead of ${esc(oldMaker)}, so ${what.length ? `the pill’s ${esc(what.join(' and '))} ${what.length > 1 ? 'are' : 'is'}` : 'the pill looks'} different. Confirm with your pharmacist, then keep taking it as prescribed.</p></div>`;
    } else if (r.verdict === 'new-maker-same-look') {
      head = `<div class="verdict v-same"><span class="tag">New maker</span>
        <h2>New manufacturer, but the pill should look the same.</h2>
        <p>Both bottles are listed as <strong>${esc(name)}</strong>. This one is made by ${esc(newMaker)} instead of ${esc(oldMaker)}. The listed color, shape and imprint match.${r.missingLook ? ' Some appearance details are missing from the record, so compare the pills yourself too.' : ''}</p></div>`;
    } else {
      head = `<div class="verdict v-same"><span class="tag">Same as before</span>
        <h2>Same product as last time.</h2>
        <p>This is the same product from ${esc(oldMaker)}, listed as <strong>${esc(name)}</strong>. The pills should look like the ones you have. If they don’t, ask your pharmacist.</p></div>`;
    }

    const [s1, s2] = C.relativeScales(saved, refill);
    const changed = new Set(r.changes.map((c) => c.field));
    const row = (label, field, a, b) => `<tr><th scope="row">${label}</th><td>${esc(a || '—')}</td><td class="${changed.has(field) ? 'changed' : ''}">${esc(b || '—')}</td></tr>`;
    const compare = `
      <div class="compare">
        <div class="card side"><span class="label">What you have</span>${C.pillSvg(saved, { scale: s1 })}<span class="maker">${esc(oldMaker)}</span><span class="ndc">${esc(C.format11(saved.ndc11))}</span></div>
        <div class="card side ${r.verdict === 'same-product' ? '' : 'after'}"><span class="label">New refill</span>${C.pillSvg(refill, { scale: s2 })}<span class="maker">${esc(newMaker)}</span><span class="ndc">${esc(C.format11(refill.ndc11))}</span></div>
      </div>
      <div class="card diff-wrap"><table class="diff">
        <thead><tr><th scope="col"></th><th scope="col">Before</th><th scope="col">Now</th></tr></thead>
        <tbody>
          ${row('Medicine', 'drug', C.niceName(saved), C.niceName(refill))}
          <tr><th scope="row">Maker</th><td>${esc(saved.labeler || '—')}</td><td class="${r.makerChanged ? 'changed' : ''}">${esc(refill.labeler || '—')}</td></tr>
          ${row('Color', 'color', saved.colors.join(', '), refill.colors.join(', '))}
          ${row('Shape', 'shape', saved.shape, refill.shape)}
          ${row('Imprint', 'imprint', saved.imprint.replace(/;/g, ' / '), refill.imprint.replace(/;/g, ' / '))}
          ${row('Size', 'size', saved.size, refill.size)}
        </tbody>
      </table></div>`;

    const note = C.pharmacistNote(saved, refill, r, med.who);
    const dailymed = refill.setId ? `<a class="ghost" href="https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(refill.setId)}" target="_blank" rel="noopener">See the official label and photos on DailyMed</a>` : '';
    const changedLook = r.verdict === 'new-look' || r.verdict === 'new-maker-same-look';
    const fact = r.verdict === 'new-look'
      ? `<p class="fact">Why this matters: people are more likely to stop a medicine when the pill suddenly looks different. After a heart attack, a shape change raised the odds of stopping by 66% and a color change by 34%. <a href="https://doi.org/10.7326/M13-2381" target="_blank" rel="noopener">Kesselheim et al., 2014</a></p>` : '';

    renderResult(`${head}${compare}
      <div class="card form">
        <h2>Ask your pharmacist</h2>
        <p class="help">Copy this and send it to your pharmacy, or read it out when you call.</p>
        <pre class="note-box" id="note-text">${esc(note)}</pre>
        <button class="secondary" type="button" id="copy-note">Copy message</button>
      </div>
      ${fact}
      <div class="actions">
        ${changedLook ? `<button class="primary" type="button" id="accept-refill">My pharmacist confirmed it. Update my pill chart.</button>` : ''}
        <button class="${changedLook ? 'ghost' : 'primary'}" type="button" data-home>Done</button>
        ${dailymed}
      </div>`, refill);
  }

  function acceptRefill() {
    if (!currentMed || !currentRefill) return;
    currentMed.history = currentMed.history || [];
    currentMed.history.push({ product: currentMed.product, until: new Date().toISOString() });
    currentMed.product = currentRefill;
    save();
    toast('Pill chart updated');
    show('home');
  }

  /* ---------- Pill chart ---------- */

  function renderChart() {
    renderBanner();
    const meds = data().meds;
    $('print-chart').hidden = PREVIEW || window.self !== window.top;
    $('chart').innerHTML = meds.length ? `<div class="chart">${meds.map((m) => {
      const p = m.product;
      return `<div class="chart-row">${C.pillSvg(p)}<div>
        ${m.who ? `<span class="med-who">${esc(m.who)}</span><br>` : ''}
        <strong>${esc(C.niceName(p))}</strong><br>
        ${esc(capFirst(C.describeLook(p)))}${p.size ? `, ${esc(p.size)}` : ''}<br>
        <span class="tiny">Made by ${esc(p.labeler || 'unknown')} · NDC ${esc(C.format11(p.ndc11))}</span></div></div>`;
    }).join('')}</div>` : '<p class="card">No medicines saved yet. Add one and it will show up here.</p>';
    $('chart-date').textContent = `Updated ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
  }

  /* ---------- Barcode scanning ---------- */

  let zxingLoading = null;
  function loadZxing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!zxingLoading) {
      zxingLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/zxing-0.21.3.min.js';
        s.onload = () => resolve(window.ZXing);
        s.onerror = () => reject(new Error('Scanner failed to load'));
        document.head.appendChild(s);
      });
    }
    return zxingLoading;
  }

  async function nativeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const want = ['upc_a', 'ean_13', 'data_matrix', 'code_128', 'upc_e'].filter((f) => supported.includes(f));
      return want.length ? new window.BarcodeDetector({ formats: want }) : null;
    } catch (e) { return null; }
  }

  function useScan(text) {
    const parsed = C.parseNdcInput(text);
    if (!parsed) { toast('That barcode doesn’t contain an NDC. Try the one near the drug name.'); return false; }
    $('ndc-input').value = String(text).replace(/\x1d/g, '');
    submitLookup();
    return true;
  }

  async function scanPhoto(file) {
    if (!file) return;
    toast('Reading the barcode…');
    try {
      const det = await nativeDetector();
      if (det) {
        const bmp = await createImageBitmap(file);
        const codes = await det.detect(bmp);
        const hit = codes.find((c) => C.parseNdcInput(c.rawValue));
        if (hit) return useScan(hit.rawValue);
      }
      const ZX = await loadZxing();
      const url = URL.createObjectURL(file);
      try {
        const hints = new Map([[ZX.DecodeHintType.TRY_HARDER, true]]);
        const res = await new ZX.BrowserMultiFormatReader(hints).decodeFromImageUrl(url);
        useScan(res.getText());
      } finally { URL.revokeObjectURL(url); }
    } catch (e) {
      toast('Couldn’t find a barcode in that photo. Try again closer, or type the NDC.');
    } finally {
      $('scan-photo').value = '';
    }
  }

  async function scanLive() {
    const box = $('scanner'), video = $('scanner-video');
    box.hidden = false;
    let stopped = false;
    try {
      const det = await nativeDetector();
      if (det) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
        await video.play();
        scannerStop = () => { stopped = true; stream.getTracks().forEach((t) => t.stop()); };
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await det.detect(video);
            const hit = codes.find((c) => C.parseNdcInput(c.rawValue));
            if (hit) { closeScanner(); useScan(hit.rawValue); return; }
          } catch (e) { /* frame not ready */ }
          setTimeout(tick, 200);
        };
        tick();
      } else {
        const ZX = await loadZxing();
        const reader = new ZX.BrowserMultiFormatReader();
        scannerStop = () => { stopped = true; reader.reset(); };
        reader.decodeFromVideoDevice(undefined, video, (res) => {
          if (stopped || !res) return;
          if (C.parseNdcInput(res.getText())) { const t = res.getText(); closeScanner(); useScan(t); }
        });
      }
    } catch (e) {
      closeScanner();
      toast('The camera isn’t available. Try “Scan a photo” or type the NDC.');
    }
  }

  function closeScanner() {
    if (scannerStop) scannerStop();
    scannerStop = null;
    const v = $('scanner-video');
    if (v.srcObject) { v.srcObject.getTracks().forEach((t) => t.stop()); v.srcObject = null; }
    $('scanner').hidden = true;
  }

  /* ---------- Example mode ---------- */

  async function startExample() {
    example = { meds: [] };
    const f = X.exampleFetch;
    const amlo = await C.lookupNdc(X.EXAMPLE_NDCS.savedAmlodipine, f);
    const furo = await C.lookupNdc(X.EXAMPLE_NDCS.savedFurosemide, f);
    example.meds.push(
      { id: 'ex1', who: 'Mom', product: amlo, history: [], addedAt: new Date().toISOString() },
      { id: 'ex2', who: 'Mom', product: furo, history: [], addedAt: new Date().toISOString() },
    );
    show('home');
  }

  function leaveExample() {
    example = null;
    show('home');
  }

  /* ---------- Misc ---------- */

  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  async function copyNote() {
    const el = $('note-text');
    try {
      await navigator.clipboard.writeText(el.textContent);
      toast('Message copied');
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast('Message selected. Copy it from your device’s menu.');
    }
  }

  /* ---------- Wiring ---------- */

  $('go-home').onclick = () => show('home');
  $('go-chart').onclick = () => show('chart');
  $('start-add').onclick = () => openLookup('add');
  $('add-more').onclick = () => openLookup('add');
  $('start-check').onclick = () => openLookup('check');
  $('start-example').onclick = startExample;
  $('leave-example').onclick = leaveExample;
  $('lookup-form').addEventListener('submit', submitLookup);
  $('save-med').onclick = saveMed;
  $('discard-med').onclick = () => { pending = null; $('preview-block').hidden = true; $('ndc-input').focus(); };
  $('print-chart').onclick = () => window.print();
  $('scan-photo').onchange = (e) => scanPhoto(e.target.files[0]);
  $('scan-live').onclick = scanLive;
  $('scanner-close').onclick = closeScanner;
  $('scan-live').hidden = PREVIEW || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (PREVIEW) $('scan-photo-label').hidden = true;
  $('example-hint').querySelector('[data-fill]').onclick = (e) => { $('ndc-input').value = e.target.textContent; submitLookup(); };

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { show(lastView); return; }
    if (e.target.closest('[data-home]')) { show('home'); return; }
    if (e.target.closest('#copy-note')) { copyNote(); return; }
    if (e.target.closest('#accept-refill')) { acceptRefill(); return; }
    if (e.target.closest('#save-refill-new')) {
      pending = currentRefill; mode = 'add';
      data().meds.push({ id: 'm' + Date.now().toString(36), who: '', product: pending, history: [], addedAt: new Date().toISOString() });
      save(); pending = null; toast('Saved to your medicines'); show('home');
      return;
    }
    const cmp = e.target.closest('[data-compare]');
    if (cmp) {
      const med = data().meds.find((m) => m.id === cmp.dataset.compare);
      if (med && currentRefill) showResult(med, currentRefill);
      return;
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const meds = data().meds;
      const i = meds.findIndex((m) => m.id === rm.dataset.remove);
      if (i >= 0) {
        const [gone] = meds.splice(i, 1);
        save();
        renderHome();
        toast(`Removed ${C.niceName(gone.product)}`);
      }
    }
  });

  if ('serviceWorker' in navigator && !PREVIEW && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  if (PREVIEW) startExample(); else show('home');
})();
