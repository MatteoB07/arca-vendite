'use strict';
/* L'Arca di Annalisa – Arca Vendite.
   Ogni vendita (Natale, Pasqua, …) è una "campagna" con i suoi prodotti, prezzi, magazzino e righe.
   I dati restano SOLO su questo dispositivo (localStorage): nessun server, nessun dato nel codice. */

const VERSIONE = '2.1';
const CASSA_A = 'Annalisa';           // a chi si consegnano i soldi raccolti (presidente dell'associazione)
const KEY = 'arca-vendite-2027';      // nome storico della memoria: non cambiarlo, altrimenti si perdono i dati
const KEY_UI = 'arca-vendite-2027-ui';

const METODI = { contanti: 'Contanti', bonifico: 'Bonifico', altro: 'Altro' };
const DEF = { v: 2, settings: { pin: null }, campagne: [], attiva: null, lastBackup: null, lastChange: null };

const clone = o => JSON.parse(JSON.stringify(o));
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oggi = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const dm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
const dmy = iso => iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const eur = n => {
  const v = Math.round((n || 0) * 100) / 100, [i, d] = Math.abs(v).toFixed(2).split('.');
  return '€ ' + (v < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d !== '00' ? ',' + d : '');
};
const hideToast = () => $('#toast').classList.remove('show');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const int = v => Math.max(0, parseInt(v, 10) || 0);
const hasNum = v => v !== null && v !== undefined && v !== '';
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- Dati ---------- */
let S = load();
let UIp = {}; try { UIp = JSON.parse(localStorage.getItem(KEY_UI) || '{}') || {}; } catch (e) { UIp = {}; }
const UI = { view: 'home', homeG: 'tutti', q: '', stato: 'tutti', g: 'tutti', venditore: null, locked: !!S.settings.pin };
let F = null;          // riga in modifica
let FC = null;         // campagna in modifica
let PINBUF = '', PINERR = '';
let CX = null;         // campagna usata dai calcoli (null = quella attiva)

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && (Array.isArray(d.campagne) || Array.isArray(d.records))) return fix(d);
  } catch (e) { console.error(e); }
  return clone(DEF);
}
/* Converte il formato della versione 1 (solo calendari e panettoni) in una campagna "Natale 2026" */
function migra(d) {
  const s = d.settings || {}, pr = s.prezzi || {}, st = s.stock || {};
  const pc = hasNum(pr.cal) ? num(pr.cal) : 10, pp = hasNum(pr.pan) ? num(pr.pan) : 20;
  const sk = v => hasNum(v) ? int(v) : null;
  return {
    v: 2, settings: { pin: s.pin || null }, lastBackup: d.lastBackup || null, lastChange: d.lastChange || null, esportato: d.esportato,
    attiva: 'natale-2026',
    campagne: [{
      id: 'natale-2026', nome: 'Natale 2026', stato: 'aperta', creata: '2026-11-12T00:00:00.000Z', chiusa: null,
      prodotti: [
        { id: 'cal', nome: 'Calendario 2027', gruppo: 'Calendari', prezzo: pc, stock: sk(st.cal) },
        { id: 'pl', nome: 'Panettone al latte', gruppo: 'Panettoni', prezzo: pp, stock: sk(st.pl) },
        { id: 'pf', nome: 'Panettone fondente', gruppo: 'Panettoni', prezzo: pp, stock: sk(st.pf) },
        { id: 'pn', nome: 'Panettone (gusto da indicare)', gruppo: 'Panettoni', prezzo: pp, stock: null, gen: true }
      ],
      records: d.records || [], nextN: d.nextN || 1
    }]
  };
}
function fixC(c) {
  c.id = c.id || uid();
  c.nome = String(c.nome || 'Campagna').trim();
  c.stato = c.stato === 'chiusa' ? 'chiusa' : 'aperta';
  c.prodotti = (c.prodotti || []).filter(p => p && p.id && p.nome).map(p => ({
    id: p.id, nome: String(p.nome).trim(), gruppo: String(p.gruppo || '').trim(), prezzo: num(p.prezzo),
    stock: hasNum(p.stock) ? int(p.stock) : null, gen: !!p.gen
  }));
  const ids = new Set(c.prodotti.map(p => p.id));
  c.records = (c.records || []).filter(r => r && ids.has(r.prodotto));
  c.nextN = Math.max(c.nextN || 1, 1, ...c.records.map(r => (r.n || 0) + 1));
  c.versamenti = (Array.isArray(c.versamenti) ? c.versamenti : []).filter(v => v && num(v.importo) > 0)
    .map(v => ({ id: v.id || uid(), data: v.data || '', importo: num(v.importo), note: String(v.note || '') }));
  return c;
}
function fix(d) {
  if (!Array.isArray(d.campagne)) d = migra(d);
  d.v = 2;
  d.settings = { pin: (d.settings && d.settings.pin) || null };
  d.campagne = d.campagne.filter(c => c && Array.isArray(c.records)).map(fixC);
  if (!d.campagne.some(c => c.id === d.attiva)) d.attiva = (d.campagne.find(c => c.stato === 'aperta') || d.campagne[0] || {}).id || null;
  return d;
}
function save() {
  S.lastChange = new Date().toISOString();
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { alert('Attenzione: non riesco a salvare (' + e.message + '). Fai subito un backup.'); }
}
function saveUIp() { try { localStorage.setItem(KEY_UI, JSON.stringify(UIp)); } catch (e) { } }

/* ---------- Campagne e prodotti ---------- */
const C = () => CX || S.campagne.find(c => c.id === S.attiva) || null;
const R = () => C().records;
const chiusa = () => C().stato === 'chiusa';
const inCamp = (c, fn) => { const o = CX; CX = c; try { return fn(); } finally { CX = o; } };
const PERSO = { id: '?', nome: '(prodotto eliminato)', gruppo: '—', prezzo: 0, stock: null };
const prod = id => C().prodotti.find(p => p.id === id) || PERSO;
const grp = p => p.gruppo || p.nome;
const gruppi = () => [...new Set(C().prodotti.map(grp))];
const tutteRighe = () => S.campagne.flatMap(c => c.records);

/* ---------- Calcoli ---------- */
const prezzo = id => num(prod(id).prezzo);
function importo(r) {
  if (r.tipo === 'conto') return (r.venduti || 0) * prezzo(r.prodotto);
  return hasNum(r.importo) ? num(r.importo) : r.qta * prezzo(r.prodotto);
}
const incassato = r => r.tipo === 'conto' ? num(r.versato) : (r.pagato ? importo(r) : 0);
const daIncassare = r => r.tipo === 'conto' ? Math.max(importo(r) - num(r.versato), 0) : (r.pagato ? 0 : importo(r));
const inMano = r => r.tipo === 'conto' ? Math.max(r.qta - (r.venduti || 0) - (r.resi || 0), 0) : 0;
const uscite = r => r.tipo === 'conto' ? r.qta - (r.resi || 0) : r.qta;
const matchG = (r, g) => g === 'tutti' || grp(prod(r.prodotto)) === g;

/* Soldi passati per le tue mani: contanti, "altro" e versamenti dei conti vendita (i bonifici vanno direttamente all'associazione) */
function cassa(c) {
  return inCamp(c || C(), () => {
    const k = { mano: 0, bon: 0, dato: 0 };
    for (const r of C().records) {
      if (r.tipo === 'conto') k.mano += num(r.versato);
      else if (r.pagato) { if (r.metodo === 'bonifico') k.bon += importo(r); else k.mano += importo(r); }
    }
    k.dato = C().versamenti.reduce((a, v) => a + num(v.importo), 0);
    k.resto = Math.round((k.mano - k.dato) * 100) / 100;
    return k;
  });
}

function stats(list) {
  const s = { pren: 0, cons: 0, dacons: 0, inc: 0, dainc: 0, nInc: 0, cvAff: 0, cvVend: 0, cvResi: 0, cvMano: 0 };
  for (const r of list) {
    s.inc += incassato(r);
    const d = daIncassare(r); s.dainc += d; if (d > 0) s.nInc++;
    if (r.tipo === 'conto') { s.cvAff += r.qta; s.cvVend += r.venduti || 0; s.cvResi += r.resi || 0; s.cvMano += inMano(r); }
    else { s.pren += r.qta; if (r.consegnato) s.cons += r.qta; else s.dacons += r.qta; }
  }
  return s;
}

