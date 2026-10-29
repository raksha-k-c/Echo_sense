/* Small helpers: DOM builder, formatting, seeded random numbers, CSV parsing, toasts. */
(function (E) {
  const SVGNS = 'http://www.w3.org/2000/svg';

  function apply(node, props) {
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  function append(node, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
  }
  /** h('div', {class:'x'}, 'text', child) – always uses text nodes, so user text can never inject HTML. */
  E.h = (tag, props, ...kids) => { const n = document.createElement(tag); apply(n, props); append(n, kids); return n; };
  E.svg = (tag, props, ...kids) => { const n = document.createElementNS(SVGNS, tag); apply(n, props); append(n, kids); return n; };

  // ---------- formatting ----------
  E.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  E.mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  E.longDuration = (sec) => {
    const m = Math.round(sec / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };
  E.fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  E.fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  E.shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  E.pct = (v) => `${Math.round(v * 100)}%`;
  E.mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  E.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /** Deterministic PRNG (mulberry32) so sample data and procedural images are stable. */
  E.rng = (seed) => {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  E.hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  // ---------- CSV ----------
  /** Minimal RFC-4180 style parser (quotes, commas, CRLF). Returns array of string arrays. */
  E.parseCSV = (text) => {
    const rows = []; let row = [], cell = '', q = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  };

  // ---------- toast (status messages, announced to screen readers) ----------
  E.toast = (msg, kind = 'info') => {
    let box = document.getElementById('toasts');
    if (!box) return;
    const t = E.h('div', { class: `toast toast-${kind}` }, (kind === 'error' ? '⚠ ' : kind === 'success' ? '✓ ' : 'ℹ ') + msg);
    box.append(t);
    setTimeout(() => t.remove(), 5000);
  };

  /** Skeleton block for loading states. */
  E.skeleton = (n = 3) => E.h('div', { class: 'skeleton-wrap', role: 'status', 'aria-label': 'Loading' },
    Array.from({ length: n }, () => E.h('div', { class: 'skeleton' })));

  E.emptyState = (icon, title, text, ...actions) => E.h('div', { class: 'empty' },
    E.h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, icon),
    E.h('h3', null, title), E.h('p', { class: 'muted' }, text),
    actions.length ? E.h('div', { class: 'row center' }, actions) : null);

  E.errorState = (msg, retry) => E.h('div', { class: 'card error-card', role: 'alert' },
    E.h('strong', null, '⚠ Something went wrong'), E.h('p', null, msg),
    retry ? E.h('button', { class: 'btn', onClick: retry }, 'Try again') : null);
})(globalThis.Echo = globalThis.Echo || {});
