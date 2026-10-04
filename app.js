/* Same Pill, New Look: the page. Depends on i18n.js, core.js and examples.js. */
(function () {
  'use strict';

  const C = window.SPNL;
  const X = window.SPNL_EXAMPLES;
  const I = window.SPNL_I18N;
  const PREVIEW = !!window.SPNL_PREVIEW; // a hosted preview with no network
  const FULL_APP_URL = 'https://perezamadorluisenrique-gif.github.io/same-pill-new-look/';
  const SOURCE_URL = 'https://github.com/perezamadorluisenrique-gif/same-pill-new-look';
  const STORE_KEY = 'spnl.v1';
  const SETTINGS_KEY = 'spnl.settings';
  const $ = (id) => document.getElementById(id);
  const esc = C.esc;

  /* ---------- Storage ---------- */

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  const settings = Object.assign({ lang: I.pickLang(navigator.languages || [navigator.language]), text: 'normal' }, readJson(SETTINGS_KEY) || {});
  let t = I.makeT(settings.lang);

  let real = (() => { const v = readJson(STORE_KEY); return v && Array.isArray(v.meds) ? v : { meds: [] }; })();
  let example = null; // { meds } while example mode is on; never written to storage
  const data = () => example || real;
  function save() { if (!example) writeJson(STORE_KEY, real); }
  function saveSettings() { writeJson(SETTINGS_KEY, settings); }

  function fetchFn() {
    if (example || PREVIEW) return X.exampleFetch;
    return (url, opts) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(timer));
    };
  }

  // Lookups are cached for the session; the same refill is often checked twice.
  const cache = new Map();
  function cached(key, fn) {
    const k = (example || PREVIEW ? 'x:' : '') + key;
    if (!cache.has(k)) cache.set(k, fn().catch((e) => { cache.delete(k); throw e; }));
    return cache.get(k);
  }
  const lookup = (ndc) => cached('ndc:' + ndc, () => C.lookupNdc(ndc, fetchFn()));
  const looksOf = (rxcui) => cached('looks:' + rxcui, () => C.getLooks(rxcui, fetchFn()));
  const recallsOf = (p) => cached('recall:' + p.ndc9 + ':' + p.ndc10, () => C.checkRecalls(p, fetchFn()));
  const search = (q) => cached('search:' + q.toLowerCase(), () => C.searchDrugs(q, fetchFn()));

  function errorText(e) {
    if (e instanceof C.NotFoundError) return t(e.code === 'bad' ? 'ndc.bad' : 'ndc.notFound', e.vars);
    return t(PREVIEW ? 'ndc.previewOnly' : 'ndc.offline');
  }

  const newId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const pill = (p, opts) => C.pillSvg(p, Object.assign({ t }, opts));
  const look = (p) => capFirst(C.describeLook(p, t)) + (p.size ? `, ${esc(p.size)}` : '');
  const ndcText = (p) => C.format11(p.ndc11) || p.ndc10 || p.ndc9;

  /* ---------- Navigation ---------- */

  // Each screen is a function returning HTML; state.view picks one. Screens that
  // need data render a loading state, then fill in.
  const state = { view: 'home', params: {} };
  const scratch = {}; // per-screen working data (search results, pending product…)

  function go(view, params, opts) {
    const o = opts || {};
    state.view = view;
    state.params = params || {};
    const entry = { view, params: state.params };
    try {
      if (o.replace) history.replaceState(entry, '');
      else history.pushState(entry, '');
    } catch (e) { /* history can be blocked in sandboxed frames */ }
    render({ focus: !o.keepFocus });
  }

  window.addEventListener('popstate', (e) => {
    const s = e.state;
    if (s && s.view && VIEWS[s.view]) { state.view = s.view; state.params = s.params || {}; }
    else { state.view = 'home'; state.params = {}; }
    render({ focus: true });
  });

  function back() {
    if (history.state && history.length > 1) history.back();
    else go('home', {}, { replace: true });
  }

  function render(opts) {
    document.documentElement.lang = t.lang;
    document.documentElement.dataset.text = settings.text;
    renderChrome();
    const view = VIEWS[state.view] || VIEWS.home;
    $('app').innerHTML = view.html(state.params);
    if (view.after) view.after(state.params);
    if (opts && opts.focus) {
      window.scrollTo({ top: 0 });
      const h = $('app').querySelector('h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  }

  function renderChrome() {
    $('lang-btn').textContent = t('lang.switch');
    $('lang-btn').lang = t.lang === 'es' ? 'en' : 'es';
    $('menu-btn').textContent = t('nav.more');
    $('brand').setAttribute('aria-label', t('nav.home'));
    document.querySelector('.skip').textContent = t.lang === 'es' ? 'Saltar al contenido' : 'Skip to content';
    $('menu').innerHTML = [
      ['home', t('home.myMeds')], ['chart', t('nav.chart')], ['looksSearch', t('nav.looks')],
      ['pharmacy', t('nav.pharmacy')], ['settings', t('nav.settings')],
    ].map(([v, label]) => `<button type="button" data-go="${v}" ${state.view === v ? 'aria-current="page"' : ''}>${esc(label)}</button>`).join('');
    const banner = $('banner');
    banner.hidden = !(example || PREVIEW);
    if (PREVIEW) {
      banner.innerHTML = `<span><strong>${esc(t('example.on'))}</strong> ${t('example.preview', { link: `<a href="${FULL_APP_URL}" target="_blank" rel="noopener">${esc(t('example.previewLink'))}</a>` })}</span>`;
    } else if (example) {
      banner.innerHTML = `<span><strong>${esc(t('example.on'))}</strong> ${esc(t('example.text'))}</span><button class="link" type="button" data-action="leave-example">${esc(t('example.leave'))}</button>`;
    }
    $('foot').innerHTML = `
      <p><strong>${esc(t('foot.notId'))}</strong>${esc(t('foot.notIdRest'))}</p>
      <p>${esc(t('foot.privacy'))}</p>
      <p class="tiny">${esc(t('foot.credits'))} <a href="${SOURCE_URL}" target="_blank" rel="noopener">${esc(t('foot.source'))}</a></p>`;
    $('scanner-text').textContent = t('scan.point');
    $('scanner-close').textContent = t('scan.cancel');
  }

  function closeMenu() {
    $('menu').hidden = true;
    $('menu-btn').setAttribute('aria-expanded', 'false');
  }

  const backBtn = () => `<button class="back no-print" type="button" data-action="back">${esc(t('back'))}</button>`;

  /* ---------- Screens ---------- */

  const VIEWS = {};

  VIEWS.home = {
    html() {
      const meds = data().meds;
      if (!meds.length) {
        return `<section class="view">
          <div class="intro">
            <p class="eyebrow">${esc(t('home.eyebrow'))}</p>
            <h1>${esc(t('home.title'))}</h1>
            <p class="lede">${esc(t('home.lede'))}</p>
            <div class="row">
              <button class="primary" type="button" data-go="add">${esc(t('home.add'))}</button>
              <button class="secondary" type="button" data-action="start-example">${esc(t('home.example'))}</button>
            </div>
          </div>
          <div class="hero-demo" aria-hidden="true">${heroDemo()}</div>
          <div>
            <h2 class="small-head">${esc(t('home.steps'))}</h2>
            <ol class="steps">
              <li>${esc(t('home.step1'))}</li><li>${esc(t('home.step2'))}</li><li>${esc(t('home.step3'))}</li>
            </ol>
          </div>
          <p class="fact">${esc(t('home.fact'))}<br><span class="tiny"><a href="https://www.ajmc.com/view/preferences-for-and-experiences-with-pill-appearance-changes-national-surveys-of-patients-and" target="_blank" rel="noopener">${esc(t('home.factSources'))}</a></span></p>
        </section>`;
      }
      const people = [...new Set(meds.map((m) => m.who).filter(Boolean))];
      const who = state.params.who && people.includes(state.params.who) ? state.params.who : '';
      const shown = who ? meds.filter((m) => m.who === who) : meds;
      const chips = people.length > 1 ? `<div class="chips" role="group">
          <button type="button" class="chip-btn" data-filter="" aria-pressed="${!who}">${esc(t('home.everyone'))}</button>
          ${people.map((p) => `<button type="button" class="chip-btn" data-filter="${esc(p)}" aria-pressed="${who === p}">${esc(p)}</button>`).join('')}
        </div>` : '';
      return `<section class="view">
        <div class="section-head">
          <h1>${esc(t('home.myMeds'))}</h1>
          <button class="ghost small" type="button" data-go="add">${esc(t('home.addMore'))}</button>
        </div>
        ${chips}
        <ul class="meds">${shown.map(medCard).join('')}</ul>
        <button class="primary wide sticky-cta" type="button" data-go="check">${esc(t('home.check'))}</button>
      </section>`;
    },
  };

  VIEWS.home.after = () => {
    // Flag saved medicines with an ongoing FDA recall.
    for (const m of data().meds) {
      recallsOf(m.product).then((r) => {
        const el = document.querySelector(`[data-recall-badge="${CSS.escape(m.id)}"]`);
        if (el && r.ongoing.length) el.innerHTML = `<span class="badge alert">${esc(t('home.recall'))}</span> `;
      }).catch(() => {});
    }
  };

  function heroDemo() {
    const a = { colors: ['blue'], shape: 'round', imprint: 'M;A9', score: '1', size: '8 mm' };
    const b = { colors: ['white'], shape: 'round', imprint: '238;IG', score: '1', size: '6 mm' };
    return `<div class="demo-pair">${pill(a, { scale: 1 })}<span class="demo-arrow">→</span>${pill(b, { scale: 0.75 })}</div>`;
  }

  function medCard(m) {
    const p = m.product;
    const changed = m.history && m.history.length ? `<span class="badge">${esc(t('home.changed', { n: m.history.length }))}</span>` : '';
    return `<li><button type="button" class="med" data-go="med" data-id="${esc(m.id)}">
      ${pill(p)}
      <span class="med-body">
        ${m.who ? `<span class="med-who">${esc(m.who)}</span>` : ''}
        <span class="med-name">${esc(C.niceName(p))}</span>
        <span class="med-meta">${look(p)}</span>
        <span class="med-meta">${esc(t('home.madeBy', { maker: p.labeler || '—' }))}</span>
        <span class="med-meta"><span data-recall-badge="${esc(m.id)}"></span>${changed}${m.checkedAt ? ` <span class="tiny">${esc(t('home.lastCheck', { date: t.date(m.checkedAt) }))}</span>` : ''}</span>
      </span>
    </button></li>`;
  }

  /* Add a medicine: by name (default) or by NDC. */
  VIEWS.add = {
    html(params) {
      const tab = params.tab || 'name';
      return `<section class="view">
        ${backBtn()}
        <h1>${esc(t('add.title'))}</h1>
        <p class="lede">${esc(t('add.lede'))}</p>
        <div class="tabs" role="tablist">
          <button role="tab" type="button" aria-selected="${tab === 'name'}" data-go="add" data-tab="name" data-replace="1">${esc(t('add.byName'))}</button>
          <button role="tab" type="button" aria-selected="${tab === 'ndc'}" data-go="add" data-tab="ndc" data-replace="1">${esc(t('add.byNdc'))}</button>
        </div>
        ${tab === 'name' ? nameForm('add') : ndcForm('add')}
        <div id="lookup-out"></div>
      </section>`;
    },
    after(params) {
      if ((params.tab || 'name') === 'name' && scratch.search && scratch.search.mode === 'add') showSearchResults();
      if (params.tab === 'ndc' && scratch.pending) showPreview(scratch.pending);
    },
  };

  VIEWS.check = {
    html() {
      return `<section class="view">
        ${backBtn()}
        <h1>${esc(t('check.title'))}</h1>
        <p class="lede">${esc(t('check.lede'))}</p>
        ${ndcForm('check')}
        <div id="lookup-out"></div>
      </section>`;
    },
  };

  /* Browse every look of a medicine without saving anything. */
  VIEWS.looksSearch = {
    html() {
      return `<section class="view">
        ${backBtn()}
        <h1>${esc(t('looks.search'))}</h1>
        <p class="lede">${esc(t('looks.searchLede'))}</p>
        ${nameForm('browse')}
        <div id="lookup-out"></div>
      </section>`;
    },
    after() { if (scratch.search && scratch.search.mode === 'browse') showSearchResults(); },
  };

  function ndcForm(mode) {
    const ex = example || PREVIEW;
    const exNdc = mode === 'add' ? X.EXAMPLE_NDCS.savedFurosemide : X.EXAMPLE_NDCS.refillAmlodipine;
    const canLive = !PREVIEW && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    return `<form class="card form" data-form="ndc" data-mode="${mode}" novalidate>
      <label for="ndc-input">${esc(t('ndc.label'))}</label>
      <input id="ndc-input" name="ndc" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="0378-5209-05" aria-describedby="ndc-help">
      <p class="help" id="ndc-help">${esc(t('ndc.help'))}</p>
      ${PREVIEW ? '' : `<div class="row scan-row">
        ${canLive ? `<button class="secondary" type="button" data-action="scan-live">${esc(t('ndc.scanLive'))}</button>` : ''}
        <label class="secondary file-btn" for="scan-photo">${esc(t('ndc.scanPhoto'))}</label>
        <input id="scan-photo" type="file" accept="image/*" capture="environment" class="visually-hidden">
      </div>`}
      ${mode === 'add' ? whoField() : ''}
      <p class="error" id="form-error" role="alert" hidden></p>
      <button class="primary wide" type="submit">${esc(t(mode === 'add' ? 'ndc.submitAdd' : 'ndc.submitCheck'))}</button>
      ${ex ? `<p class="tiny">${esc(t(mode === 'add' ? 'ndc.example' : 'ndc.exampleRefill'))} <button class="chip" type="button" data-fill="${exNdc}">${exNdc}</button></p>` : ''}
    </form>`;
  }

  function whoField() {
    return `<div class="field">
      <label for="who-input">${esc(t('who.label'))} <span class="muted">${esc(t('who.optional'))}</span></label>
      <input id="who-input" name="who" autocomplete="off" placeholder="${esc(t('who.placeholder'))}" value="${esc(scratch.who || '')}">
    </div>`;
  }

  function nameForm(mode) {
    const q = scratch.search && scratch.search.mode === mode ? scratch.search.q : '';
    return `<form class="card form" data-form="name" data-mode="${mode}" novalidate role="search">
      <label for="name-input">${esc(t('name.label'))}</label>
      <div class="search-row">
        <input id="name-input" name="q" autocomplete="off" spellcheck="false" placeholder="${esc(t('name.placeholder'))}" value="${esc(q)}" aria-describedby="name-help">
        <button class="primary" type="submit">${esc(t('name.submit'))}</button>
      </div>
      <p class="help" id="name-help">${esc(t('name.help'))}</p>
      ${mode === 'add' ? whoField() : ''}
      <p class="error" id="form-error" role="alert" hidden></p>
      ${example || PREVIEW ? `<p class="tiny">${esc(t('ndc.example'))} <button class="chip" type="button" data-fill-name="${X.EXAMPLE_NDCS.searchName}">${X.EXAMPLE_NDCS.searchName}</button></p>` : ''}
    </form>`;
  }

  function showError(msg) {
    const el = $('form-error');
    if (!el) { toast(msg); return; }
    el.textContent = msg;
    el.hidden = !msg;
  }

  async function busy(btn, label, fn) {
    const old = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = label; }
    try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
  }

  async function submitNdc(form) {
    const mode = form.dataset.mode;
    const raw = form.ndc.value.trim();
    if (form.who) scratch.who = form.who.value.trim();
    showError('');
    if (!raw) { showError(t('ndc.empty')); form.ndc.focus(); return; }
    const btn = form.querySelector('[type=submit]');
    try {
      const product = await busy(btn, t('ndc.looking'), () => lookup(raw));
      if (product.alternatives) return chooseAmong(product.alternatives, mode);
      afterNdc(product, mode);
    } catch (e) {
      showError(errorText(e));
    }
  }

  function chooseAmong(list, mode) {
    $('lookup-out').innerHTML = `<div class="stack">
      <h2>${esc(t('choose.title'))}</h2>
      <p class="lede">${esc(t('choose.lede'))}</p>
      <ul class="choices">${list.map((p, i) => `<li><button type="button" class="card product choice" data-choice="${i}">${productCard(p)}</button></li>`).join('')}</ul>
    </div>`;
    scratch.choices = { list, mode };
  }

  function afterNdc(product, mode) {
    if (mode === 'add') { scratch.pending = product; showPreview(product); }
    else checkRefill(product);
  }

  function productCard(p, opts) {
    const o = opts || {};
    return `${pill(p)}
      <span class="product-body">
        <${o.h || 'span'} class="product-name">${esc(C.niceName(p))}</${o.h || 'span'}>
        <span class="kv"><span>${esc(t('result.maker'))}</span><span>${esc(p.labeler || '—')}</span></span>
        <span class="kv"><span>${esc(t('med.looks'))}</span><span>${look(p)}</span></span>
        <span class="kv"><span>${esc(t('med.ndc'))}</span><span class="mono">${esc(ndcText(p))}</span></span>
      </span>`;
  }

  function showPreview(p) {
    const out = $('lookup-out');
    if (!out) return;
    out.innerHTML = `<div class="stack">
      <div class="card product">${productCard(p, { h: 'h2' })}</div>
      <div class="recall-slot" data-recall="pending"></div>
      <div class="row">
        <button class="primary" type="button" data-action="save-pending">${esc(t('save.button'))}</button>
        <button class="ghost" type="button" data-action="discard-pending">${esc(t('save.not'))}</button>
      </div>
    </div>`;
    fillRecall(out.querySelector('[data-recall]'), p);
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function savePending() {
    const p = scratch.pending;
    if (!p) return;
    const whoInput = $('who-input');
    const who = (whoInput ? whoInput.value : scratch.who || '').trim();
    data().meds.push({ id: newId(), who, product: p, history: [], addedAt: new Date().toISOString() });
    save();
    scratch.pending = null;
    scratch.search = null;
    scratch.who = '';
    toast(t('save.done'));
    go('home', {}, { replace: true });
  }

  /* Name search */

  async function submitName(form) {
    const mode = form.dataset.mode;
    const q = form.q.value.trim();
    if (form.who) scratch.who = form.who.value.trim();
    showError('');
    if (q.length < 2) { form.q.focus(); return; }
    const btn = form.querySelector('[type=submit]');
    try {
      const r = await busy(btn, t('name.searching'), () => search(q));
      scratch.search = { mode, q, options: r.options, suggestions: r.suggestions, filter: '' };
      showSearchResults();
    } catch (e) {
      showError(errorText(e));
    }
  }

  function showSearchResults() {
    const s = scratch.search;
    const out = $('lookup-out');
    if (!s || !out) return;
    if (!s.options.length) {
      out.innerHTML = `<div class="card stack">
        <p>${esc(t('name.none', { q: s.q }))}</p>
        ${s.suggestions.length ? `<p>${esc(t('name.didYouMean'))} ${s.suggestions.slice(0, 5).map((x) => `<button class="chip" type="button" data-fill-name="${esc(x)}">${esc(x)}</button>`).join(' ')}${t.lang === 'es' ? '?' : '?'}</p>` : ''}
      </div>`;
      return;
    }
    out.innerHTML = `<div class="stack">
      <h2>${esc(t('name.pickStrength'))}</h2>
      ${s.options.length > 8 ? `<input id="name-filter" class="filter" type="search" placeholder="${esc(t('name.filter'))}" aria-label="${esc(t('name.filter'))}" value="${esc(s.filter)}">` : ''}
      <ul class="options" id="name-options"></ul>
    </div>`;
    fillOptions();
  }

  function fillOptions() {
    const s = scratch.search;
    const list = $('name-options');
    if (!s || !list) return;
    const words = s.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = s.options.filter((o) => words.every((w) => o.name.toLowerCase().includes(w)));
    const LIMIT = 40;
    list.innerHTML = matches.slice(0, LIMIT).map((o) => `<li><button type="button" class="option" data-go="looks" data-rxcui="${esc(o.rxcui)}" data-pick="${s.mode === 'add' ? '1' : ''}">
        <span>${esc(o.name.replace(/\s*\[[^\]]+\]\s*$/, ''))}</span>
        ${o.brand ? `<span class="badge">${esc(t('name.brand'))}: ${esc(o.brand)}</span>` : ''}
      </button></li>`).join('') + (matches.length > LIMIT ? `<li class="tiny">${esc(t('name.more', { n: matches.length - LIMIT }))}</li>` : '');
  }

  /* Every look of a medicine. params: { rxcui, pick, highlight } */
  VIEWS.looks = {
    html(params) {
      return `<section class="view">
        ${backBtn()}
        <div id="looks-body"><p class="loading">${esc(t('looks.loading'))}</p></div>
      </section>`;
    },
    async after(params) {
      const body = $('looks-body');
      try {
        const L = await looksOf(params.rxcui);
        if (!body.isConnected) return;
        scratch.looks = L;
        const pick = !!params.pick;
        const yours = params.highlight || '';
        const head = pick
          ? `<h1>${esc(t('looks.pickTitle'))}</h1><p class="lede">${esc(t('looks.pickLede'))}</p><p class="product-name">${esc(L.name)}</p>`
          : `<h1>${esc(t('looks.title', { name: L.name }))}</h1>`;
        const summary = L.groups.length === 1 ? t('looks.summaryOne', { makers: L.makers }) : t('looks.summary', { looks: L.groups.length, makers: L.makers });
        // Scale every pill by its listed size so the gallery shows real proportions.
        const sizes = L.groups.map((g) => parseFloat(g.product.size) || 0);
        const max = Math.max(...sizes, 1);
        body.innerHTML = `${head}
          <p class="looks-summary"><strong>${esc(summary)}</strong></p>
          <p class="help">${esc(t('looks.caution'))}</p>
          <ul class="looks-grid">${L.groups.map((g, i) => {
            const isYours = yours && g.key === yours;
            const scale = sizes[i] ? 0.55 + 0.45 * (sizes[i] / max) : 0.85;
            const names = g.labelers.slice(0, 3).map((n) => C.shortMaker(n)).join(', ');
            const more = g.labelers.length > 3 ? ' ' + t('looks.andMore', { n: g.labelers.length - 3 }) : '';
            const inner = `${isYours ? `<span class="badge yours">${esc(t('looks.yours'))}</span>` : ''}
              ${g.brand ? `<span class="badge">${esc(t('looks.brand'))}: ${esc(g.brand)}</span>` : ''}
              ${pill(g.product, { scale })}
              <span class="look-desc">${look(g.product)}</span>
              <span class="tiny">${esc(t('looks.makers'))}: ${esc(names)}${esc(more)}</span>`;
            return `<li>${pick
              ? `<button type="button" class="look-card ${isYours ? 'is-yours' : ''}" data-action="pick-look" data-key="${esc(g.key)}">${inner}</button>`
              : `<div class="look-card ${isYours ? 'is-yours' : ''}">${inner}</div>`}</li>`;
          }).join('')}</ul>
          ${L.unlisted ? `<p class="tiny">${esc(t('looks.withLook'))}</p>` : ''}
          <div id="maker-pick"></div>`;
        const h = body.querySelector('h1');
        if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      } catch (e) {
        if (body.isConnected) body.innerHTML = `<p class="error">${esc(errorText(e))}</p>`;
      }
    },
  };

  function pickLook(key) {
    const L = scratch.looks;
    const g = L && L.groups.find((x) => x.key === key);
    if (!g) return;
    if (g.members.length === 1) return useLookProduct(g.members[0]);
    const box = $('maker-pick');
    box.innerHTML = `<div class="card stack">
      <h2>${esc(t('looks.pickMaker'))}</h2>
      <ul class="options">${g.members.map((p, i) => `<li><button type="button" class="option" data-action="pick-maker" data-key="${esc(key)}" data-i="${i}">${esc(p.labeler)}</button></li>`).join('')}</ul>
    </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const first = box.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  async function useLookProduct(p) {
    // Fill in names the same way an NDC lookup does, so later comparisons match.
    let product = Object.assign({}, p);
    try { product = await lookup(p.ndc11); if (product.alternatives) product = product.alternatives[0]; } catch (e) { /* keep what we have */ }
    scratch.pending = product;
    go('add', { tab: 'ndc' }, { replace: true });
  }

  /* Refill check */

  function checkRefill(refill) {
    const meds = data().meds;
    const key = refill.clinicalRxcui || refill.rxcui;
    const matches = meds.filter((m) => (m.product.clinicalRxcui || m.product.rxcui) === key);
    scratch.refill = refill;
    if (matches.length === 1) return go('result', { med: matches[0].id });
    go('result', { pickFrom: matches.length ? 'match' : (meds.length ? 'all' : 'none') });
  }

  VIEWS.result = {
    html(params) {
      const refill = scratch.refill;
      if (!refill) return VIEWS.home.html({});
      const meds = data().meds;
      if (params.med) {
        const med = meds.find((m) => m.id === params.med);
        if (med) return comparisonHtml(med.product, refill, { med });
      }
      if (params.pickFrom === 'none') {
        return `<section class="view">${backBtn()}
          <div class="verdict v-same"><span class="tag">${esc(t('result.notSaved.tag'))}</span><h1>${esc(C.niceName(refill))}</h1><p>${esc(t('result.notSaved.body'))}</p></div>
          <div class="card product">${productCard(refill)}</div>
          <div class="recall-slot" data-recall="refill"></div>
          <div class="actions"><button class="primary" type="button" data-action="save-refill-new">${esc(t('result.saveNew'))}</button></div>
        </section>`;
      }
      const key = refill.clinicalRxcui || refill.rxcui;
      const list = params.pickFrom === 'match' ? meds.filter((m) => (m.product.clinicalRxcui || m.product.rxcui) === key) : meds;
      const noMatch = params.pickFrom !== 'match';
      return `<section class="view">${backBtn()}
        <div class="verdict ${noMatch ? 'v-bad' : 'v-same'}">
          <span class="tag">${esc(t(noMatch ? 'result.noMatch.tag' : 'result.choose.tag'))}</span>
          <h1>${esc(noMatch ? t('result.noMatch.title', { name: C.niceName(refill) }) : t('result.choose.title', { n: list.length, name: C.niceName(refill) }))}</h1>
          ${noMatch ? `<p>${esc(t('result.noMatch.body'))}</p>` : ''}
        </div>
        <div class="card product">${productCard(refill)}</div>
        <div class="actions">
          ${list.map((m) => `<button class="secondary" type="button" data-go="result" data-med="${esc(m.id)}">${esc(t('result.compareWith', { name: C.niceName(m.product) }))}${m.who ? ` (${esc(m.who)})` : ''}</button>`).join('')}
          ${noMatch ? `<button class="primary" type="button" data-action="save-refill-new">${esc(t('result.saveNew'))}</button>` : ''}
        </div>
      </section>`;
    },
    after(params) {
      const slot = document.querySelector('[data-recall="refill"]');
      if (slot && scratch.refill) fillRecall(slot, scratch.refill);
      if (params.med) {
        const med = data().meds.find((m) => m.id === params.med);
        if (med && !example) { med.checkedAt = new Date().toISOString(); save(); }
        else if (med) med.checkedAt = new Date().toISOString();
      }
    },
  };

  /** The side-by-side card for a saved bottle and a refill. Used by refill checks and pharmacy links. */
  function comparisonHtml(saved, refill, opts) {
    const o = opts || {};
    const med = o.med;
    const r = C.compareProducts(saved, refill);
    scratch.compare = { saved, refill, r, who: med ? med.who : '' };
    const name = C.niceName(refill);
    const oldMaker = esc(C.shortMaker(saved.labeler)), newMaker = esc(C.shortMaker(refill.labeler));
    const strong = (s) => `<strong>${esc(s)}</strong>`;
    let head;
    if (r.verdict === 'different-medicine') {
      head = `<div class="verdict v-bad"><span class="tag">${esc(t('result.bad.tag'))}</span>
        <h1>${esc(t('result.bad.title', { who: med && med.who ? t('result.forWho', { who: med.who }) : '' }))}</h1>
        <p>${t('result.bad.body', { saved: strong(C.niceName(saved)), name: strong(name) })}</p></div>`;
    } else if (r.verdict === 'new-look') {
      head = `<div class="verdict v-new-look"><span class="tag">${esc(t('result.newLook.tag'))}</span>
        <h1>${esc(t('result.newLook.title'))}</h1>
        <p>${t('result.newLook.body', { name: strong(name), newMaker: `<strong>${newMaker}</strong>`, oldMaker, what: esc(C.whatChanged(r.changes, t)) })}</p></div>`;
    } else if (r.verdict === 'new-maker-same-look') {
      head = `<div class="verdict v-same"><span class="tag">${esc(t('result.sameLook.tag'))}</span>
        <h1>${esc(t('result.sameLook.title'))}</h1>
        <p>${t('result.sameLook.body', { name: strong(name), newMaker, oldMaker })}${r.missingLook ? ' ' + esc(t('result.missingLook')) : ''}</p></div>`;
    } else {
      head = `<div class="verdict v-same"><span class="tag">${esc(t('result.same.tag'))}</span>
        <h1>${esc(t('result.same.title'))}</h1>
        <p>${t('result.same.body', { maker: oldMaker, name: strong(name) })}</p></div>`;
    }
    const [s1, s2] = C.relativeScales(saved, refill);
    const changed = new Set(r.changes.map((c) => c.field));
    const cell = (field, v) => `<td class="${changed.has(field) ? 'changed' : ''}">${v || '—'}</td>`;
    const colors = (p) => esc(C.colorWords(p.colors, t));
    const imprint = (p) => esc((p.imprint || '').replace(/;/g, ' / '));
    const table = `<div class="card diff-wrap"><table class="diff">
        <thead><tr><th scope="col"><span class="visually-hidden">—</span></th><th scope="col">${esc(t('result.before'))}</th><th scope="col">${esc(t('result.now'))}</th></tr></thead>
        <tbody>
          <tr><th scope="row">${esc(t('result.medicine'))}</th><td>${esc(C.niceName(saved))}</td><td class="${r.verdict === 'different-medicine' ? 'changed' : ''}">${esc(name)}</td></tr>
          <tr><th scope="row">${esc(t('result.maker'))}</th><td>${esc(saved.labeler || '—')}</td><td class="${r.makerChanged ? 'changed' : ''}">${esc(refill.labeler || '—')}</td></tr>
          <tr><th scope="row">${esc(t('result.color'))}</th><td>${colors(saved) || '—'}</td>${cell('color', colors(refill))}</tr>
          <tr><th scope="row">${esc(t('result.shape'))}</th><td>${esc(saved.shape ? t.word(saved.shape) : '—')}</td>${cell('shape', esc(refill.shape ? t.word(refill.shape) : ''))}</tr>
          <tr><th scope="row">${esc(t('result.imprint'))}</th><td>${imprint(saved) || '—'}</td>${cell('imprint', imprint(refill))}</tr>
          <tr><th scope="row">${esc(t('result.size'))}</th><td>${esc(saved.size || '—')}</td>${cell('size', esc(refill.size))}</tr>
        </tbody></table></div>`;
    const compare = `<div class="compare">
        <div class="card side"><span class="label">${esc(t('result.have'))}</span>${pill(saved, { scale: s1 })}<span class="maker">${oldMaker}</span><span class="ndc">${esc(ndcText(saved))}</span></div>
        <div class="card side ${r.verdict === 'same-product' ? '' : 'after'}"><span class="label">${esc(t('result.refill'))}</span>${pill(refill, { scale: s2 })}<span class="maker">${newMaker}</span><span class="ndc">${esc(ndcText(refill))}</span></div>
      </div>`;
    const note = C.pharmacistNote(saved, refill, r, med ? med.who : '', t);
    const changedLook = r.verdict === 'new-look' || r.verdict === 'new-maker-same-look';
    const shared = o.shared;
    const sharedHead = shared ? `<div class="card shared"><p><strong>${esc(t('result.shared'))}</strong></p>${shared.note ? `<p>${esc(t('result.sharedNote'))} “${esc(shared.note)}”</p>` : ''}</div>` : '';
    return `<section class="view">
      ${shared ? '' : backBtn()}
      ${sharedHead}
      ${head}
      <div class="row no-print"><button class="ghost small" type="button" data-action="read-aloud" id="read-btn">${esc(t('result.readAloud'))}</button></div>
      ${compare}
      ${table}
      <div class="recall-slot" data-recall="refill"></div>
      ${shared ? '' : `<div class="card form">
        <h2>${esc(t('result.ask'))}</h2>
        <p class="help">${esc(t('result.askHelp'))}</p>
        <pre class="note-box" id="note-text">${esc(note)}</pre>
        <div class="row">
          <button class="secondary" type="button" data-action="copy-note">${esc(t('result.copy'))}</button>
          ${t.lang !== 'en' ? `<button class="ghost" type="button" data-action="copy-note-en">${esc(t('result.copyEnglish'))}</button>` : ''}
        </div>
      </div>`}
      ${r.verdict === 'new-look' ? `<p class="fact">${esc(t('result.why'))} <a href="https://doi.org/10.7326/M13-2381" target="_blank" rel="noopener">Kesselheim et al., 2014</a></p>` : ''}
      <div class="actions">
        ${changedLook && med ? `<button class="primary" type="button" data-action="accept-refill" data-id="${esc(med.id)}">${esc(t('result.accept'))}</button>` : ''}
        ${shared ? `<button class="primary" type="button" data-action="save-refill-new">${esc(t('result.saveNew'))}</button>` : ''}
        ${refill.clinicalRxcui ? `<button class="ghost" type="button" data-go="looks" data-rxcui="${esc(refill.clinicalRxcui)}" data-highlight="${esc(C.lookKey(refill))}">${esc(t('result.allLooks'))}</button>` : ''}
        ${refill.setId ? `<a class="ghost" href="https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(refill.setId)}" target="_blank" rel="noopener">${esc(t('result.dailymed'))}</a>` : ''}
        <button class="${changedLook && med ? 'ghost' : 'primary'}" type="button" data-go="home">${esc(t('result.done'))}</button>
      </div>
    </section>`;
  }

  function acceptRefill(id) {
    const med = data().meds.find((m) => m.id === id);
    const refill = scratch.refill;
    if (!med || !refill) return;
    med.history = med.history || [];
    med.history.push({ product: med.product, until: new Date().toISOString() });
    med.product = refill;
    save();
    toast(t('result.accepted'));
    go('home', {}, { replace: true });
  }

  function saveRefillNew() {
    const p = scratch.refill;
    if (!p) return;
    data().meds.push({ id: newId(), who: '', product: p, history: [], addedAt: new Date().toISOString() });
    save();
    toast(t('save.done'));
    go('home', {}, { replace: true });
  }

  /* A pharmacy link: ?from=NDC&to=NDC&note=… */
  VIEWS.shared = {
    html() {
      return `<section class="view"><div id="shared-body"><p class="loading">${esc(t('ndc.looking'))}</p></div></section>`;
    },
    async after(params) {
      const body = $('shared-body');
      try {
        const [a, b] = await Promise.all([lookup(params.from), lookup(params.to)]);
        const saved = a.alternatives ? a.alternatives[0] : a;
        const refill = b.alternatives ? b.alternatives[0] : b;
        scratch.refill = refill;
        if (!body.isConnected) return;
        body.outerHTML = comparisonHtml(saved, refill, { shared: { note: params.note } });
        fillRecall(document.querySelector('[data-recall="refill"]'), refill);
        const h = $('app').querySelector('h1');
        if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      } catch (e) {
        if (body.isConnected) body.innerHTML = `<p class="error">${esc(errorText(e))}</p><button class="primary" type="button" data-go="home">${esc(t('result.done'))}</button>`;
      }
    },
  };

  /* Medicine details */
  VIEWS.med = {
    html(params) {
      const med = data().meds.find((m) => m.id === params.id);
      if (!med) return VIEWS.home.html({});
      const p = med.product;
      const hist = (med.history || []).slice().reverse();
      return `<section class="view">
        ${backBtn()}
        ${med.who ? `<span class="med-who">${esc(med.who)}</span>` : ''}
        <h1>${esc(C.niceName(p))}</h1>
        <div class="card product big">${productCard(p)}</div>
        <div class="row">
          ${p.clinicalRxcui ? `<button class="secondary" type="button" data-go="looks" data-rxcui="${esc(p.clinicalRxcui)}" data-highlight="${esc(C.lookKey(p))}">${esc(t('looks.open'))}</button>` : ''}
          ${p.setId ? `<a class="ghost" href="https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(p.setId)}" target="_blank" rel="noopener">${esc(t('result.dailymed'))}</a>` : ''}
        </div>
        <div class="recall-slot" data-recall="med"></div>
        <div class="card">
          <h2>${esc(t('med.history'))}</h2>
          ${hist.length ? `<ol class="timeline">
            <li class="now">${pill(p, { scale: 0.7 })}<div><strong>${esc(t('med.current'))}</strong><br>${look(p)}<br><span class="tiny">${esc(p.labeler)}</span></div></li>
            ${hist.map((h) => `<li>${pill(h.product, { scale: 0.7 })}<div><strong>${esc(t('med.until', { date: t.date(h.until) }))}</strong><br>${look(h.product)}<br><span class="tiny">${esc(h.product.labeler)}</span></div></li>`).join('')}
          </ol>` : `<p class="help">${esc(t('med.historyNone'))}</p>`}
        </div>
        <div id="remove-box"><button class="ghost danger" type="button" data-action="ask-remove" data-id="${esc(med.id)}">${esc(t('med.remove'))}</button></div>
      </section>`;
    },
    after(params) {
      const med = data().meds.find((m) => m.id === params.id);
      if (med) fillRecall(document.querySelector('[data-recall="med"]'), med.product);
    },
  };

  function askRemove(id) {
    const med = data().meds.find((m) => m.id === id);
    if (!med) return;
    $('remove-box').innerHTML = `<div class="card confirm" role="alertdialog" aria-labelledby="rm-q">
      <p id="rm-q"><strong>${esc(t('med.removeConfirm', { name: C.niceName(med.product) }))}</strong></p>
      <div class="row">
        <button class="danger-btn" type="button" data-action="remove" data-id="${esc(id)}">${esc(t('med.removeYes'))}</button>
        <button class="ghost" type="button" data-go="med" data-id="${esc(id)}" data-replace="1">${esc(t('med.cancel'))}</button>
      </div>
    </div>`;
    $('remove-box').querySelector('button').focus();
  }

  function removeMed(id) {
    const meds = data().meds;
    const i = meds.findIndex((m) => m.id === id);
    if (i < 0) return;
    const [gone] = meds.splice(i, 1);
    save();
    toast(t('med.removed', { name: C.niceName(gone.product) }));
    go('home', {}, { replace: true });
  }

  /* Recall card, filled in after the page renders. */
  async function fillRecall(slot, product) {
    if (!slot || !product || !product.ndc9) return;
    slot.innerHTML = `<p class="tiny recall-wait">${esc(t('recall.checking'))}</p>`;
    try {
      const r = await recallsOf(product);
      if (!slot.isConnected) return;
      const item = (x) => {
        const d = C.fdaDate(x.started);
        return `<div class="recall-item">
          <p><strong>${esc(t('recall.class', { cls: x.classification, date: d ? t.date(d) : x.started }))}</strong> · ${esc(x.firm || '')} · ${esc(x.number)}</p>
          <p><span class="muted">${esc(t('recall.reason'))}:</span> ${esc(x.reason)}</p>
          ${x.lots ? `<p><span class="muted">${esc(t('recall.lots'))}:</span> <span class="mono small-mono">${esc(x.lots)}</span></p>` : ''}
        </div>`;
      };
      if (r.ongoing.length) {
        slot.innerHTML = `<div class="card recall bad" role="note">
          <h2>${esc(t('recall.title'))}</h2>
          <p><strong>${esc(t('recall.found'))}</strong></p>
          ${r.ongoing.map(item).join('')}
          <p class="help">${esc(t('recall.lotsHelp'))}</p>
          <p><strong>${esc(t('recall.advice'))}</strong></p>
          ${r.past.length ? `<details><summary>${esc(t('recall.past'))}</summary>${r.past.map(item).join('')}</details>` : ''}
          <p class="tiny">${esc(t('recall.source'))}</p>
        </div>`;
      } else {
        slot.innerHTML = `<div class="recall ok"><p class="tiny"><span aria-hidden="true">✓</span> ${esc(t('recall.none'))}</p>
          ${r.past.length ? `<details><summary class="tiny">${esc(t('recall.past'))}</summary>${r.past.map(item).join('')}</details>` : ''}</div>`;
      }
    } catch (e) {
      if (slot.isConnected) slot.innerHTML = `<p class="tiny">${esc(t('recall.error'))}</p>`;
    }
  }

  /* Pill chart */
  VIEWS.chart = {
    html() {
      const meds = data().meds;
      const canPrint = !PREVIEW && window.self === window.top;
      return `<section class="view">
        ${backBtn()}
        <div class="section-head">
          <h1>${esc(t('chart.title'))}</h1>
          ${canPrint && meds.length ? `<button class="secondary small no-print" type="button" data-action="print">${esc(t('chart.print'))}</button>` : ''}
        </div>
        <p class="lede">${esc(t('chart.lede'))}</p>
        ${meds.length ? `<div class="chart">${meds.map((m) => {
          const p = m.product;
          return `<div class="chart-row">${pill(p)}<div>
            ${m.who ? `<span class="med-who">${esc(m.who)}</span><br>` : ''}
            <strong>${esc(C.niceName(p))}</strong><br>
            ${look(p)}<br>
            <span class="tiny">${esc(t('home.madeBy', { maker: p.labeler || '—' }))} · NDC ${esc(ndcText(p))}</span></div></div>`;
        }).join('')}</div>` : `<p class="card">${esc(t('chart.empty'))}</p>`}
        <p class="tiny">${esc(t('chart.updated', { date: t.date(new Date()) }))}</p>
      </section>`;
    },
  };

  /* For pharmacies: make a link and QR sticker for a patient. */
  VIEWS.pharmacy = {
    html() {
      const f = scratch.pharm || {};
      const ex = example || PREVIEW;
      return `<section class="view">
        ${backBtn()}
        <p class="eyebrow">${esc(t('nav.pharmacy'))}</p>
        <h1>${esc(t('pharm.title'))}</h1>
        <p class="lede">${esc(t('pharm.lede'))}</p>
        <form class="card form" data-form="pharm" novalidate>
          <label for="ph-from">${esc(t('pharm.from'))}</label>
          <input id="ph-from" name="from" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="0378-5209-05" value="${esc(f.from || (ex ? X.EXAMPLE_NDCS.savedAmlodipine : ''))}">
          <label for="ph-to">${esc(t('pharm.to'))}</label>
          <input id="ph-to" name="to" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="31722-238-10" value="${esc(f.to || (ex ? X.EXAMPLE_NDCS.refillAmlodipine : ''))}">
          <label for="ph-note">${esc(t('pharm.note'))}</label>
          <input id="ph-note" name="note" maxlength="280" autocomplete="off" placeholder="${esc(t('pharm.notePlaceholder'))}" value="${esc(f.note || '')}">
          <p class="error" id="form-error" role="alert" hidden></p>
          <button class="primary wide" type="submit">${esc(t('pharm.make'))}</button>
          <p class="tiny">${esc(t('pharm.privacy'))}</p>
        </form>
        <div id="pharm-out"></div>
      </section>`;
    },
    after() { if (scratch.pharmResult) showPharmResult(); },
  };

  async function submitPharm(form) {
    const from = form.from.value.trim(), to = form.to.value.trim(), note = form.note.value.trim();
    scratch.pharm = { from, to, note };
    showError('');
    const btn = form.querySelector('[type=submit]');
    try {
      const [a, b] = await busy(btn, t('ndc.looking'), () => Promise.all([lookup(from), lookup(to)]));
      const saved = a.alternatives ? a.alternatives[0] : a;
      const refill = b.alternatives ? b.alternatives[0] : b;
      const base = PREVIEW ? FULL_APP_URL : location.origin + location.pathname;
      const url = C.shareUrl(base, saved.ndc10 || from, refill.ndc10 || to, note);
      await loadScript('vendor/qrcode-generator-2.0.4.js', 'qrcode').catch(() => null);
      scratch.pharmResult = { saved, refill, url, note, r: C.compareProducts(saved, refill) };
      showPharmResult();
    } catch (e) {
      showError(errorText(e));
    }
  }

  function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return `<svg class="qr" viewBox="0 0 ${n + 8} ${n + 8}" role="img" aria-label="QR code"><rect width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  function stickerHtml(res) {
    const [s1, s2] = C.relativeScales(res.saved, res.refill);
    return `<div class="sticker">
      <div class="sticker-pills">${pill(res.saved, { scale: s1 })}<span>→</span>${pill(res.refill, { scale: s2 })}</div>
      <p class="sticker-title">${esc(C.niceName(res.refill))}</p>
      <p class="sticker-text">${esc(C.shortMaker(res.saved.labeler))} → <strong>${esc(C.shortMaker(res.refill.labeler))}</strong></p>
      ${qrSvg(res.url)}
      <p class="sticker-cta">${esc(t('pharm.sticker'))}</p>
      ${res.note ? `<p class="sticker-note">“${esc(res.note)}”</p>` : ''}
    </div>`;
  }

  function showPharmResult() {
    const res = scratch.pharmResult;
    const out = $('pharm-out');
    if (!res || !out) return;
    const canPrint = !PREVIEW && window.self === window.top;
    out.innerHTML = `<div class="card stack">
      <h2>${esc(t('pharm.ready'))}</h2>
      ${stickerHtml(res)}
      <label for="share-url" class="visually-hidden">Link</label>
      <input id="share-url" class="mono" readonly value="${esc(res.url)}">
      <div class="row">
        <button class="secondary" type="button" data-action="copy-link">${esc(t('pharm.copyLink'))}</button>
        ${canPrint ? `<button class="secondary" type="button" data-action="print-sticker">${esc(t('pharm.printSticker'))}</button>` : ''}
        <a class="ghost" href="${esc(res.url)}" target="_blank" rel="noopener">${esc(t('pharm.open'))}</a>
      </div>
    </div>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* Settings */
  VIEWS.settings = {
    html() {
      const canFiles = !PREVIEW;
      return `<section class="view">
        ${backBtn()}
        <h1>${esc(t('settings.title'))}</h1>
        <div class="card stack">
          <h2>${esc(t('settings.language'))}</h2>
          <div class="seg" role="group" aria-label="${esc(t('settings.language'))}">
            ${I.LANGS.map((l) => `<button type="button" data-action="set-lang" data-lang="${l}" aria-pressed="${t.lang === l}" lang="${l}">${esc(I.STRINGS[l]['lang.name'])}</button>`).join('')}
          </div>
          <h2>${esc(t('settings.text'))}</h2>
          <div class="seg" role="group" aria-label="${esc(t('settings.text'))}">
            <button type="button" data-action="set-text" data-text="normal" aria-pressed="${settings.text !== 'large'}">${esc(t('settings.textNormal'))}</button>
            <button type="button" data-action="set-text" data-text="large" aria-pressed="${settings.text === 'large'}" class="big-a">${esc(t('settings.textLarge'))}</button>
          </div>
        </div>
        ${canFiles ? `<div class="card stack">
          <h2>${esc(t('settings.backup'))}</h2>
          <p class="help">${esc(t('settings.backupHelp'))}</p>
          <div class="row">
            <button class="secondary" type="button" data-action="export">${esc(t('settings.export'))}</button>
            <label class="secondary file-btn" for="import-file">${esc(t('settings.import'))}</label>
            <input id="import-file" type="file" accept="application/json,.json" class="visually-hidden">
          </div>
        </div>` : ''}
        <div id="erase-box"><button class="ghost danger" type="button" data-action="ask-erase">${esc(t('settings.erase'))}</button></div>
      </section>`;
    },
  };

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: 'same-pill-new-look', version: 1, exportedAt: new Date().toISOString(), meds: real.meds }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `same-pill-new-look-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  async function importBackup(file) {
    try {
      const v = JSON.parse(await file.text());
      if (!v || v.app !== 'same-pill-new-look' || !Array.isArray(v.meds)) throw new Error('bad');
      const ok = v.meds.filter((m) => m && m.product && Array.isArray(m.product.colors));
      const have = new Set(real.meds.map((m) => m.id));
      for (const m of ok) if (!have.has(m.id)) real.meds.push(m);
      save();
      toast(t('settings.imported', { n: ok.length }));
      go('home', {}, { replace: true });
    } catch (e) {
      toast(t('settings.importBad'));
    }
  }

  function askErase() {
    $('erase-box').innerHTML = `<div class="card confirm" role="alertdialog" aria-labelledby="er-q">
      <p id="er-q"><strong>${esc(t('settings.eraseConfirm'))}</strong></p>
      <div class="row">
        <button class="danger-btn" type="button" data-action="erase">${esc(t('med.removeYes'))}</button>
        <button class="ghost" type="button" data-go="settings" data-replace="1">${esc(t('med.cancel'))}</button>
      </div></div>`;
    $('erase-box').querySelector('button').focus();
  }

  /* ---------- Read aloud ---------- */

  function readAloud() {
    const synth = window.speechSynthesis;
    const btn = $('read-btn');
    if (!synth) return;
    if (synth.speaking) { synth.cancel(); if (btn) btn.textContent = t('result.readAloud'); return; }
    const v = document.querySelector('.verdict');
    const text = v ? [...v.querySelectorAll('h1, p')].map((el) => el.textContent).join('. ') : '';
    const u = new SpeechSynthesisUtterance(text);
    u.lang = t.lang === 'es' ? 'es-US' : 'en-US';
    u.rate = 0.92;
    u.onend = () => { if (btn && btn.isConnected) btn.textContent = t('result.readAloud'); };
    if (btn) btn.textContent = t('result.stop');
    synth.speak(u);
  }

  /* ---------- Barcode scanning ---------- */

  const loaded = {};
  function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve(window[globalName]);
        s.onerror = () => { delete loaded[src]; reject(new Error('load failed')); };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
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
    if (!C.parseNdcInput(text)) { toast(t('scan.notNdc')); return false; }
    const input = $('ndc-input');
    if (!input) return false;
    input.value = String(text).replace(/\x1d/g, '');
    submitNdc(input.form);
    return true;
  }

  async function scanPhoto(file) {
    if (!file) return;
    toast(t('scan.reading'));
    try {
      const det = await nativeDetector();
      if (det) {
        const bmp = await createImageBitmap(file);
        const codes = await det.detect(bmp);
        const hit = codes.find((c) => C.parseNdcInput(c.rawValue));
        if (hit) { useScan(hit.rawValue); return; }
      }
      const ZX = await loadScript('vendor/zxing-0.21.3.min.js', 'ZXing');
      const url = URL.createObjectURL(file);
      try {
        const hints = new Map([[ZX.DecodeHintType.TRY_HARDER, true]]);
        const res = await new ZX.BrowserMultiFormatReader(hints).decodeFromImageUrl(url);
        useScan(res.getText());
      } finally { URL.revokeObjectURL(url); }
    } catch (e) {
      toast(t('scan.none'));
    }
  }

  let scannerStop = null;
  async function scanLive() {
    const box = $('scanner'), video = $('scanner-video');
    box.hidden = false;
    $('scanner-close').focus();
    let stopped = false;
    try {
      const det = await nativeDetector();
      if (det) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = stream;
        await video.play();
        scannerStop = () => { stopped = true; stream.getTracks().forEach((tr) => tr.stop()); };
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
        const ZX = await loadScript('vendor/zxing-0.21.3.min.js', 'ZXing');
        const reader = new ZX.BrowserMultiFormatReader();
        scannerStop = () => { stopped = true; reader.reset(); };
        reader.decodeFromVideoDevice(undefined, video, (res) => {
          if (stopped || !res) return;
          const text = res.getText();
          if (C.parseNdcInput(text)) { closeScanner(); useScan(text); }
        });
      }
    } catch (e) {
      closeScanner();
      toast(t('scan.noCamera'));
    }
  }

  function closeScanner() {
    if (scannerStop) scannerStop();
    scannerStop = null;
    const v = $('scanner-video');
    if (v.srcObject) { v.srcObject.getTracks().forEach((tr) => tr.stop()); v.srcObject = null; }
    $('scanner').hidden = true;
  }

  /* ---------- Example mode ---------- */

  async function startExample() {
    const f = X.exampleFetch;
    const [amlo, furo, levo] = await Promise.all([
      C.lookupNdc(X.EXAMPLE_NDCS.savedAmlodipine, f),
      C.lookupNdc(X.EXAMPLE_NDCS.savedFurosemide, f),
      C.lookupNdc(X.EXAMPLE_NDCS.savedLevothyroxine, f).catch(() => null),
    ]);
    const now = new Date().toISOString();
    example = { meds: [
      { id: 'ex1', who: t.lang === 'es' ? 'Mamá' : 'Mom', product: amlo, history: [], addedAt: now },
      { id: 'ex2', who: t.lang === 'es' ? 'Mamá' : 'Mom', product: furo, history: [], addedAt: now },
    ] };
    if (levo) example.meds.push({ id: 'ex3', who: t.lang === 'es' ? 'Papá' : 'Dad', product: levo, history: [], addedAt: now });
    go('home', {}, { replace: true });
  }

  /* ---------- Misc ---------- */

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
  }

  async function copyText(text, okMsg, selectEl) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch (e) {
      if (selectEl) {
        if (selectEl.select) selectEl.select();
        else {
          const range = document.createRange();
          range.selectNodeContents(selectEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      toast(t('result.selected'));
    }
  }

  function printWith(html) {
    const sheet = $('print-sheet');
    sheet.innerHTML = html;
    document.body.classList.add('printing-sheet');
    const done = () => { document.body.classList.remove('printing-sheet'); sheet.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 60000);
  }

  function setLang(l) {
    settings.lang = I.LANGS.includes(l) ? l : 'en';
    t = I.makeT(settings.lang);
    saveSettings();
    render({ focus: false });
  }

  /* ---------- Events ---------- */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go], [data-action], [data-fill], [data-fill-name], [data-choice], [data-filter]');
    if (!el) {
      if (!e.target.closest('#menu, #menu-btn')) closeMenu();
      return;
    }
    if (!el.closest('#menu-btn')) closeMenu();
    if (el.dataset.go) {
      const v = el.dataset.go;
      const params = {};
      for (const k of ['id', 'tab', 'rxcui', 'med', 'highlight']) if (el.dataset[k]) params[k] = el.dataset[k];
      if (el.dataset.pick) params.pick = 1;
      if (v === 'add' && !el.dataset.tab && !el.closest('.tabs')) { scratch.pending = null; }
      if (v === 'check') scratch.refill = null;
      go(v, params, { replace: !!el.dataset.replace });
      return;
    }
    if (el.dataset.fill) {
      const input = $('ndc-input');
      if (input) { input.value = el.dataset.fill; submitNdc(input.form); }
      return;
    }
    if (el.dataset.fillName) {
      const input = $('name-input');
      if (input) { input.value = el.dataset.fillName; submitName(input.form); }
      return;
    }
    if (el.dataset.choice !== undefined && scratch.choices) {
      const { list, mode } = scratch.choices;
      afterNdc(list[+el.dataset.choice], mode);
      return;
    }
    if (el.dataset.filter !== undefined) { go('home', { who: el.dataset.filter }, { replace: true, keepFocus: true }); return; }
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'back': back(); break;
      case 'toggle-menu': {
        const m = $('menu');
        m.hidden = !m.hidden;
        $('menu-btn').setAttribute('aria-expanded', String(!m.hidden));
        if (!m.hidden) m.querySelector('button').focus();
        break;
      }
      case 'toggle-lang': setLang(t.lang === 'es' ? 'en' : 'es'); break;
      case 'set-lang': setLang(el.dataset.lang); break;
      case 'set-text': settings.text = el.dataset.text; saveSettings(); render({ focus: false }); break;
      case 'start-example': startExample(); break;
      case 'leave-example': example = null; cache.clear(); go('home', {}, { replace: true }); break;
      case 'save-pending': savePending(); break;
      case 'discard-pending': scratch.pending = null; $('lookup-out').innerHTML = ''; break;
      case 'pick-look': pickLook(el.dataset.key); break;
      case 'pick-maker': {
        const g = scratch.looks.groups.find((x) => x.key === el.dataset.key);
        if (g) useLookProduct(g.members[+el.dataset.i]);
        break;
      }
      case 'accept-refill': acceptRefill(id); break;
      case 'save-refill-new': saveRefillNew(); break;
      case 'copy-note': copyText($('note-text').textContent, t('result.copied'), $('note-text')); break;
      case 'copy-note-en': {
        const c = scratch.compare;
        if (c) copyText(C.pharmacistNote(c.saved, c.refill, c.r, c.who), t('result.copied'));
        break;
      }
      case 'read-aloud': readAloud(); break;
      case 'ask-remove': askRemove(id); break;
      case 'remove': removeMed(id); break;
      case 'print': window.print(); break;
      case 'print-sticker': if (scratch.pharmResult) printWith(stickerHtml(scratch.pharmResult)); break;
      case 'copy-link': copyText(scratch.pharmResult.url, t('pharm.linkCopied'), $('share-url')); break;
      case 'export': exportBackup(); break;
      case 'ask-erase': askErase(); break;
      case 'erase':
        real = { meds: [] };
        save();
        toast(t('settings.erased'));
        go('home', {}, { replace: true });
        break;
      case 'scan-live': scanLive(); break;
      default: break;
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'ndc') submitNdc(form);
    else if (form.dataset.form === 'name') submitName(form);
    else if (form.dataset.form === 'pharm') submitPharm(form);
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'name-filter' && scratch.search) { scratch.search.filter = e.target.value; fillOptions(); }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'scan-photo') { scanPhoto(e.target.files[0]); e.target.value = ''; }
    if (e.target.id === 'import-file' && e.target.files[0]) { importBackup(e.target.files[0]); e.target.value = ''; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('scanner').hidden) closeScanner();
    else if (!$('menu').hidden) { closeMenu(); $('menu-btn').focus(); }
  });
  $('scanner-close').addEventListener('click', closeScanner);

  if ('serviceWorker' in navigator && !PREVIEW && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Start: a pharmacy link opens its comparison; the preview opens in example mode.
  const share = PREVIEW ? null : C.parseShare(location.search);
  if (share) go('shared', share, { replace: true });
  else if (PREVIEW) startExample();
  else go('home', {}, { replace: true });

  // For tests and debugging.
  window.SPNL_APP = { go, state, scratch, setLang };
})();