const FILTRI = {
  tutti: ['Tutte', () => true],
  daCons: ['Da consegnare', r => !r.consegnato],
  daInc: ['Da incassare', r => daIncassare(r) > 0],
  daSped: ['Da spedire', r => r.spedizione && !r.consegnato],
  conto: ['Conto vendita', r => r.tipo === 'conto'],
  merc: ['Mercatino', r => r.mercatino],
  gen: ['Prodotto da completare', r => !!prod(r.prodotto).gen]
};

/* I nomi delle persone valgono per tutte le campagne: chi ha venduto a Natale lo ritrovi a Pasqua */
function nomi() {
  const m = new Map();
  for (const r of tutteRighe()) for (const k of ['fornitore', 'venditore', 'acquirente', 'consegnatoA']) {
    const v = (r[k] || '').trim(); if (v && !m.has(v.toLowerCase())) m.set(v.toLowerCase(), v);
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'it'));
}
/* Uniforma un nome: toglie spazi doppi, riusa la grafia già presente, sistema TUTTO MAIUSCOLO */
function normNome(v) {
  v = String(v || '').replace(/\s+/g, ' ').trim();
  if (!v) return '';
  const ex = nomi().find(n => n.toLowerCase() === v.toLowerCase());
  if (ex) return ex;
  if (v === v.toUpperCase() || v === v.toLowerCase())
    v = v.toLowerCase().replace(/(^|[\s'(\-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return v;
}

/* ---------- Render principale ---------- */
const app = $('#app');
const TITOLI = {
  list: 'ELENCO', sellers: 'VENDITORI', more: 'ALTRO', camps: 'CAMPAGNE'
};

function render() {
  if (UI.locked) { renderLock(); return; }
  if (!C()) {
    app.innerHTML = `<header class="top"><h1 class="h">ARCA VENDITE</h1><p>L'Arca di Annalisa</p></header><main>${vWelcome()}</main>`;
    return;
  }
  const c = C();
  const t = UI.view === 'home' ? esc(c.nome).toUpperCase() : TITOLI[UI.view];
  const sub = UI.view === 'camps'
    ? `<p>Ogni vendita (Natale, Pasqua…) ha i suoi conti</p>`
    : `<button class="camp-pill" data-act="view" data-v="camps">${UI.view === 'home' ? 'Cambia campagna' : esc(c.nome)}${c.stato === 'chiusa' ? ' · chiusa' : ''} ▾</button>`;
  const body = { home: vHome, list: vList, sellers: vSellers, more: vMore, camps: vCamps }[UI.view]();
  app.innerHTML = `<header class="top"><h1 class="h">${t}</h1>${sub}</header><main>${body}</main>${tabs()}`;
}

const ICO = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  sellers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.4 3.5 5.2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
};
function tabs() {
  const b = (v, lbl) => `<button class="${UI.view === v ? 'on' : ''}" data-act="view" data-v="${v}" aria-label="${lbl}">${ICO[v]}<span>${lbl}</span></button>`;
  return `<nav class="tabs">${b('home', 'Riepilogo')}${b('list', 'Elenco')}
    <button data-act="new" aria-label="Nuova riga"><span class="plus">${ICO.plus}</span><span>Nuova</span></button>
    ${b('sellers', 'Venditori')}${b('more', 'Altro')}</nav>`;
}
const seg = (key, opts, cur, act = 'seg') => opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="${act}" data-k="${key}" data-v="${esc(v)}">${esc(l)}</button>`).join('');

/* ---------- Primo avvio ---------- */
function vWelcome() {
  return `<div class="card"><div class="ct h">BENVENUTA!</div>
      <p class="muted">Se hai ricevuto un file di backup (per esempio con i dati della vendita di Natale), importalo. Altrimenti crea la prima campagna di vendita.</p>
      <label class="btn primary block" for="imp">Importa backup</label>
      <input id="imp" type="file" accept=".json,application/json" hidden>
      <button class="btn block" data-act="cNew">Crea una campagna</button></div>`;
}

/* ---------- Riepilogo ---------- */
function bannerChiusa() {
  if (!chiusa()) return '';
  return `<div class="banner closed"><span>Campagna chiusa${C().chiusa ? ' il ' + dmy(C().chiusa) : ''}: solo consultazione.</span><button class="btn small" data-act="cToggle" data-id="${C().id}">Riapri</button></div>`;
}
function vHome() {
  const c = C();
  if (!c.records.length) return `${bannerChiusa()}
    <div class="card"><div class="ct h">TUTTO PRONTO</div>
      <p class="muted">In «${esc(c.nome)}» non c'è ancora nessuna riga. Tocca <b>+ Nuova</b> per segnare la prima vendita.</p>
      <p class="muted">Prodotti: ${c.prodotti.filter(p => !p.gen).map(p => `${esc(p.nome)} (${eur(p.prezzo)})`).join(', ')}.</p>
      <button class="btn block" data-act="cEdit" data-id="${c.id}">Modifica prodotti e prezzi</button>
    </div>${magazzino()}`;
  const gs = gruppi();
  if (UI.homeG !== 'tutti' && !gs.includes(UI.homeG)) UI.homeG = 'tutti';
  const g = UI.homeG;
  const all = c.records.filter(r => matchG(r, g));
  const s = stats(all);
  const pc = s.pren ? Math.round(s.cons / s.pren * 100) : 0;
  const totE = s.inc + s.dainc, pe = totE ? Math.round(s.inc / totE * 100) : 0;
  const tile = (lbl, n, hint, stato, alert) =>
    `<button class="tile ${alert ? 'alert' : ''}" data-act="go" data-stato="${stato}" data-g="${esc(g)}"><span class="lbl">${lbl}</span><span class="num">${n}</span><span class="hint">${hint}</span></button>`;
  return `${bannerChiusa()}${backupBanner()}
    ${gs.length > 1 ? `<div class="seg">${seg('homeG', [['tutti', 'Tutto'], ...gs.map(x => [x, x])], g)}</div>` : ''}
    <div class="card hero">
      <div class="lbl">Incassato</div>
      <div class="big h">${eur(s.inc)}</div>
      <div class="bar"><i style="width:${pe}%"></i></div>
      <div class="sub">${s.dainc ? `<b>${eur(s.dainc)}</b> ancora da incassare` : 'Tutto incassato'}</div>
    </div>
    <div class="tiles">
      ${tile('Prenotati', s.pren, 'pezzi venduti', 'tutti')}
      ${tile('Consegnati', s.cons, `${pc}% dei prenotati`, 'tutti')}
      ${tile('Da consegnare', s.dacons, 'pezzi', 'daCons', s.dacons > 0)}
      ${tile('Da incassare', eur(s.dainc), `${s.nInc} ${s.nInc === 1 ? 'riga' : 'righe'}`, 'daInc', s.dainc > 0)}
    </div>
    ${g === 'tutti' ? cassaCard() : ''}
    ${magazzino()}
    ${contoCard(all)}`;
}

function cassaCard() {
  const c = C(), k = cassa();
  if (!k.mano && !k.dato && !k.bon) return '';
  const L = [...c.versamenti].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const rows = L.map(v => `<button class="rowbtn" data-act="vEdit" data-id="${v.id}"><span>Dati il ${v.data ? dmy(v.data) : '(senza data)'}${v.note ? `<br><span class="muted">${esc(v.note)}</span>` : ''}</span><span class="r"><b>${eur(v.importo)}</b></span></button>`).join('');
  return `<div class="card"><div class="ct h">SOLDI AD ${CASSA_A.toUpperCase()} <small>bonifici esclusi</small></div>
    <div class="cassa">
      <div><span>Raccolti da te</span><b>${eur(k.mano)}</b></div>
      <div><span>Già consegnati</span><b>${eur(k.dato)}</b></div>
      <div class="${k.resto > 0 ? 'todo' : 'ok'}"><span>${k.resto < 0 ? 'Consegnati in più' : 'Da consegnare'}</span><b>${eur(Math.abs(k.resto))}</b></div>
    </div>
    <p class="muted">Raccolti da te = pagamenti in contanti o «altro» + soldi versati dai conti vendita.${k.bon ? ` I bonifici all'associazione (${eur(k.bon)}) non passano da te.` : ''}</p>
    ${rows}
    <button class="btn primary block" data-act="vNew">+ Segna soldi dati ad ${CASSA_A}</button></div>`;
}

function usciteBy(id) { return R().filter(r => r.prodotto === id).reduce((a, r) => a + uscite(r), 0); }
function magRow(nome, usciti, stock, small) {
  const has = hasNum(stock);
  const st = num(stock), res = st - usciti;
  const pc = has && st > 0 ? Math.min(100, Math.round(usciti / st * 100)) : 0;
  return `<div class="mag ${small ? 'small' : ''}"><div class="mag-l"><span>${nome}</span><span>${has ? `<b>${res}</b> rimasti su ${st}` : `<b>${usciti}</b> usciti`}</span></div>
    ${has ? `<div class="bar"><i style="width:${pc}%"></i></div>` : (small ? '' : '<small>Quantità iniziale non indicata (si imposta in Modifica prodotti)</small>')}</div>`;
}
function magazzino() {
  const c = C(), g = UI.homeG; let h = '';
  for (const gr of gruppi()) {
    if (g !== 'tutti' && g !== gr) continue;
    const ps = c.prodotti.filter(p => grp(p) === gr), veri = ps.filter(p => !p.gen);
    if (ps.length === 1) h += magRow(esc(ps[0].nome), usciteBy(ps[0].id), ps[0].stock);
    else {
      const tot = ps.reduce((a, p) => a + usciteBy(p.id), 0);
      const hasTot = veri.some(p => hasNum(p.stock));
      h += magRow(esc(gr) + ' (tutti)', tot, hasTot ? veri.reduce((a, p) => a + num(p.stock), 0) : null);
      h += veri.map(p => magRow(esc(p.nome), usciteBy(p.id), p.stock, true)).join('');
    }
    for (const p of ps.filter(p => p.gen)) {
      const n = usciteBy(p.id);
      if (n) h += `<button class="warnline" data-act="go" data-stato="gen" data-g="${esc(gr)}">⚠︎ ${n} pezzi segnati come «${esc(p.nome)}»: tocca per indicare quale</button>`;
    }
  }
  return h ? `<div class="card"><div class="ct h">MAGAZZINO <small>conto vendita incluso, resi esclusi</small></div>${h}</div>` : '';
}
function contoCard(all) {
  const cv = all.filter(r => r.tipo === 'conto'); if (!cv.length) return '';
  const s = stats(cv), m = new Map();
  for (const r of cv) {
    const k = r.venditore || '(non indicato)';
    const o = m.get(k) || { mano: 0, dainc: 0, vend: 0 };
    o.mano += inMano(r); o.dainc += daIncassare(r); o.vend += r.venduti || 0; m.set(k, o);
  }
  const rows = [...m.entries()].sort((a, b) => b[1].mano - a[1].mano).map(([k, o]) =>
    `<button class="rowbtn" data-act="seller" data-v="${esc(k)}"><span>${esc(k)}</span><span class="r">in mano <b>${o.mano}</b> · da versare <b class="${o.dainc ? 'due' : ''}">${eur(o.dainc)}</b></span></button>`).join('');
  return `<div class="card"><div class="ct h">CONTO VENDITA <small>affidati ${s.cvAff} · venduti ${s.cvVend} · resi ${s.cvResi}</small></div>${rows}</div>`;
}
function backupBanner() {
  if (!tutteRighe().length) return '';
  const last = S.lastBackup ? new Date(S.lastBackup) : null;
  const giorni = last ? Math.floor((Date.now() - last) / 86400000) : null;
  const cambiato = !last || (S.lastChange && S.lastChange > S.lastBackup);
  if (!cambiato || (giorni !== null && giorni < 3)) return '';
  return `<div class="banner"><span>${last ? `Ultimo backup ${giorni} giorni fa.` : 'Non hai ancora fatto un backup.'} Salvalo su iCloud, così i dati sono al sicuro.</span><button class="btn small primary" data-act="backup">Backup</button></div>`;
}

/* ---------- Elenco ---------- */
function vList() {
  const gs = gruppi();
  if (UI.g !== 'tutti' && !gs.includes(UI.g)) UI.g = 'tutti';
  const chipsStato = Object.entries(FILTRI).filter(([k]) => k !== 'gen' || UI.stato === 'gen' || R().some(r => prod(r.prodotto).gen))
    .map(([k, [l]]) => `<button class="chip ${UI.stato === k ? 'on' : ''}" data-act="seg" data-k="stato" data-v="${k}">${l}</button>`).join('');
  const chipsG = gs.length > 1 ? [['tutti', 'Tutti i prodotti'], ...gs.map(x => [x, x])]
    .map(([k, l]) => `<button class="chip ${UI.g === k ? 'on' : ''}" data-act="seg" data-k="g" data-v="${esc(k)}">${esc(l)}</button>`).join('') : '';
  const vend = UI.venditore ? `<button class="chip on x" data-act="clearSeller">Venditore: ${esc(UI.venditore)}</button>` : '';
  return `${bannerChiusa()}<div class="search"><input id="q" type="search" placeholder="Cerca un nome o una nota" value="${esc(UI.q)}" autocomplete="off"></div>
    <div class="chips">${chipsStato}</div>${vend || chipsG ? `<div class="chips">${vend}${chipsG}</div>` : ''}
    <div id="lista">${listaHTML()}</div>`;
}
function filtrati() {
  const q = UI.q.trim().toLowerCase(), f = FILTRI[UI.stato][1];
  return R().filter(r => matchG(r, UI.g) && f(r) &&
    (!UI.venditore || (r.venditore || '(non indicato)') === UI.venditore) &&
    (!q || [r.acquirente, r.venditore, r.fornitore, r.consegnatoA, r.note, prod(r.prodotto).nome].join(' ').toLowerCase().includes(q))
  ).sort((a, b) => b.n - a.n);
}
function listaHTML() {
  const L = filtrati();
  if (!L.length) return `<div class="empty">Nessuna riga con questi filtri.</div>`;
  const pezzi = L.reduce((a, r) => a + r.qta, 0), dainc = L.reduce((a, r) => a + daIncassare(r), 0);
  return `<div class="sum">${L.length} ${L.length === 1 ? 'riga' : 'righe'} · ${pezzi} pezzi${dainc ? ' · da incassare ' + eur(dainc) : ''}</div>` + L.map(cardR).join('');
}
function cardR(r) {
  const cv = r.tipo === 'conto';
  const t = cv ? `${esc(r.venditore || 'Venditore non indicato')}` : esc(r.acquirente || 'Acquirente non indicato');
  const sub = [`${esc(prod(r.prodotto).nome)} × ${r.qta}`,
    cv ? (r.fornitore && r.fornitore !== r.venditore ? 'da ' + esc(r.fornitore) : '') : (r.venditore ? 'vende ' + esc(r.venditore) : '')
  ].filter(Boolean).join(' · ');
  const tags = [];
  if (cv) tags.push('<span class="badge cv">Conto vendita</span>');
  if (r.mercatino) tags.push('<span class="badge info">Mercatino</span>');
  if (r.spedizione) tags.push('<span class="badge info">Spedizione</span>');
  let cons;
  if (cv) cons = r.consegnato ? `✓ Al venditore ${dm(r.dataConsegna)}` : 'Da consegnare al venditore';
  else if (r.spedizione) cons = r.consegnato ? `✓ Spedito ${dm(r.dataConsegna)}` : 'Da spedire';
  else cons = r.consegnato ? `✓ Consegnato ${dm(r.dataConsegna)}${r.consegnatoA && r.consegnatoA !== r.acquirente ? ' a ' + esc(r.consegnatoA) : ''}` : 'Da consegnare';
  let pag, pagOk;
  if (cv) { const d = daIncassare(r); pagOk = d === 0 && (r.venduti || 0) > 0; pag = `In mano ${inMano(r)} · venduti ${r.venduti || 0}${d ? ' · da versare ' + eur(d) : (r.venduti ? ' · saldato' : '')}`; }
  else { pagOk = r.pagato; pag = r.pagato ? `✓ Pagato ${dm(r.dataPagamento)}${r.metodo ? ' · ' + METODI[r.metodo] : ''}` : 'Da incassare'; }
  const amt = cv ? (num(r.versato) ? eur(r.versato) : '') : eur(importo(r));
  return `<div class="rec" data-act="edit" data-id="${r.id}" role="button" tabindex="0">
    <div class="rec-top"><div><div class="rec-t">${t}</div><div class="rec-s">${sub}</div></div><div class="rec-amt">${amt}</div></div>
    <div class="tags">${tags.join('')}
      <button class="badge ${r.consegnato ? 'ok' : 'todo'}" data-act="tcons" data-id="${r.id}">${cons}</button>
      <button class="badge ${pagOk ? 'ok' : 'todo'}" data-act="tpag" data-id="${r.id}">${pag}</button></div>
    ${r.note ? `<div class="rec-n">${esc(r.note)}</div>` : ''}</div>`;
}

/* ---------- Venditori ---------- */
function vSellers() {
  if (!R().length) return '<div class="empty">Ancora nessun dato in questa campagna.</div>';
  const m = new Map(), f = new Map();
  for (const r of R()) {
    const k = r.venditore || '(non indicato)';
    const o = m.get(k) || { pz: 0, dacons: 0, inc: 0, dainc: 0, mano: 0 };
    o.pz += r.tipo === 'conto' ? (r.venduti || 0) : r.qta;
    if (r.tipo !== 'conto' && !r.consegnato) o.dacons += r.qta;
    o.inc += incassato(r); o.dainc += daIncassare(r); o.mano += inMano(r);
    m.set(k, o);
    const fk = r.fornitore || '(non indicato)';
    f.set(fk, (f.get(fk) || 0) + uscite(r));
  }
  const rows = [...m.entries()].sort((a, b) => b[1].pz - a[1].pz).map(([k, o]) =>
    `<button class="rowbtn" data-act="seller" data-v="${esc(k)}"><span><b>${esc(k)}</b><br><span class="muted">${o.pz} venduti${o.dacons ? ` · ${o.dacons} da consegnare` : ''}${o.mano ? ` · ${o.mano} in conto vendita` : ''}</span></span>
     <span class="r">incassato <b>${eur(o.inc)}</b><br>${o.dainc ? `da incassare <b class="due">${eur(o.dainc)}</b>` : ''}</span></button>`).join('');
  const frows = [...f.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) =>
    `<div class="rowbtn" style="cursor:default"><span>${esc(k)}</span><span class="r"><b>${n}</b> pezzi</span></div>`).join('');
  return `<div class="card"><div class="ct h">VENDITORI <small>tocca per vedere le righe</small></div>${rows}</div>
    <div class="card"><div class="ct h">HANNO CONSEGNATO AI VENDITORI</div>${frows}</div>`;
}

/* ---------- Campagne ---------- */
function vCamps() {
  const L = [...S.campagne].sort((a, b) => (a.stato === b.stato ? 0 : a.stato === 'aperta' ? -1 : 1) || String(b.creata || '').localeCompare(String(a.creata || '')));
  const card = c => inCamp(c, () => {
    const s = stats(c.records), cur = c.id === S.attiva, k = cassa(c);
    const pezzi = c.records.reduce((a, r) => a + (r.tipo === 'conto' ? (r.venduti || 0) : r.qta), 0);
    return `<div class="card camp ${cur ? 'cur' : ''}">
      <div class="camp-top"><b class="h">${esc(c.nome).toUpperCase()}</b>
        ${cur ? '<span class="badge ok">In uso</span>' : ''}<span class="badge ${c.stato === 'chiusa' ? 'closed' : 'cv'}">${c.stato === 'chiusa' ? 'Chiusa' : 'Aperta'}</span></div>
      <p class="muted">${esc(c.prodotti.filter(p => !p.gen).map(p => p.nome).join(' · '))}</p>
      <p class="muted">${c.records.length} ${c.records.length === 1 ? 'riga' : 'righe'} · ${pezzi} ${pezzi === 1 ? 'pezzo venduto' : 'pezzi venduti'} · incassato <b>${eur(s.inc)}</b>${s.dainc ? ` · da incassare <b class="due">${eur(s.dainc)}</b>` : ''}${k.resto > 0 ? ` · da dare ad ${CASSA_A} <b class="due">${eur(k.resto)}</b>` : ''}</p>
      <div class="btns">
        ${cur ? '' : `<button class="btn small primary" data-act="cUse" data-id="${c.id}">Apri</button>`}
        <button class="btn small" data-act="cEdit" data-id="${c.id}">Prodotti e prezzi</button>
        <button class="btn small" data-act="cToggle" data-id="${c.id}">${c.stato === 'chiusa' ? 'Riapri' : 'Chiudi'}</button>
        <button class="btn small danger" data-act="cDel" data-id="${c.id}">Elimina</button>
      </div></div>`;
  });
  return `<button class="btn primary block" data-act="cNew">+ Nuova campagna</button>
    ${L.map(card).join('')}
    <p class="muted">Ogni campagna ha prodotti, prezzi, magazzino e righe separati. Quando una vendita è finita, <b>chiudila</b>: resta consultabile ma non si modifica più per sbaglio. I nomi delle persone restano suggeriti in tutte le campagne.</p>`;
}

/* ---------- Altro ---------- */
function vMore() {
  const c = C();
  const prodRows = c.prodotti.filter(p => !p.gen).map(p =>
    `<div class="rowbtn" style="cursor:default"><span>${esc(p.nome)}</span><span class="r"><b>${eur(p.prezzo)}</b><br>${hasNum(p.stock) ? `magazzino ${p.stock}` : 'magazzino non indicato'}</span></div>`).join('');
  return `<div class="card"><div class="ct h">CAMPAGNA <small>${esc(c.nome)}${c.stato === 'chiusa' ? ' · chiusa' : ''}</small></div>
      ${prodRows}
      <button class="btn block" data-act="cEdit" data-id="${c.id}">Modifica prodotti, prezzi e magazzino</button>
      <button class="btn block" data-act="view" data-v="camps">Tutte le campagne · nuova campagna</button>
      <p class="muted">L'importo di ogni vendita si calcola da solo (quantità × prezzo), ma puoi cambiarlo a mano nella singola vendita.</p></div>
    <div class="card"><div class="ct h">BACKUP</div>
      <p class="muted">I dati sono salvati solo su questo iPhone. Fai un backup ogni tanto e salvalo in <b>File → iCloud Drive</b>: se cambi o perdi il telefono, li recuperi con «Importa backup». Il backup contiene tutte le campagne.</p>
      <p class="muted">Ultimo backup: <b>${S.lastBackup ? dmy(S.lastBackup) : 'mai'}</b> · ${S.campagne.length} ${S.campagne.length === 1 ? 'campagna' : 'campagne'} · ${tutteRighe().length} righe</p>
      <button class="btn primary block" data-act="backup">Fai il backup</button>
      <label class="btn block" for="imp">Importa backup</label>
      <input id="imp" type="file" accept=".json,application/json" hidden>
      <button class="btn block" data-act="csv">Esporta «${esc(c.nome)}» per Excel</button></div>
    <div class="card"><div class="ct h">BLOCCO CON PIN</div>
      <p class="muted">${S.settings.pin ? 'Il PIN è attivo: viene chiesto all\'apertura dell\'app.' : 'Facoltativo: chiede un PIN di 4 cifre quando apri l\'app.'}</p>
      ${S.settings.pin ? '<button class="btn block" data-act="pinOff">Togli il PIN</button>' : '<button class="btn block" data-act="pinOn">Imposta un PIN</button>'}</div>
    <div class="card"><div class="ct h">COME SI USA</div><ul class="help-list">
      <li><b>Campagne</b>: ogni vendita (Natale, uova di Pasqua…) è separata. Tocca il nome in alto per passare da una all'altra o crearne una nuova.</li>
      <li><b>Soldi ad ${CASSA_A}</b> (nel Riepilogo): somma i pagamenti in contanti o «altro» e i soldi versati dai conti vendita; i bonifici restano fuori perché vanno direttamente all'associazione. Quando le consegni dei soldi, tocca «+ Segna soldi dati ad ${CASSA_A}».</li>
      <li><b>+ Nuova</b>: segna una vendita o un conto vendita nella campagna aperta.</li>
      <li>Nell'<b>Elenco</b> tocca il bollino arancione «Da consegnare» o «Da incassare» per segnarlo fatto con la data di oggi. Tocca la riga per modificarla.</li>
      <li><b>Conto vendita</b>: segna quanti pezzi affidi al venditore; poi aggiorna venduti, resi e soldi versati.</li>
      <li><b>Chi consegna al venditore</b> e <b>venditore</b> possono essere la stessa persona.</li>
      <li>I nomi già usati compaiono come suggerimento mentre scrivi: sceglili per non creare doppioni.</li></ul></div>
    <div class="card"><div class="ct h">ZONA PERICOLOSA</div>
      <button class="btn danger block" data-act="wipe">Cancella tutti i dati</button></div>
    <p class="ver">Arca Vendite · versione ${VERSIONE}</p>`;
}

/* ---------- Modulo campagna ---------- */
function nuovoProdotto() { return { id: uid(), nome: '', gruppo: '', prezzo: '', stock: null, gen: false }; }
function openCamp(id) {
  hideToast();
  const c = id ? S.campagne.find(x => x.id === id) : null;
  FC = c ? { id: c.id, nome: c.nome, prodotti: clone(c.prodotti) } : { id: null, nome: '', prodotti: [nuovoProdotto()] };
  document.body.classList.add('noscroll');
  renderCamp(true);
}
function closeCamp() { FC = null; $('#layer').innerHTML = ''; document.body.classList.remove('noscroll'); }
function usatoIn(cid, pid) { const c = S.campagne.find(x => x.id === cid); return c ? c.records.filter(r => r.prodotto === pid).length : 0; }
function renderCamp(first) {
  const old = $('#layer .sheet'); const top = old ? old.scrollTop : 0;
  const v = x => x === null || x === undefined ? '' : esc(x);
  const altre = S.campagne.filter(c => c.id !== FC.id && c.prodotti.length);
  const righe = FC.prodotti.map((p, i) => `<div class="pe">
      <label class="f"><span>Prodotto ${i + 1}</span><input data-cp="${i}.nome" value="${v(p.nome)}" placeholder="es. Uovo al latte" autocomplete="off"></label>
      <div class="two">
        <label class="f"><span>Prezzo (€)</span><input data-cp="${i}.prezzo" inputmode="decimal" value="${v(p.prezzo)}" placeholder="0"></label>
        ${p.gen ? '<div class="f"><span>Magazzino</span><small class="muted">non serve</small></div>' :
          `<label class="f"><span>Quantità iniziale</span><input data-cp="${i}.stock" inputmode="numeric" value="${v(p.stock)}" placeholder="non so"></label>`}
      </div>
      <label class="f"><span>Gruppo <small>(facoltativo)</small></span><input data-cp="${i}.gruppo" value="${v(p.gruppo)}" placeholder="es. Uova" autocomplete="off" list="gruppi"></label>
      <label class="sw"><span>Segnaposto «da decidere»<small>per chi prenota senza scegliere il gusto: poi lo cambi</small></span><input type="checkbox" data-cp="${i}.gen" ${p.gen ? 'checked' : ''}></label>
      <button class="btn small danger" data-act="cpDel" data-i="${i}">Togli questo prodotto</button>
    </div>`).join('');
  const gl = [...new Set(FC.prodotti.map(p => (p.gruppo || '').trim()).filter(Boolean))];
  $('#layer').innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true">
    <div class="sheet-head"><button class="lnk" data-act="cfClose">Annulla</button><b class="h">${FC.id ? 'CAMPAGNA' : 'NUOVA CAMPAGNA'}</b><button class="btn primary" data-act="cfSave">Salva</button></div>
    <div class="sec"><label class="f"><span>Nome della campagna</span><input data-cf="nome" value="${v(FC.nome)}" placeholder="es. Pasqua 2027" autocomplete="off"></label></div>
    ${!FC.id && altre.length ? `<div class="sec-t">Parti da una campagna esistente</div><div class="sec"><div class="btns">${altre.map(c =>
      `<button class="btn small" data-act="cpCopy" data-id="${c.id}">Copia prodotti di «${esc(c.nome)}»</button>`).join('')}</div>
      <p class="muted">Copia nomi, gruppi e prezzi; il magazzino resta da indicare.</p></div>` : ''}
    <div class="sec-t">Prodotti in vendita</div>
    <div class="sec">${righe}<button class="btn block" data-act="cpAdd">+ Aggiungi un prodotto</button></div>
    <p class="muted">Il <b>gruppo</b> unisce le varianti dello stesso prodotto (es. «Uovo al latte» e «Uovo fondente» nel gruppo «Uova»): nel riepilogo vedi il totale del gruppo e il dettaglio. Se lo lasci vuoto, il prodotto fa gruppo da solo.</p>
    <datalist id="gruppi">${gl.map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist>
  </div></div>`;
  const sh = $('#layer .sheet'); if (!first) sh.scrollTop = top;
}
function setCF(t) {
  if (!FC) return;
  if (t.dataset.cf) { FC.nome = t.value; return; }
  const [i, k] = t.dataset.cp.split('.'), p = FC.prodotti[+i]; if (!p) return;
  if (k === 'gen') { p.gen = t.checked; if (p.gen) p.stock = null; renderCamp(); return; }
  p[k] = t.value;
}
function saveCamp() {
  const nome = String(FC.nome || '').replace(/\s+/g, ' ').trim();
  if (!nome) return alert('Dai un nome alla campagna (es. «Pasqua 2027»).');
  if (S.campagne.some(c => c.id !== FC.id && c.nome.toLowerCase() === nome.toLowerCase())) return alert('Esiste già una campagna con questo nome.');
  const pulisci = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const ps = FC.prodotti.map(p => ({ ...p, nome: pulisci(p.nome), gruppo: pulisci(p.gruppo) }));
  const vuoto = ps.find(p => !p.nome);
  if (vuoto) {
    if (FC.id && usatoIn(FC.id, vuoto.id)) return alert('Un prodotto usato nelle righe non può restare senza nome.');
    if (hasNum(vuoto.prezzo) || hasNum(vuoto.stock)) return alert('Manca il nome di un prodotto.');
  }
  const L = ps.filter(p => p.nome);
  if (!L.some(p => !p.gen)) return alert('Inserisci almeno un prodotto (non segnaposto).');
  const visti = new Set();
  for (const p of L) { const k = p.nome.toLowerCase(); if (visti.has(k)) return alert(`Il prodotto «${p.nome}» è scritto due volte.`); visti.add(k); }
  for (const p of L) {
    if (hasNum(p.prezzo) && !isFinite(parseFloat(String(p.prezzo).replace(',', '.')))) return alert(`Il prezzo di «${p.nome}» non è un numero.`);
    p.prezzo = num(p.prezzo); p.stock = p.gen || !hasNum(p.stock) ? null : int(p.stock);
  }
  if (FC.id) {
    const c = S.campagne.find(x => x.id === FC.id);
    c.nome = nome; c.prodotti = L;
    save(); closeCamp(); render(); toast('Campagna salvata ✓');
  } else {
    const c = { id: uid(), nome, stato: 'aperta', creata: new Date().toISOString(), chiusa: null, prodotti: L, records: [], versamenti: [], nextN: 1 };
    S.campagne.push(c); usaCampagna(c.id); UI.view = 'home';
    save(); closeCamp(); render(); window.scrollTo(0, 0); toast(`Campagna «${nome}» creata ✓`);
  }
}
function usaCampagna(id) {
  S.attiva = id;
  Object.assign(UI, { homeG: 'tutti', g: 'tutti', stato: 'tutti', venditore: null, q: '' });
}

/* ---------- Soldi consegnati ad Annalisa ---------- */
let FV = null;
function openVers(id) {
  if (bloccata()) return;
  const v = id ? C().versamenti.find(x => x.id === id) : null, k = cassa();
  FV = v ? clone(v) : { id: null, data: oggi(), importo: k.resto > 0 ? String(k.resto).replace('.', ',') : '', note: '' };
  hideToast(); document.body.classList.add('noscroll');
  $('#layer').innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true">
    <div class="sheet-head"><button class="lnk" data-act="vClose">Annulla</button><b class="h">AD ${CASSA_A.toUpperCase()}</b><button class="btn primary" data-act="vSave">Salva</button></div>
    <div class="sec">
      <label class="f"><span>Soldi consegnati (€)</span><input data-fv="importo" inputmode="decimal" value="${esc(String(FV.importo).replace('.', ','))}" placeholder="0"></label>
      <label class="f"><span>Data</span><input type="date" data-fv="data" value="${esc(FV.data)}"></label>
      <label class="f"><span>Note</span><input data-fv="note" value="${esc(FV.note)}" placeholder="es. contanti del mercatino" autocomplete="off"></label>
    </div>
    <p class="muted">${v ? '' : (k.resto > 0 ? `Ti restano da consegnare ${eur(k.resto)}: l'importo è già proposto, cambialo se ne consegni solo una parte.` : 'Non risultano soldi da consegnare, ma puoi segnare lo stesso la consegna.')}</p>
    ${v ? '<button class="btn danger block" data-act="vDel">Elimina questa consegna</button>' : ''}
  </div></div>`;
}
function closeVers() { FV = null; $('#layer').innerHTML = ''; document.body.classList.remove('noscroll'); }
function saveVers() {
  const imp = num(FV.importo);
  if (imp <= 0) return alert('Indica quanti soldi hai consegnato.');
  const L = C().versamenti, v = { id: FV.id || uid(), data: FV.data || oggi(), importo: Math.round(imp * 100) / 100, note: String(FV.note || '').trim() };
  const i = L.findIndex(x => x.id === v.id);
  if (i >= 0) L[i] = v; else L.push(v);
  save(); closeVers(); render(); toast(`Segnati ${eur(v.importo)} dati ad ${CASSA_A} ✓`);
}

/* ---------- Modulo vendita ---------- */
function nuovo() {
  const vend = C().prodotti.filter(p => !p.gen);
  const pr = vend.find(p => p.id === UIp.prodotto) || vend[0];
  return { id: null, tipo: 'vendita', prodotto: pr.id, qta: 1, fornitore: UIp.fornitore || '', venditore: UIp.venditore || '',
    acquirente: '', mercatino: false, spedizione: false, consegnato: false, dataConsegna: '', consegnatoA: '',
    pagato: false, dataPagamento: '', metodo: 'contanti', importo: null, venduti: 0, resi: 0, versato: 0, note: '' };
}
/* In una campagna chiusa non si modifica nulla: propone di riaprirla */
function bloccata() {
  if (!chiusa()) return false;
  const c = C();
  choice('Campagna chiusa', `«${c.nome}» è chiusa: si può solo consultare.`, [
    { label: 'Riapri la campagna', primary: true, fn: () => toggleCamp(c.id) },
    { label: 'Crea una nuova campagna', fn: () => openCamp(null) }]);
  return true;
}
function openForm(id) {
  if (bloccata()) return;
  F = id ? clone(R().find(r => r.id === id)) : nuovo();
  if (!F) return;
  hideToast();
  document.body.classList.add('noscroll');
  renderForm(true);
}
function closeForm() { F = null; $('#layer').innerHTML = ''; document.body.classList.remove('noscroll'); }
function renderForm(first) {
  const old = $('#layer .sheet'); const top = old ? old.scrollTop : 0;
  const r = F, cv = r.tipo === 'conto';
  const prods = C().prodotti.filter(p => !p.gen || p.id === r.prodotto);
  const consLbl = cv ? 'Consegnati al venditore' : (r.spedizione ? 'Spedito' : 'Consegnato');
  const v = x => x === null || x === undefined ? '' : esc(x);
  const step = k => `<div class="stepper"><button type="button" data-act="step" data-k="${k}" data-d="-1" aria-label="meno">−</button><input name="${k}" inputmode="numeric" value="${r[k] || 0}"><button type="button" data-act="step" data-k="${k}" data-d="1" aria-label="più">+</button></div>`;
  $('#layer').innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true">
    <div class="sheet-head"><button class="lnk" data-act="fclose">Annulla</button><b class="h">${r.id ? 'MODIFICA' : 'NUOVA'}</b><button class="btn primary" data-act="fsave">Salva</button></div>
    <div class="seg">${seg('tipo', [['vendita', 'Vendita'], ['conto', 'Conto vendita']], r.tipo, 'fseg')}</div>
    <div class="sec-t">Prodotto</div>
    <div class="sec"><div class="prod">${prods.map((p, i) => `<button type="button" class="${r.prodotto === p.id ? 'on' : ''} ${p.gen || (prods.length % 2 && i === prods.length - 1) ? 'wide' : ''}" data-act="fseg" data-k="prodotto" data-v="${esc(p.id)}">${esc(p.nome)}<small>${eur(p.prezzo)} cad.</small></button>`).join('')}</div>
      <div class="f"><span>${cv ? 'Pezzi affidati al venditore' : 'Quantità'}</span>${step('qta')}</div></div>
    <div class="sec-t">Persone</div>
    <div class="sec">
      <label class="f"><span>Chi consegna al venditore</span><input name="fornitore" list="nomi" value="${v(r.fornitore)}" autocomplete="off" placeholder="nome e cognome"></label>
      <label class="f"><span>Venditore</span><input name="venditore" list="nomi" value="${v(r.venditore)}" autocomplete="off"><div class="help">Può essere la stessa persona di sopra.</div></label>
      ${cv ? '' : `<label class="f"><span>Acquirente</span><input name="acquirente" list="nomi" value="${v(r.acquirente)}" autocomplete="off" placeholder="lascia vuoto se non lo sai"></label>`}
      <label class="sw">Mercatino<input type="checkbox" name="mercatino" ${r.mercatino ? 'checked' : ''}></label>
      <label class="sw">Da spedire<input type="checkbox" name="spedizione" ${r.spedizione ? 'checked' : ''}></label>
    </div>
    <div class="sec-t">Consegna</div>
    <div class="sec">
      <label class="sw"><span>${consLbl}</span><input type="checkbox" name="consegnato" ${r.consegnato ? 'checked' : ''}></label>
      ${r.consegnato ? `<label class="f"><span>Data</span><input type="date" name="dataConsegna" value="${v(r.dataConsegna)}"></label>
        ${cv ? '' : `<label class="f"><span>Consegnato a</span><input name="consegnatoA" list="nomi" value="${v(r.consegnatoA)}" autocomplete="off" placeholder="se diverso dall'acquirente"></label>`}` : ''}
    </div>
    <div class="sec-t">${cv ? 'Andamento del conto vendita' : 'Pagamento'}</div>
    <div class="sec">${cv ? `
      <div class="f"><span>Pezzi venduti</span>${step('venduti')}</div>
      <div class="f"><span>Pezzi resi</span>${step('resi')}</div>
      <label class="f"><span>Soldi già versati (€)</span><input name="versato" inputmode="decimal" value="${num(r.versato) || ''}" placeholder="0"></label>
      <div class="calc" id="calc"></div>` : `
      <label class="sw"><span>Pagato</span><input type="checkbox" name="pagato" ${r.pagato ? 'checked' : ''}></label>
      ${r.pagato ? `<div class="seg">${seg('metodo', Object.entries(METODI), r.metodo || 'contanti', 'fseg')}</div>
        <label class="f"><span>Data pagamento</span><input type="date" name="dataPagamento" value="${v(r.dataPagamento)}"></label>` : ''}
      <label class="f"><span>Importo (€)</span><input name="importo" inputmode="decimal" value="${r.importo === null || r.importo === '' ? '' : v(r.importo)}" placeholder="${eur(r.qta * prezzo(r.prodotto))} (automatico)"><div class="help">Lascia vuoto per il calcolo automatico. Cambialo solo per sconti o offerte.</div></label>`}
    </div>
    <div class="sec-t">Note</div>
    <div class="sec"><label class="f"><textarea name="note" placeholder="es. consegnare a Dro, biglietti da dare…">${esc(r.note)}</textarea></label></div>
    ${r.id ? `<button class="btn danger block" data-act="fdel">Elimina questa riga</button>` : ''}
    <datalist id="nomi">${nomi().map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
  </div></div>`;
  const sh = $('#layer .sheet'); if (!first) sh.scrollTop = top;
  updateCalc();
}
function updateCalc() {
  const c = $('#calc'); if (!c || !F) return;
  const d = Math.max((F.venduti || 0) * prezzo(F.prodotto) - num(F.versato), 0);
  const mano = F.qta - (F.venduti || 0) - (F.resi || 0);
  c.innerHTML = mano < 0 ? '⚠︎ Venduti + resi superano i pezzi affidati' : `Ancora in mano: ${mano} · Da versare: ${eur(d)}`;
}
function setF(t) {
  const k = t.name; if (!F || !k) return;
  if (t.type === 'checkbox') {
    F[k] = t.checked;
    if (k === 'consegnato' && t.checked) { if (!F.dataConsegna) F.dataConsegna = oggi(); }
    if (k === 'pagato' && t.checked) { if (!F.dataPagamento) F.dataPagamento = oggi(); if (!F.metodo) F.metodo = 'contanti'; }
    renderForm();
    return;
  }
  if (['qta', 'venduti', 'resi'].includes(k)) F[k] = int(t.value);
  else if (k === 'importo') F[k] = t.value.trim() === '' ? null : num(t.value);
  else if (k === 'versato') F[k] = num(t.value);
  else F[k] = t.value;
  updateCalc();
}
function saveForm() {
  const r = F;
  ['fornitore', 'venditore', 'acquirente', 'consegnatoA'].forEach(k => r[k] = normNome(r[k]));
  r.note = (r.note || '').trim();
  if (r.tipo === 'vendita' && r.qta < 1) return alert('Indica una quantità di almeno 1.');
  if (r.tipo === 'conto') {
    if (!r.venditore) return alert('Indica il venditore che ha i prodotti in conto vendita.');
    if ((r.venduti || 0) + (r.resi || 0) > r.qta) return alert('Venduti + resi non possono superare i pezzi affidati.');
    r.acquirente = ''; r.pagato = false; r.importo = null;
  } else { r.venduti = 0; r.resi = 0; r.versato = 0; }
  if (!r.consegnato) { r.dataConsegna = ''; r.consegnatoA = ''; }
  if (r.consegnato && r.consegnatoA === r.acquirente) r.consegnatoA = '';
  if (!r.pagato) { r.dataPagamento = ''; }
  const c = C();
  if (r.id) { const i = c.records.findIndex(x => x.id === r.id); c.records[i] = r; }
  else { r.id = uid(); r.n = c.nextN++; r.creato = new Date().toISOString(); c.records.push(r); }
  if (!prod(r.prodotto).gen) UIp.prodotto = r.prodotto;
  UIp.fornitore = r.fornitore; UIp.venditore = r.venditore; saveUIp();
  save(); closeForm(); render();
  toast('Salvato ✓');
}

/* ---------- Scelte rapide, toast, annulla ---------- */
let toastT;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button id="undo">Annulla</button>' : ''}`;
  t.classList.add('show'); clearTimeout(toastT);
  if (undo) $('#undo').onclick = () => { undo(); t.classList.remove('show'); };
  toastT = setTimeout(() => t.classList.remove('show'), undo ? 6000 : 2200);
}
function choice(title, text, opts) {
  hideToast();
  $('#layer').innerHTML = `<div class="overlay" data-act="choiceClose"><div class="choice" role="dialog">
    <h3 class="h">${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
    ${opts.map((o, i) => `<button class="btn block ${o.primary ? 'primary' : ''}" data-act="choice" data-i="${i}">${esc(o.label)}</button>`).join('')}
    <button class="btn block" data-act="choiceClose">Annulla</button></div></div>`;
  CHOICES = opts;
}
let CHOICES = [];
function modifica(id, fn, msg) {
  const L = R(), i = L.findIndex(r => r.id === id); if (i < 0) return;
  const prima = clone(L[i]);
  fn(L[i]); save(); render();
  toast(msg, () => { const j = L.findIndex(r => r.id === id); if (j >= 0) L[j] = prima; save(); render(); });
}
function chi(r) { return r.acquirente || r.venditore || 'questa riga'; }
function toggleCamp(id) {
  const c = S.campagne.find(x => x.id === id); if (!c) return;
  if (c.stato === 'chiusa') { c.stato = 'aperta'; c.chiusa = null; save(); render(); toast(`«${c.nome}» riaperta`); return; }
  const s = inCamp(c, () => stats(c.records)), k = cassa(c);
  const aperti = [s.dainc ? `${eur(s.dainc)} ancora da incassare` : '', k.resto > 0 ? `${eur(k.resto)} da consegnare ad ${CASSA_A}` : '', s.dacons ? `${s.dacons} pezzi da consegnare` : '', s.cvMano ? `${s.cvMano} pezzi ancora in conto vendita` : ''].filter(Boolean);
  if (!confirm(`Chiudere «${c.nome}»?${aperti.length ? '\n\nAttenzione: ci sono ancora ' + aperti.join(', ') + '.' : ''}\n\nResterà consultabile e potrai riaprirla quando vuoi.`)) return;
  c.stato = 'chiusa'; c.chiusa = new Date().toISOString(); save(); render(); toast(`«${c.nome}» chiusa`);
}

