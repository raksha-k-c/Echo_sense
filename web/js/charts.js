/* Small dependency-free charts (SVG / HTML). One accent colour; values are always shown as text too,
 * every chart has an accessible name and a "view as table" fallback where it plots many points. */
(function (E) {
  const { h, svg } = E;

  /** points: [{label, value, detail}] ; opts: {yMin, yMax, unit, name, valueHeader} */
  E.lineChart = (points, opts = {}) => {
    const W = 640, H = 260, m = { l: 38, r: 28, t: 24, b: 34 };
    const yMin = opts.yMin ?? 0, yMax = opts.yMax ?? 100, unit = opts.unit || '';
    const X = (i) => points.length === 1 ? (W + m.l - m.r) / 2 : m.l + (W - m.l - m.r) * i / (points.length - 1);
    const Y = (v) => m.t + (H - m.t - m.b) * (1 - (v - yMin) / (yMax - yMin));
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${opts.name}. ${points.length} points, from ${points[0].value} to ${points.at(-1).value}${unit}.` });
    for (let g = 0; g <= 4; g++) {
      const v = yMin + (yMax - yMin) * g / 4;
      s.append(svg('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'gl' }),
               svg('text', { x: m.l - 8, y: Y(v) + 4, class: 'axis', 'text-anchor': 'end' }, Math.round(v)));
    }
    const step = Math.ceil(points.length / 8);
    points.forEach((p, i) => { if (i % step === 0 || i === points.length - 1) s.append(svg('text', { x: X(i), y: H - 10, class: 'axis', 'text-anchor': 'middle' }, p.label)); });
    if (points.length > 1) s.append(svg('path', { class: 'line', d: points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.value)}`).join(' ') }));
    const tip = h('div', { class: 'chart-tip', hidden: true, role: 'status' });
    const show = (i) => {
      const p = points[i];
      tip.hidden = false; tip.textContent = `${p.label}: ${p.value}${unit}${p.detail ? ' · ' + p.detail : ''}`;
      tip.style.left = `${X(i) / W * 100}%`; tip.style.top = `${Y(p.value) / H * 100}%`;
    };
    points.forEach((p, i) => {
      s.append(svg('circle', { cx: X(i), cy: Y(p.value), r: 4.5, class: 'dot' }));
      const hit = svg('circle', { cx: X(i), cy: Y(p.value), r: 16, class: 'hit', tabindex: 0, 'aria-label': `${p.label}: ${p.value}${unit}${p.detail ? ', ' + p.detail : ''}` });
      hit.addEventListener('pointerenter', () => show(i)); hit.addEventListener('focus', () => show(i));
      hit.addEventListener('pointerleave', () => { tip.hidden = true; }); hit.addEventListener('blur', () => { tip.hidden = true; });
      s.append(hit);
    });
    const last = points.at(-1);
    s.append(svg('text', { x: X(points.length - 1), y: Y(last.value) - 12, class: 'end-label', 'text-anchor': 'middle' }, last.value + unit));
    const table = h('details', { class: 'chart-table' }, h('summary', null, 'View as table'),
      h('table', null, h('thead', null, h('tr', null, h('th', null, 'Session'), h('th', null, opts.valueHeader || 'Value'))),
        h('tbody', null, points.map((p) => h('tr', null, h('td', null, p.label + (p.detail ? ` (${p.detail})` : '')), h('td', null, p.value + unit))))));
    return h('div', null, h('div', { class: 'chart-wrap' }, s, tip), table);
  };

  /** Horizontal bars. items: [{label, value, text, note}] ; every bar carries its value as text. */
  E.hbars = (items, opts = {}) => {
    const max = opts.max ?? Math.max(1, ...items.map((i) => i.value));
    return h('ul', { class: 'hbars', 'aria-label': opts.name },
      items.map((i) => h('li', null,
        h('span', { class: 'hb-label' }, i.label),
        h('span', { class: 'hb-track', 'aria-hidden': 'true' }, h('span', { class: 'hb-fill', style: { width: `${Math.max(i.value ? 2 : 0, i.value / max * 100)}%` } })),
        h('span', { class: 'hb-value' }, i.text, i.note ? h('small', { class: 'muted' }, ` ${i.note}`) : null))));
  };

  /** Ring chart with the score in the centre and its band as text. */
  E.ring = (score) => {
    const r = 80, c = 2 * Math.PI * r, b = E.band(score);
    return svg('svg', { viewBox: '0 0 200 200', class: 'ring', role: 'img', 'aria-label': `Overall score ${score} out of 100, ${b.label}` },
      svg('circle', { cx: 100, cy: 100, r, class: 'ring-track' }),
      svg('circle', { cx: 100, cy: 100, r, class: 'ring-arc', 'stroke-dasharray': `${c * score / 100} ${c}`, transform: 'rotate(-90 100 100)' }),
      svg('text', { x: 100, y: 108, class: 'ring-num', 'text-anchor': 'middle' }, score),
      svg('text', { x: 100, y: 132, class: 'ring-sub', 'text-anchor': 'middle' }, 'out of 100'));
  };

  /** Score badge: number + symbol + word, so colour is never the only signal. */
  E.scoreBadge = (score) => { const b = E.band(score); return h('span', { class: `badge tone-${b.tone}` }, h('span', { 'aria-hidden': 'true' }, b.icon), ` ${score} `, h('span', { class: 'badge-word' }, b.label)); };
})(globalThis.Echo = globalThis.Echo || {});
