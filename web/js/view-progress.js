/* Screen 6: My progress */
(function (E) {
  const { h } = E;

  E.view('progress', ({ user }) => {
    const all = E.Store.sessionsFor(user.id);
    if (!all.length) {
      return h('div', null, E.pageHead('My progress', 'Compare your sessions over time.'),
        h('div', { class: 'card' }, E.emptyState('↗', 'Nothing to compare yet', 'Your charts and table appear after your first saved session.',
          h('a', { class: 'btn primary', href: '#/train' }, 'Start practice'))));
    }

    const f = { organ: 'all', from: '', to: '' };
    const sort = { key: 'startedAt', dir: 'desc' };
    let focusKey = null;   // keeps keyboard focus on the sort button after the table redraws
    const out = h('div');

    const organSel = h('select', { id: 'f-organ', onChange: (e) => { f.organ = e.target.value; draw(); } },
      h('option', { value: 'all' }, 'All organs'), E.CONFIG.organs.map((o) => h('option', { value: o.id }, o.name)));
    const fromIn = h('input', { type: 'date', id: 'f-from', onChange: (e) => { f.from = e.target.value; draw(); } });
    const toIn = h('input', { type: 'date', id: 'f-to', onChange: (e) => { f.to = e.target.value; draw(); } });
    const reset = h('button', { class: 'btn ghost', onClick: () => { f.organ = 'all'; f.from = f.to = ''; organSel.value = 'all'; fromIn.value = toIn.value = ''; draw(); } }, 'Clear filters');
    const filters = h('div', { class: 'card filters', role: 'group', 'aria-label': 'Filters' },
      h('div', { class: 'field' }, h('label', { for: 'f-organ' }, 'Organ'), organSel),
      h('div', { class: 'field' }, h('label', { for: 'f-from' }, 'From'), fromIn),
      h('div', { class: 'field' }, h('label', { for: 'f-to' }, 'To'), toIn), reset);

    const delta = (a, b, unit, higherBetter, digits = 0) => {
      const d = +(b - a).toFixed(digits);
      if (d === 0) return h('span', { class: 'delta flat' }, '– no change');
      const good = higherBetter ? d > 0 : d < 0;
      return h('span', { class: `delta ${good ? 'up' : 'down'}` }, `${d > 0 ? '▲ +' : '▼ '}${d}${unit}`, ' ', good ? 'improved' : 'worse');
    };

    function draw() {
      const rows = all.filter((s) => (f.organ === 'all' || s.organ === f.organ)
        && (!f.from || s.startedAt.slice(0, 10) >= f.from) && (!f.to || s.startedAt.slice(0, 10) <= f.to));
      if (!rows.length) {
        out.replaceChildren(h('div', { class: 'card' }, E.emptyState('⌕', 'No sessions match these filters', 'Try a wider date range or a different organ.', h('button', { class: 'btn', onClick: () => reset.click() }, 'Clear filters'))));
        return;
      }

      // before vs latest
      const first = rows[0], last = rows.at(-1);
      const ratio = (s) => Math.round(s.duration / E.organById(s.organ).expectedSec * 100);
      const compare = rows.length < 2
        ? h('p', { class: 'muted' }, 'Complete one more session in this selection to see your improvement.')
        : h('table', { class: 'plain compare' },
          h('thead', null, h('tr', null, h('th', null, ''), h('th', null, `Before (${E.shortDate(first.startedAt)})`), h('th', null, `Latest (${E.shortDate(last.startedAt)})`), h('th', null, 'Change'))),
          h('tbody', null,
            h('tr', null, h('th', null, 'Score'), h('td', null, first.score), h('td', null, last.score), h('td', null, delta(first.score, last.score, ' pts', true))),
            h('tr', null, h('th', null, 'Pressure control'), h('td', null, E.pct(first.stats.pressureShare)), h('td', null, E.pct(last.stats.pressureShare), ), h('td', null, delta(Math.round(first.stats.pressureShare * 100), Math.round(last.stats.pressureShare * 100), ' pts', true))),
            h('tr', null, h('th', null, 'Pressure events'), h('td', null, first.pressureEvents), h('td', null, last.pressureEvents), h('td', null, delta(first.pressureEvents, last.pressureEvents, '', false))),
            h('tr', null, h('th', null, 'Time used vs expected'), h('td', null, `${E.mmss(first.duration)} (${ratio(first)}%)`), h('td', null, `${E.mmss(last.duration)} (${ratio(last)}%)`), h('td', null, delta(ratio(first), ratio(last), ' pts', false)))));

      // per organ
      const perOrgan = E.CONFIG.organs.map((o) => {
        const m = rows.filter((s) => s.organ === o.id);
        return { label: o.name.split(' ')[0], value: m.length ? E.mean(m.map((s) => s.score)) : 0, text: m.length ? String(Math.round(E.mean(m.map((s) => s.score)))) : '—', note: `${m.length} session${m.length === 1 ? '' : 's'}` };
      });

      // table
      const cols = [['startedAt', 'Date'], ['organ', 'Organ'], ['score', 'Score'], ['duration', 'Duration'], ['pressureEvents', 'Pressure events'], ['avgTiltError', 'Tilt error']];
      const val = (s, k) => (k === 'organ' ? E.organName(s.organ) : s[k]);
      const sorted = rows.slice().sort((a, b) => { const x = val(a, sort.key), y = val(b, sort.key); return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1); });
      const th = ([k, label]) => h('th', { scope: 'col', 'aria-sort': sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', { class: 'sort-btn', 'data-key': k, onClick: () => { focusKey = k; sort.dir = sort.key === k && sort.dir === 'desc' ? 'asc' : 'desc'; sort.key = k; draw(); } },
          label, h('span', { 'aria-hidden': 'true' }, sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕')));

      out.replaceChildren(
        h('section', { class: 'grid two' },
          h('div', { class: 'card' }, h('h2', null, 'Score by session'),
            E.lineChart(rows.map((s, i) => ({ label: E.shortDate(s.startedAt), value: s.score, detail: E.organName(s.organ) })), { name: 'Score by session', valueHeader: 'Score' })),
          h('div', { class: 'card' }, h('h2', null, 'Average score by organ'), E.hbars(perOrgan, { max: 100, name: 'Average score per organ' }))),
        h('section', { class: 'card' }, h('h2', null, 'Before versus latest'), compare),
        h('section', { class: 'card' }, h('div', { class: 'row between' }, h('h2', null, 'All sessions'), h('span', { class: 'muted', role: 'status' }, `${rows.length} of ${all.length} shown`)),
          h('div', { class: 'table-scroll' }, h('table', { class: 'data' },
            h('thead', null, h('tr', null, cols.map(th), h('th', null, h('span', { class: 'sr-only' }, 'Details')))),
            h('tbody', null, sorted.map((s) => h('tr', null,
              h('td', null, E.fmtDateTime(s.startedAt)), h('td', null, E.organName(s.organ)), h('td', null, E.scoreBadge(s.score)),
              h('td', null, E.mmss(s.duration)), h('td', null, s.pressureEvents), h('td', null, `${s.avgTiltError}°`),
              h('td', null, h('a', { href: `#/results/${s.id}`, 'aria-label': `View results for ${E.organName(s.organ)} on ${E.fmtDate(s.startedAt)}` }, 'View')))))))));
      if (focusKey) { out.querySelector(`[data-key="${focusKey}"]`)?.focus(); focusKey = null; }
    }

    draw();
    return h('div', null, E.pageHead('My progress', 'See how your scores, pressure control and speed change over time.'), filters, out);
  });
})(globalThis.Echo = globalThis.Echo || {});