/* ---------- Azioni ---------- */
const ACT = {
  view: el => { UI.view = el.dataset.v; render(); window.scrollTo(0, 0); },
  new: () => openForm(null),
  seg: el => { UI[el.dataset.k] = el.dataset.v; render(); },
  go: el => { UI.view = 'list'; UI.stato = el.dataset.stato; UI.g = el.dataset.g || 'tutti'; UI.venditore = null; UI.q = ''; render(); window.scrollTo(0, 0); },
  seller: el => { UI.view = 'list'; UI.venditore = el.dataset.v; UI.stato = 'tutti'; UI.g = 'tutti'; UI.q = ''; render(); window.scrollTo(0, 0); },
  clearSeller: () => { UI.venditore = null; render(); },
  edit: el => openForm(el.dataset.id),
  tcons: el => {
    const r = R().find(x => x.id === el.dataset.id); if (!r || bloccata()) return;
    if (r.tipo === 'conto') return openForm(r.id);
    if (!r.consegnato) modifica(r.id, x => { x.consegnato = true; x.dataConsegna = oggi(); }, `${r.spedizione ? 'Spedito' : 'Consegnato'} oggi: ${chi(r)}`);
    else choice(r.spedizione ? 'Già spedito' : 'Già consegnato', `${chi(r)} · ${dm(r.dataConsegna)}`, [
      { label: 'Segna come NON consegnato', fn: () => modifica(r.id, x => { x.consegnato = false; x.dataConsegna = ''; x.consegnatoA = ''; }, 'Segnato come da consegnare') },
      { label: 'Apri la riga', fn: () => openForm(r.id) }]);
  },
  tpag: el => {
    const r = R().find(x => x.id === el.dataset.id); if (!r || bloccata()) return;
    if (r.tipo === 'conto') return openForm(r.id);
    if (!r.pagato) choice('Segna pagato', `${chi(r)} · ${eur(importo(r))} · oggi`,
      Object.entries(METODI).map(([k, l], i) => ({ label: l, primary: i === 0, fn: () => modifica(r.id, x => { x.pagato = true; x.metodo = k; x.dataPagamento = oggi(); }, `Pagato (${l.toLowerCase()}): ${chi(r)}`) })));
    else choice('Già pagato', `${chi(r)} · ${eur(importo(r))} · ${dm(r.dataPagamento)}`, [
      { label: 'Segna come NON pagato', fn: () => modifica(r.id, x => { x.pagato = false; x.dataPagamento = ''; }, 'Segnato come da incassare') },
      { label: 'Apri la riga', fn: () => openForm(r.id) }]);
  },
  choice: el => { const o = CHOICES[+el.dataset.i]; $('#layer').innerHTML = ''; o && o.fn(); },
  choiceClose: (el, e) => { if (e.target === el) $('#layer').innerHTML = ''; },
  fclose: () => closeForm(),
  fsave: () => saveForm(),
  fseg: el => { F[el.dataset.k] = el.dataset.v; renderForm(); },
  step: el => { const k = el.dataset.k; F[k] = Math.max(0, (F[k] || 0) + (+el.dataset.d)); if (k === 'qta' && F.tipo === 'vendita' && F[k] < 1) F[k] = 1; renderForm(); },
  fdel: () => {
    if (!confirm('Eliminare questa riga?')) return;
    const L = R(), id = F.id, i = L.findIndex(r => r.id === id), prima = clone(L[i]);
    L.splice(i, 1); save(); closeForm(); render();
    toast('Riga eliminata', () => { L.splice(Math.min(i, L.length), 0, prima); save(); render(); });
  },
  /* soldi ad Annalisa */
  vNew: () => openVers(null),
  vEdit: el => openVers(el.dataset.id),
  vClose: () => closeVers(),
  vSave: () => saveVers(),
  vDel: () => {
    if (!confirm('Eliminare questa consegna di soldi?')) return;
    const L = C().versamenti, i = L.findIndex(x => x.id === FV.id); if (i < 0) return closeVers();
    const prima = L[i]; L.splice(i, 1); save(); closeVers(); render();
    toast('Consegna eliminata', () => { L.splice(Math.min(i, L.length), 0, prima); save(); render(); });
  },
  /* campagne */
  cNew: () => openCamp(null),
  cEdit: el => openCamp(el.dataset.id),
  cUse: el => { usaCampagna(el.dataset.id); save(); UI.view = 'home'; render(); window.scrollTo(0, 0); toast(`Aperta «${C().nome}»`); },
  cToggle: el => toggleCamp(el.dataset.id),
  cDel: el => {
    const c = S.campagne.find(x => x.id === el.dataset.id); if (!c) return;
    if (!confirm(`Eliminare la campagna «${c.nome}» con le sue ${c.records.length} righe?\nNon si può annullare: fai prima un backup.`)) return;
    if (c.records.length && prompt('Per confermare scrivi ELIMINA') !== 'ELIMINA') return;
    S.campagne = S.campagne.filter(x => x.id !== c.id);
    if (S.attiva === c.id) usaCampagna((S.campagne.find(x => x.stato === 'aperta') || S.campagne[0] || {}).id || null);
    save(); render(); toast('Campagna eliminata');
  },
  cfClose: () => closeCamp(),
  cfSave: () => saveCamp(),
  cpAdd: () => { FC.prodotti.push(nuovoProdotto()); renderCamp(); const ins = document.querySelectorAll('#layer [data-cp$=".nome"]'); if (ins.length) ins[ins.length - 1].focus(); },
  cpDel: el => {
    const i = +el.dataset.i, p = FC.prodotti[i]; if (!p) return;
    const n = FC.id ? usatoIn(FC.id, p.id) : 0;
    if (n) return alert(`«${p.nome}» è usato in ${n} ${n === 1 ? 'riga' : 'righe'}: non si può togliere. Puoi cambiargli nome o prezzo.`);
    FC.prodotti.splice(i, 1); renderCamp();
  },
  cpCopy: el => {
    const c = S.campagne.find(x => x.id === el.dataset.id); if (!c) return;
    FC.prodotti = c.prodotti.map(p => ({ id: uid(), nome: p.nome, gruppo: p.gruppo, prezzo: p.prezzo, stock: null, gen: p.gen }));
    renderCamp(); toast(`Copiati ${FC.prodotti.length} prodotti`);
  },
  backup: () => doBackup(),
  csv: () => doCsv(),
  pinOn: () => setPin(),
  pinOff: () => { if (confirm('Togliere il PIN?')) { S.settings.pin = null; save(); render(); toast('PIN tolto'); } },
  pin: el => pinKey(el.dataset.k),
  wipe: () => {
    if (!confirm('Cancellare TUTTI i dati (tutte le campagne) da questo iPhone? Fai prima un backup!')) return;
    if (prompt('Per confermare scrivi CANCELLA') !== 'CANCELLA') return;
    S = clone(DEF); UI.view = 'home'; save(); render(); toast('Dati cancellati');
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (fn) fn(el, e);
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.rec')) { e.preventDefault(); openForm(e.target.dataset.id); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { UI.q = t.value; $('#lista').innerHTML = listaHTML(); return; }
  if (t.dataset.fv) { if (FV) FV[t.dataset.fv] = t.value; return; }
  if ((t.dataset.cf || t.dataset.cp) && t.type !== 'checkbox') return setCF(t);
  if (t.closest('.sheet') && t.type !== 'checkbox') setF(t);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.fv) { if (FV) FV[t.dataset.fv] = t.value; return; }
  if (t.dataset.cp && t.type === 'checkbox') return setCF(t);
  if (t.closest('.sheet') && t.type === 'checkbox') return setF(t);
  if (t.id === 'imp' && t.files[0]) importa(t.files[0]);
});

