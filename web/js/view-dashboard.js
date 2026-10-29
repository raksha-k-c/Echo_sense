/* Screen 2: Trainee dashboard (+ session-log import dialog) */
(function (E) {
  const { h } = E;
  const organName = (id) => E.organById(id)?.name || id;
  E.organName = organName;

  function statCard(label, value, sub, extra) {
    return h('div', { class: 'card stat' }, h('p', { class: 'stat-label' }, label), h('p', { class: 'stat-value' }, value), h('p', { class: 'muted stat-sub' }, sub), extra);
  }

  // ---------- import dialog ----------
  function openImport(user) {
    const dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'imp-title' });
    const body = h('div');
    const close = () => { dlg.close(); dlg.remove(); };
    const fileInput = h('input', { type: 'file', accept: '.csv,text/csv', id: 'imp-file' });
    const msg = h('div', { 'aria-live': 'polite' });

    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0]; if (!f) return;
      msg.replaceChildren(E.skeleton(1));
      try {
        const parsed = E.parseSessionCSV(await f.text());
        const sel = h('select', { id: 'imp-organ' }, E.CONFIG.organs.map((o) => h('option', { value: o.id }, o.name)));
        sel.value = E.guessOrgan(parsed.samples);
        const dur = parsed.samples.at(-1).t;
        const notes = [];
        if (parsed.skipped) notes.push(`${parsed.skipped} row${parsed.skipped > 1 ? 's were' : ' was'} skipped because the numbers were missing or invalid.`);
        if (parsed.unknown.length) notes.push(`Unknown zone name${parsed.unknown.length > 1 ? 's' : ''} ignored: ${parsed.unknown.join(', ')}.`);
        msg.replaceChildren(
          h('p', { class: 'ok-line' }, `✓ ${parsed.samples.length} samples, ${E.mmss(dur)} long, recorded ${E.fmtDateTime(parsed.startedAt)}.`),
          ...notes.map((n) => h('p', { class: 'warn-line' }, '⚠ ' + n)),
          h('div', { class: 'field' }, h('label', { for: 'imp-organ' }, 'Which exercise was this?'), sel),
          h('div', { class: 'row end' }, h('button', { class: 'btn', onClick: close }, 'Cancel'),
            h('button', { class: 'btn primary', onClick: () => {
              const s = E.buildSession({ user: user.id, organ: sel.value, startedAt: parsed.startedAt, samples: parsed.samples });
              if (E.Store.saveSession(s)) { close(); E.toast('Session imported.', 'success'); E.go(`#/results/${s.id}`); }
            } }, 'Import session')));
      } catch (e) { msg.replaceChildren(h('p', { class: 'form-error', role: 'alert' }, '⚠ ' + e.message)); }
    });

    body.append(h('h2', { id: 'imp-title' }, 'Import session log'),
      h('p', { class: 'muted' }, 'Choose a CSV file saved by ultrasound.py (press “l” while scanning). Columns: t, tracked, x, y, yaw, pitch, roll, force, contact, zone, image.'),
      h('div', { class: 'field' }, h('label', { for: 'imp-file' }, 'Session log (.csv)'), fileInput), msg,
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onClick: close }, 'Close')));
    dlg.append(body);
    dlg.addEventListener('cancel', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
  }
  E.openImport = openImport;

  E.view('dashboard', ({ user }) => {
    const sessions = E.Store.sessionsFor(user.id);
    const hour = new Date().getHours(), greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const importBtn = h('button', { class: 'btn', onClick: () => openImport(user) }, '⇪ Import session log');
    const startBtn = h('a', { class: 'btn primary', href: '#/train' }, '+ Start new practice');
    const head = E.pageHead(`${greet}, ${user.name.split(' ')[0]}`, new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), importBtn, startBtn);

    if (!sessions.length) {
      return h('div', null, head, h('div', { class: 'card' }, E.emptyState('◎', 'No sessions yet', 'Complete a practice session, import a log from ultrasound.py, or load sample sessions to see how the dashboard looks.',
        startBtn.cloneNode(true),
        h('button', { class: 'btn', onClick: () => { E.Store.addSessions(E.generateSampleSessions(user.id)); E.go('#/dashboard'); } }, 'Load sample sessions'))));
    }

    const latest = sessions.at(-1), prev = sessions.at(-2), best = sessions.reduce((a, b) => (b.score > a.score ? b : a));
    const total = sessions.reduce((s, x) => s + x.duration, 0), b = E.band(latest.score);
    const delta = prev ? latest.score - prev.score : 0;
    const last10 = sessions.slice(-10);

    return h('div', null, head,
      h('section', { class: 'grid stats', 'aria-label': 'Summary' },
        statCard('Sessions completed', sessions.length, `since ${E.fmtDate(sessions[0].startedAt)}`),
        statCard('Latest score', h('span', null, latest.score, h('small', null, ' / 100')),
          h('span', null, `${b.icon} ${b.label}`, prev ? ` · ${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '– '}${delta} vs previous` : '')),
        statCard('Best score', h('span', null, best.score, h('small', null, ' / 100')), `${organName(best.organ)}, ${E.shortDate(best.startedAt)}`),
        statCard('Total practice time', E.longDuration(total), `average ${E.mmss(total / sessions.length)} per session`)),
      h('section', { class: 'grid two' },
        h('div', { class: 'card' }, h('h2', null, 'Score over your last 10 sessions'),
          E.lineChart(last10.map((s) => ({ label: E.shortDate(s.startedAt), value: s.score, detail: organName(s.organ) })), { name: 'Score over your last sessions', unit: '', valueHeader: 'Score' })),
        h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', null, 'Recent sessions'), h('a', { href: '#/progress' }, 'See all')),
          h('ul', { class: 'session-list' }, sessions.slice(-5).reverse().map((s) =>
            h('li', null, h('a', { href: `#/results/${s.id}`, class: 'session-row' },
              h('span', null, h('strong', null, organName(s.organ)), h('small', { class: 'muted block' }, E.fmtDateTime(s.startedAt))),
              h('span', { class: 'muted' }, E.mmss(s.duration)), E.scoreBadge(s.score))))))));
  });
})(globalThis.Echo = globalThis.Echo || {});
