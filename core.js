/*
 * Same Pill, New Look: core logic.
 * Pure functions for parsing NDCs, reading NLM RxNav records, comparing two
 * products and drawing a pill. No DOM access here, so Node can test it.
 */
(function (root) {
  'use strict';

  const RXNAV = 'https://rxnav.nlm.nih.gov/REST';

  // FDA SPL color and shape codes (NCI Thesaurus) used by RxNav's COLOR and SHAPE properties.
  const COLOR_CODES = {
    C48323: 'black', C48324: 'gray', C48325: 'white', C48326: 'red',
    C48327: 'purple', C48328: 'pink', C48329: 'green', C48330: 'yellow',
    C48331: 'orange', C48332: 'brown', C48333: 'blue', C48334: 'turquoise',
  };
  const SHAPE_CODES = {
    C48335: 'bullet', C48336: 'capsule', C48337: 'clover', C48338: 'diamond',
    C48339: 'double circle', C48340: 'freeform', C48341: 'gear', C48342: 'heptagon',
    C48343: 'hexagon', C48344: 'octagon', C48345: 'oval', C48346: 'pentagon',
    C48347: 'rectangle', C48348: 'round', C48349: 'semi-circle', C48350: 'square',
    C48351: 'tear', C48352: 'trapezoid', C48353: 'triangle',
  };
  const PILL_FILL = {
    black: '#2b2b2e', gray: '#a3a6ab', white: '#f6f4ee', red: '#d2483f',
    purple: '#8a5cb8', pink: '#f1a7bd', green: '#5aa36b', yellow: '#f2cf4a',
    orange: '#ee8a3a', brown: '#8d5f3c', blue: '#4f86d1', turquoise: '#3fb7b0',
  };

  /* ---------- NDC parsing ---------- */

  const digits = (s) => String(s || '').replace(/\D/g, '');

  // Pad a hyphenated 10-digit NDC (4-4-2, 5-3-2 or 5-4-1) to the 11-digit 5-4-2 form.
  function hyphenatedTo11(s) {
    const parts = s.split('-');
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    const [a, b, c] = parts;
    if (a.length > 5 || b.length > 4 || c.length > 2) return null;
    if (a.length + b.length + c.length < 10) return null;
    return a.padStart(5, '0') + b.padStart(4, '0') + c.padStart(2, '0');
  }

  // The three ways an unhyphenated 10-digit NDC can map to 11 digits.
  function tenTo11Candidates(d) {
    return [
      '0' + d,                                   // 4-4-2
      d.slice(0, 5) + '0' + d.slice(5),          // 5-3-2
      d.slice(0, 9) + '0' + d.slice(9),          // 5-4-1
    ];
  }

  /**
   * Turn whatever the user typed or a scanner read into lookup ids for RxNav.
   * Handles hyphenated NDCs, 10/11-digit NDCs, UPC-A and EAN-13 barcodes,
   * GTIN-14 and GS1 DataMatrix strings from pharmacy stock bottles.
   * Returns { ids: string[], note } or null when it cannot be an NDC.
   */
  function parseNdcInput(raw) {
    const s = String(raw || '').trim().replace(/[\s‐-―]+/g, (m) => (/\s/.test(m) ? '' : '-'));
    if (!s) return null;

    // GS1 DataMatrix / GTIN with application identifier 01.
    const gs1 = s.match(/(?:\(01\)|^01|\x1d01)(\d{14})/);
    if (gs1) return fromGtin14(gs1[1]);

    if (/^\d{1,5}-\d{1,4}-\d{1,2}$/.test(s)) {
      const n11 = hyphenatedTo11(s);
      return n11 ? { ids: [n11], note: 'package' } : null;
    }
    if (/^\d{4,5}-\d{3,4}$/.test(s)) return { ids: [s], note: 'product' };

    const d = digits(s);
    if (d.length !== s.replace(/-/g, '').length) return null; // letters mixed in
    if (d.length === 11) return { ids: [d], note: 'package' };
    if (d.length === 10) return { ids: tenTo11Candidates(d), note: 'ambiguous' };
    if (d.length === 12 && d[0] === '3') return { ids: tenTo11Candidates(d.slice(1, 11)), note: 'upc' };
    if (d.length === 13 && d.startsWith('03')) return { ids: tenTo11Candidates(d.slice(2, 12)), note: 'ean' };
    if (d.length === 14) return fromGtin14(d);
    return null;
  }

  function fromGtin14(g) {
    // GTIN-14 for a US drug: indicator digit, "03", the 10-digit NDC, check digit.
    if (g.slice(1, 3) !== '03') return null;
    return { ids: tenTo11Candidates(g.slice(3, 13)), note: 'gtin' };
  }

  function format11(n11) {
    return n11 && n11.length === 11 ? `${n11.slice(0, 5)}-${n11.slice(5, 9)}-${n11.slice(9)}` : n11 || '';
  }

  /* ---------- RxNav records ---------- */

  function propsOf(entry) {
    const out = {};
    const list = (entry && entry.propertyConceptList && entry.propertyConceptList.propertyConcept) || [];
    for (const { propName, propValue } of list) {
      if (!propName) continue;
      (out[propName] = out[propName] || []).push(propValue);
    }
    return out;
  }

  const cap = (s) => String(s || '').replace(/\b[a-z]/g, (c) => c.toUpperCase());

  // Turn one RxNav ndcProperty entry into the product shape the app stores.
  function productFromEntry(entry) {
    const p = propsOf(entry);
    const colorCodes = p.COLOR || [];
    let colors = colorCodes.map((c) => COLOR_CODES[c]).filter(Boolean);
    if (!colors.length && p.COLORTEXT) {
      colors = p.COLORTEXT.map((t) => String(t).toLowerCase().split(/[(;,]/)[0].trim()).filter((c) => PILL_FILL[c]);
    }
    const shapeCode = (p.SHAPE || [])[0];
    const shape = SHAPE_CODES[shapeCode] || ((p.SHAPETEXT || [])[0] || '').toLowerCase() || '';
    return {
      ndc11: entry.ndcItem || '',
      ndc10: entry.ndc10 || '',
      ndc9: entry.ndc9 || '',
      rxcui: entry.rxcui || '',
      setId: entry.splSetIdItem || '',
      packaging: ((entry.packagingList && entry.packagingList.packaging) || [])[0] || '',
      labeler: (p.LABELER || [])[0] || '',
      colors,
      colorText: (p.COLORTEXT || []).join('; '),
      shape,
      shapeText: (p.SHAPETEXT || [])[0] || '',
      imprint: (p.IMPRINT_CODE || [])[0] || '',
      size: (p.SIZE || [])[0] || '',
      score: (p.SCORE || [])[0] || '',
      name: '',
      clinicalRxcui: '',
      clinicalName: '',
    };
  }

  async function getJson(fetchFn, url) {
    const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`The drug database answered ${res.status}.`);
    return res.json();
  }

  class NotFoundError extends Error {}

  /** Look up an NDC (typed or scanned) and return a full product record. */
  async function lookupNdc(raw, fetchFn) {
    const parsed = parseNdcInput(raw);
    if (!parsed) throw new NotFoundError('That doesn’t look like an NDC. It is 10 or 11 digits, often written like 0378-5209-05.');
    // Ask for every reading at once. A bare 10-digit number can match more than
    // one real product, so the caller gets every match to choose from.
    const hits = await Promise.all(parsed.ids.map(async (id) => {
      const data = await getJson(fetchFn, `${RXNAV}/ndcproperties.json?id=${encodeURIComponent(id)}&ndcstatus=ALL`);
      const list = (data && data.ndcPropertyList && data.ndcPropertyList.ndcProperty) || [];
      return list.length ? (list.find((e) => e.ndcItem === id) || list.find((e) => e.splSetIdItem) || list[0]) : null;
    }));
    const entries = hits.filter(Boolean).filter((e, i, all) => all.findIndex((x) => x.ndcItem === e.ndcItem) === i);
    if (!entries.length) throw new NotFoundError(`No product with NDC ${raw} is listed in the NLM drug database. Check the number on the label and try again.`);
    if (entries.length > 1) {
      const alternatives = await Promise.all(entries.map((e) => addNames(productFromEntry(e), fetchFn)));
      return Object.assign({}, alternatives[0], { alternatives });
    }
    const entry = entries[0];
    const product = productFromEntry(entry);
    await addNames(product, fetchFn);
    return product;
  }

  // Fill in the drug name and the "clinical drug" (ingredient + strength + form)
  // so a brand and its generic, or two generics, compare as the same medicine.
  async function addNames(product, fetchFn) {
    if (!product.rxcui) return product;
    try {
      const props = await getJson(fetchFn, `${RXNAV}/rxcui/${product.rxcui}/properties.json`);
      const pr = (props && props.properties) || {};
      product.name = pr.name || '';
      if (pr.tty === 'SCD' || pr.tty === 'GPCK') {
        product.clinicalRxcui = product.rxcui;
        product.clinicalName = pr.name || '';
      } else {
        const rel = await getJson(fetchFn, `${RXNAV}/rxcui/${product.rxcui}/related.json?tty=SCD+GPCK`);
        const groups = (rel && rel.relatedGroup && rel.relatedGroup.conceptGroup) || [];
        const concept = groups.flatMap((g) => g.conceptProperties || [])[0];
        product.clinicalRxcui = concept ? concept.rxcui : product.rxcui;
        product.clinicalName = concept ? concept.name : product.name;
      }
    } catch (e) {
      product.clinicalRxcui = product.clinicalRxcui || product.rxcui;
    }
    return product;
  }

  /* ---------- Comparing two bottles ---------- */

  const normImprint = (s) => String(s || '').toUpperCase().replace(/[\s;,/]+/g, ';').replace(/^;|;$/g, '');
  const mm = (s) => { const m = String(s || '').match(/([\d.]+)\s*mm/i); return m ? parseFloat(m[1]) : null; };
  const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

  /**
   * Compare the saved bottle with the refill.
   * verdict: 'different-medicine' | 'same-product' | 'new-look' | 'new-maker-same-look'
   * changes: the appearance fields that differ, for the side-by-side card.
   */
  function compareProducts(saved, refill) {
    const a = saved, b = refill;
    const keyA = a.clinicalRxcui || a.rxcui, keyB = b.clinicalRxcui || b.rxcui;
    if (keyA && keyB && keyA !== keyB) {
      return { verdict: 'different-medicine', changes: [], makerChanged: a.labeler !== b.labeler, missingLook: false };
    }
    const changes = [];
    if (a.colors.length && b.colors.length && !sameSet(a.colors, b.colors)) {
      changes.push({ field: 'color', label: 'Color', before: a.colors.join(' and '), after: b.colors.join(' and ') });
    }
    if (a.shape && b.shape && a.shape !== b.shape) {
      changes.push({ field: 'shape', label: 'Shape', before: a.shape, after: b.shape });
    }
    if (normImprint(a.imprint) !== normImprint(b.imprint) && (a.imprint || b.imprint)) {
      changes.push({ field: 'imprint', label: 'Imprint', before: a.imprint || 'none', after: b.imprint || 'none' });
    }
    const sa = mm(a.size), sb = mm(b.size);
    if (sa && sb && Math.abs(sa - sb) >= 1) {
      changes.push({ field: 'size', label: 'Size', before: a.size, after: b.size });
    }
    if (a.score && b.score && a.score !== b.score) {
      changes.push({ field: 'score', label: 'Score lines', before: scoreText(a.score), after: scoreText(b.score) });
    }
    const missingLook = !(a.colors.length && b.colors.length && a.shape && b.shape);
    const makerChanged = a.labeler !== b.labeler;
    if (a.ndc9 && a.ndc9 === b.ndc9 && !changes.length) {
      return { verdict: 'same-product', changes, makerChanged: false, missingLook };
    }
    return { verdict: changes.length ? 'new-look' : 'new-maker-same-look', changes, makerChanged, missingLook };
  }

  function scoreText(n) {
    const k = parseInt(n, 10);
    if (!k || k <= 1) return 'no score line';
    return k === 2 ? 'one score line' : `${k - 1} score lines`;
  }

  function describeLook(p) {
    const bits = [];
    if (p.colors.length) bits.push(p.colors.join(' and '));
    if (p.shape) bits.push(p.shape);
    let s = bits.join(', ') || 'appearance not listed';
    if (p.imprint) s += `, marked “${p.imprint.replace(/;/g, ' / ')}”`;
    return s;
  }

  function shortMaker(labeler) {
    return String(labeler || 'another maker')
      .replace(/,?\s*(Inc\.?|LLC|Ltd\.?|Limited|Co\.?|Corporation|Corp\.?|USA|U\.S\.A\.|Pharmaceuticals?|Pharma|Laboratories|Labs?)\b\.?/gi, '')
      .replace(/[\s,()]+$/g, '').replace(/\s{2,}/g, ' ').trim() || labeler;
  }

  function niceName(p) {
    return p.clinicalName || p.name || 'this medicine';
  }

  /** The note a patient or caregiver can send to their pharmacy. */
  function pharmacistNote(saved, refill, result, who) {
    const whom = who ? ` for ${who}` : '';
    const lines = [
      `Hi, I picked up a refill${whom} and want to check it before taking it.`,
      ``,
      `Before: ${niceName(saved)} from ${saved.labeler || 'unknown maker'} (NDC ${format11(saved.ndc11) || saved.ndc10}), ${describeLook(saved)}.`,
      `Now: ${niceName(refill)} from ${refill.labeler || 'unknown maker'} (NDC ${format11(refill.ndc11) || refill.ndc10}), ${describeLook(refill)}.`,
      ``,
    ];
    if (result.verdict === 'different-medicine') {
      lines.push('These do not seem to be the same medicine. Can you check this refill before I take any?');
    } else {
      lines.push('Can you confirm this is the same medicine and dose I was taking before?');
    }
    lines.push('', 'Thank you.');
    return lines.join('\n');
  }

  /* ---------- Pill drawing ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function polygon(n, r, cx, cy, rot) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = rot + (i * 2 * Math.PI) / n;
      pts.push(`${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t)).toFixed(1)}`);
    }
    return pts.join(' ');
  }

  /**
   * A schematic pill drawn from the listed color, shape, imprint and score.
   * scale (0–1) shrinks it so two pills can be shown at their relative sizes.
   */
  function pillSvg(p, opts) {
    const o = opts || {};
    const scale = Math.max(0.45, Math.min(1, o.scale || 1));
    const fills = (p.colors.length ? p.colors : ['white']).map((c) => PILL_FILL[c] || PILL_FILL.white);
    const f1 = fills[0], f2 = fills[1] || fills[0];
    const dark = ['black', 'blue', 'purple', 'brown', 'red', 'green'].includes(p.colors[0]);
    const ink = dark ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.55)';
    const shape = p.shape || 'round';
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    const W = 160, H = 120, cx = 80, cy = 60;
    let body, clip, scoreLine = '';
    const R = 44 * scale;
    switch (shape) {
      case 'capsule': {
        const w = 132 * scale, h = 52 * scale, x = cx - w / 2, y = cy - h / 2;
        clip = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`;
        body = `<g clip-path="url(#${id}c)"><rect x="${x}" y="${y}" width="${w / 2}" height="${h}" fill="${f1}"/><rect x="${cx}" y="${y}" width="${w / 2}" height="${h}" fill="${f2}"/></g>`;
        break;
      }
      case 'oval': case 'bullet': case 'tear': case 'freeform': {
        clip = `<ellipse cx="${cx}" cy="${cy}" rx="${62 * scale}" ry="${36 * scale}"/>`;
        break;
      }
      case 'rectangle': case 'trapezoid': {
        const w = 120 * scale, h = 56 * scale;
        clip = `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${18 * scale}"/>`;
        break;
      }
      case 'square': {
        const w = 82 * scale;
        clip = `<rect x="${cx - w / 2}" y="${cy - w / 2}" width="${w}" height="${w}" rx="${14 * scale}"/>`;
        break;
      }
      case 'triangle': clip = `<polygon points="${polygon(3, R * 1.15, cx, cy + 6 * scale, -Math.PI / 2)}" stroke-linejoin="round"/>`; break;
      case 'diamond': clip = `<polygon points="${polygon(4, R * 1.1, cx, cy, -Math.PI / 2)}"/>`; break;
      case 'pentagon': clip = `<polygon points="${polygon(5, R, cx, cy, -Math.PI / 2)}"/>`; break;
      case 'hexagon': clip = `<polygon points="${polygon(6, R, cx, cy, 0)}"/>`; break;
      case 'heptagon': clip = `<polygon points="${polygon(7, R, cx, cy, -Math.PI / 2)}"/>`; break;
      case 'octagon': clip = `<polygon points="${polygon(8, R, cx, cy, Math.PI / 8)}"/>`; break;
      case 'semi-circle': clip = `<path d="M${cx - R} ${cy + R / 2} A${R} ${R} 0 0 1 ${cx + R} ${cy + R / 2} Z"/>`; break;
      default: clip = `<circle cx="${cx}" cy="${cy}" r="${R}"/>`;
    }
    if (!body) body = `<g clip-path="url(#${id}c)"><rect width="${W}" height="${H}" fill="${f1}"/>${f2 !== f1 ? `<rect x="${cx}" width="${W / 2}" height="${H}" fill="${f2}"/>` : ''}</g>`;
    const k = parseInt(p.score, 10);
    if (k >= 2 && shape !== 'capsule') {
      scoreLine = `<line x1="${cx}" y1="${cy - 30 * scale}" x2="${cx}" y2="${cy + 30 * scale}" stroke="${ink}" stroke-width="2" stroke-linecap="round" opacity=".5"/>`;
    }
    const sides = String(p.imprint || '').split(';').map((x) => x.trim()).filter(Boolean);
    const label = sides.join(' ');
    const fs = Math.max(9, Math.min(17, (label.length > 6 ? 13 : 16) * scale));
    const textX = k >= 2 && shape !== 'capsule' && sides.length > 1 ? null : cx;
    let text = '';
    if (label) {
      if (textX === null) {
        text = `<text x="${cx - 18 * scale}" y="${cy}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-family="Atkinson Hyperlegible Mono, ui-monospace, monospace" font-weight="700">${esc(sides[0])}</text>` +
          `<text x="${cx + 18 * scale}" y="${cy}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-family="Atkinson Hyperlegible Mono, ui-monospace, monospace" font-weight="700">${esc(sides[1])}</text>`;
      } else {
        text = `<text x="${cx}" y="${cy}" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-family="Atkinson Hyperlegible Mono, ui-monospace, monospace" font-weight="700">${esc(label)}</text>`;
      }
    }
    const title = esc(`${describeLook(p)}${p.size ? `, ${p.size}` : ''}`);
    return `<svg class="pill" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}"><title>${title}</title>` +
      `<defs><clipPath id="${id}c">${clip}</clipPath>` +
      `<radialGradient id="${id}s" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient></defs>` +
      `<g transform="translate(0 4)" opacity=".18">${clip.replace('/>', ' fill="#000"/>')}</g>` +
      body +
      `<g clip-path="url(#${id}c)"><rect width="${W}" height="${H}" fill="url(#${id}s)"/></g>` +
      clip.replace('/>', ` fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.5"/>`) +
      scoreLine + text + `</svg>`;
  }

  /** Relative scales for drawing two pills next to each other by their listed size. */
  function relativeScales(a, b) {
    const sa = mm(a.size), sb = mm(b.size);
    if (!sa || !sb) return [1, 1];
    const max = Math.max(sa, sb);
    return [sa / max, sb / max];
  }

  const api = {
    RXNAV, COLOR_CODES, SHAPE_CODES, parseNdcInput, format11, productFromEntry, lookupNdc,
    addNames, compareProducts, describeLook, shortMaker, niceName, pharmacistNote, pillSvg,
    relativeScales, scoreText, NotFoundError, esc,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SPNL = api;
})(typeof self !== 'undefined' ? self : this);