/* ---------- Backup / import / Excel ---------- */
async function condividi(nome, testo, mime) {
  const blob = new Blob([testo], { type: mime });
  try {
    const file = new File([blob], nome, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: nome }); return true; }
  } catch (e) { if (e.name === 'AbortError') return false; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return true;
}
async function doBackup() {
  const copia = clone(S); copia.esportato = new Date().toISOString(); delete copia.settings.pin;
  const ok = await condividi(`arca-vendite-backup-${oggi()}.json`, JSON.stringify(copia, null, 1), 'application/json');
  if (ok) { S.lastBackup = new Date().toISOString(); localStorage.setItem(KEY, JSON.stringify(S)); render(); toast('Backup pronto: salvalo in iCloud Drive'); }
}
function importa(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const raw = JSON.parse(fr.result);
      if (!raw || !(Array.isArray(raw.campagne) || Array.isArray(raw.records))) throw new Error('formato non riconosciuto');
      const d = fix(raw), n = d.campagne.reduce((a, c) => a + c.records.length, 0);
      const desc = d.campagne.map(c => `• ${c.nome} (${c.records.length} righe)`).join('\n');
      const ora = S.campagne.length ? `\n\nSostituisco i dati attuali (${S.campagne.length} campagne, ${tutteRighe().length} righe)?` : '\n\nImporto?';
      if (!confirm(`Il file contiene:\n${desc}${ora}`)) return;
      const pin = S.settings.pin;
      S = d; S.settings.pin = pin;
      save(); S.lastBackup = S.lastChange; localStorage.setItem(KEY, JSON.stringify(S));
      usaCampagna(S.attiva); UI.view = 'home'; render(); toast(`Importate ${n} righe ✓`);
    } catch (e) { alert('Non riesco a leggere il file: ' + e.message); }
  };
  fr.readAsText(file);
}
function doCsv() {
  const c = C();
  const cols = ['N.', 'Tipo', 'Prodotto', 'Quantità', 'Chi consegna al venditore', 'Venditore', 'Acquirente', 'Mercatino', 'Spedizione',
    'Consegnato', 'Data consegna', 'Consegnato a', 'Pagato', 'Metodo', 'Data pagamento', 'Importo €', 'CV venduti', 'CV resi', 'CV versato €', 'Da incassare €', 'Note'];
  const d = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  const n = x => String(Math.round(x * 100) / 100).replace('.', ',');
  const q = v => { v = String(v ?? ''); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const rows = [...c.records].sort((a, b) => a.n - b.n).map(r => {
    const cv = r.tipo === 'conto';
    return [r.n, cv ? 'Conto vendita' : 'Vendita', prod(r.prodotto).nome, r.qta, r.fornitore, r.venditore, r.acquirente, r.mercatino ? 'sì' : '', r.spedizione ? 'sì' : '',
      r.consegnato ? 'sì' : 'no', d(r.dataConsegna), r.consegnatoA, cv ? '' : (r.pagato ? 'sì' : 'no'), cv ? '' : (r.pagato ? METODI[r.metodo] || '' : ''), d(r.dataPagamento),
      n(importo(r)), cv ? r.venduti || 0 : '', cv ? r.resi || 0 : '', cv ? n(num(r.versato)) : '', n(daIncassare(r)), r.note].map(q).join(';');
  });
  const k = cassa();
  const vers = [...c.versamenti].sort((a, b) => (a.data || '').localeCompare(b.data || '')).map(v => ['', 'Dati ad ' + CASSA_A, d(v.data), n(v.importo), v.note].map(q).join(';'));
  const fondo = ['', '', 'SOLDI AD ' + CASSA_A.toUpperCase() + ' (bonifici esclusi);Data;Importo €;Note', ...vers,
    ['', 'Raccolti da te', '', n(k.mano)].join(';'), ['', 'Già consegnati', '', n(k.dato)].join(';'), ['', 'Da consegnare', '', n(k.resto)].join(';')];
  condividi(`arca-${slug(c.nome) || 'vendite'}-${oggi()}.csv`, '﻿' + [cols.join(';')].concat(rows, fondo).join('\r\n'), 'text/csv');
}

/* ---------- PIN ---------- */
async function hash(s) {
  s = 'arca:' + s;
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h;
}
async function setPin() {
  const a = prompt('Scegli un PIN di 4 cifre.\nAttenzione: se lo dimentichi dovrai reinstallare l\'app e reimportare un backup.');
  if (a === null) return;
  if (!/^\d{4}$/.test(a)) return alert('Il PIN deve avere 4 cifre.');
  if (prompt('Ripeti il PIN') !== a) return alert('I due PIN non coincidono.');
  S.settings.pin = await hash(a); save(); render(); toast('PIN attivato');
}
function renderLock() {
  app.innerHTML = `<div class="lock"><div><div class="h lock-t">ARCA VENDITE</div><p>Inserisci il PIN</p>
    <div class="dots">${[0, 1, 2, 3].map(i => `<i class="${i < PINBUF.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-act="pin" data-k="${k}" aria-label="${k === '⌫' ? 'cancella' : k}">${k}</button>`).join('')}</div>
    <p class="err">${PINERR}</p></div></div>`;
}
async function pinKey(k) {
  if (k === '⌫') PINBUF = PINBUF.slice(0, -1); else if (PINBUF.length < 4) PINBUF += k;
  PINERR = '';
  if (PINBUF.length === 4) {
    if (await hash(PINBUF) === S.settings.pin) { UI.locked = false; PINBUF = ''; render(); return; }
    PINERR = 'PIN errato'; PINBUF = '';
  }
  renderLock();
}
let nascostaDa = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) nascostaDa = Date.now();
  else if (S.settings.pin && !F && !FC && !FV && nascostaDa && Date.now() - nascostaDa > 120000) { $('#layer').innerHTML = ''; UI.locked = true; render(); }
});

/* ---------- Avvio ---------- */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
if (S.campagne.length && localStorage.getItem(KEY) && !JSON.parse(localStorage.getItem(KEY)).campagne) save(); // salva subito nel nuovo formato
render();
