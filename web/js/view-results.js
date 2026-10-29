/* Screen 5: Session results (for a just-finished session, or any saved one) */
(function (E) {
  const { h } = E;

  E.view('results', ({ params, user }) => {
    const id = params[0];
    let session, unsaved = false;
    if (id === 'new' || !id || id === 'latest') {
      const pend = E.Store.pending();
      session = pend || E.Store.sessionsFor(user.id).at(-1);
      unsaved = !!pend;
    } else {
      session = E.Store.getSession(id);
    }
    if (!session || session.user !== user.id) {
      return h('div', null, E.pageHead('Session results'),
        h('div', { class: 'card' }, E.emptyState('✔', id && !['latest', 'new'].includes(id) ? 'Session not found' : 'No results yet',
          'Finish a practice session and your results will appear here.', h('a', { class: 'btn primary', href: '#/train' }, 'Start practice'))));
    }

    const S = E.CONFIG.scoring, w = S.weights;
    const organ = E.organById(session.organ), st = session.stats, b = E.band(session.score);
    let banner = null;
    const saveBtn = h('button', { class: 'btn primary', onClick: () => {
      if (E.Store.saveSession(session)) {
        E.Store.clearPending(); saveBtn.textContent = '✓ Saved'; saveBtn.disabled = true; banner?.remove();
        E.toast('Session saved to your progress.', 'success');
      }
    } }, 'Save session');
    if (unsaved) banner = h('div', { class: 'notice', role: 'status' }, 'ⓘ This session is not saved yet. Press “Save session” to add it to your progress.');
    else { saveBtn.textContent = '✓ Saved'; saveBtn.disabled = true; }

    // Regions checklist: required ones first, then everything else.
    const rows = E.CONFIG.regions.map((r) => ({ name: r.name, sec: session.regions[r.name] || 0, req: organ.required.includes(r.name) }));
    const check = rows.slice().sort((a, c) => c.req - a.req).map((r) => {
      const ok = r.sec >= S.MIN_REGION_SECONDS;
      return h('li', { class: ok ? 'is-ok' : r.req ? 'is-miss' : 'is-na' },
        h('span', { class: 'tick', 'aria-hidden': 'true' }, ok ? '✓' : r.req ? '✗' : '–'), r.name,
        h('small', { class: 'muted' }, r.req ? (ok ? ' · required, reached' : ' · required, not reached') : (ok ? ' · explored' : ' · not visited')));
    });

    const parts = [
      ['Coverage', st.coverage, w.coverage, `${session.reached.length} of ${organ.required.length} required regions`],
      ['Pressure control', st.pressureShare, w.pressure, 'time with force in the good range'],
      ['Tilt accuracy', st.tiltShare, w.tilt, `pitch and roll within ±${S.TILT_TOLERANCE_DEG}°`],
      ['Time', st.timeShare, w.time, `${E.mmss(session.duration)} vs ${E.mmss(organ.expectedSec)} expected`]
    ];
    const tile = (label, value, sub) => h('div', { class: 'card stat' }, h('p', { class: 'stat-label' }, label), h('p', { class: 'stat-value' }, value), h('p', { class: 'muted stat-sub' }, sub));

    return h('div', null,
      E.pageHead('Session results', `${organ.name} · ${E.fmtDateTime(session.startedAt)}`),
      banner,
      h('section', { class: 'grid results-top' },
        h('div', { class: 'card center-col' }, E.ring(session.score), h('p', { class: `band tone-${b.tone}` }, `${b.icon} ${b.label}`)),
        h('div', { class: 'grid stats two-col' },
          tile('Time taken', E.mmss(session.duration), session.duration <= organ.expectedSec ? `✓ within the expected ${E.mmss(organ.expectedSec)}` : `▲ ${E.mmss(session.duration - organ.expectedSec)} over the expected ${E.mmss(organ.expectedSec)}`),
          tile('“Too much pressure” events', session.pressureEvents, session.pressureEvents === 0 ? '✓ none, well done' : `force above ${S.TOO_HARD}`),
          tile('Average tilt accuracy', E.pct(st.tiltShare), `average error ${session.avgTiltError}° from upright`),
          tile('Regions reached', `${session.reached.length} / ${organ.required.length}`, 'required for this exercise'))),
      h('section', { class: 'grid two' },
        h('div', { class: 'card' }, h('h2', null, 'Regions explored'), h('ul', { class: 'checklist' }, check)),
        h('div', { class: 'card' }, h('h2', null, 'Time in each region'),
          E.hbars(rows.map((r) => ({ label: r.name, value: r.sec, text: E.mmss(r.sec) })), { name: 'Seconds of contact in each region' }),
          h('p', { class: 'muted small-text' }, 'Only time with the probe in contact is counted.'))),
      h('section', { class: 'grid two' },
        h('div', { class: 'card' }, h('h2', null, 'Areas to practise'), h('ul', { class: 'advice' }, E.advice(session).map((t) => h('li', null, t)))),
        h('div', { class: 'card' }, h('h2', null, 'How the score adds up'),
          h('table', { class: 'plain' },
            h('thead', null, h('tr', null, h('th', null, 'Part'), h('th', null, 'Result'), h('th', null, 'Weight'), h('th', null, 'Points'))),
            h('tbody', null, parts.map(([n, v, wt, note]) => h('tr', null,
              h('td', null, n, h('small', { class: 'muted block' }, note)), h('td', null, E.pct(v)), h('td', null, E.pct(wt)), h('td', null, (v * wt * 100).toFixed(1))))),
            h('tfoot', null, h('tr', null, h('th', { colspan: 3 }, 'Total'), h('th', null, session.score)))))),
      h('div', { class: 'row actions-bar' }, saveBtn,
        h('a', { class: 'btn', href: `#/practice/${session.organ}`, onClick: () => { if (unsaved) E.Store.clearPending(); } }, '↻ Try again'),
        h('a', { class: 'btn ghost', href: '#/dashboard' }, 'Back to dashboard')));
  });
})(globalThis.Echo = globalThis.Echo || {});
