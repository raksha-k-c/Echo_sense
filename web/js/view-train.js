/* Screen 3: Select training */
(function (E) {
  const { h } = E;
  const GLYPH = { liver: 'L', gallbladder: 'G', kidney: 'K', spleen: 'S' };

  E.difficulty = (n) => h('span', { class: 'difficulty' }, h('span', { 'aria-hidden': 'true' }, '●'.repeat(n) + '○'.repeat(3 - n)), ' ', E.CONFIG.difficultyLabels[n]);

  E.view('train', ({ user }) => {
    const sessions = E.Store.sessionsFor(user.id);
    return h('div', null,
      E.pageHead('Select training', 'Choose an organ. You will be asked to find each required window with steady, light pressure.'),
      h('div', { class: 'grid organs' }, E.CONFIG.organs.map((o) => {
        const mine = sessions.filter((s) => s.organ === o.id), last = mine.at(-1);
        return h('a', { class: 'card organ-card', href: `#/practice/${o.id}` },
          h('span', { class: 'organ-glyph', 'aria-hidden': 'true' }, GLYPH[o.id]),
          h('h2', null, o.name),
          h('p', null, o.description),
          h('p', { class: 'chips' }, o.required.map((r) => h('span', { class: 'chip' }, r))),
          h('dl', { class: 'facts' },
            h('div', null, h('dt', null, 'Difficulty'), h('dd', null, E.difficulty(o.difficulty))),
            h('div', null, h('dt', null, 'Practised'), h('dd', null, mine.length ? `${mine.length} time${mine.length > 1 ? 's' : ''}` : 'Not yet')),
            h('div', null, h('dt', null, 'Last score'), h('dd', null, last ? E.scoreBadge(last.score) : '—')),
            h('div', null, h('dt', null, 'Target time'), h('dd', null, E.mmss(o.expectedSec)))),
          h('span', { class: 'btn primary card-cta' }, `Practise ${o.name.split(' ')[0].toLowerCase()} →`));
      })));
  });
})(globalThis.Echo = globalThis.Echo || {});
