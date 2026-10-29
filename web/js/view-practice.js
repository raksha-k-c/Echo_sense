/* Screen 4: Practice (live). Data comes from the demo simulator or from a live WebSocket / HTTP feed. */
(function (E) {
  const { h, svg } = E;
  const MAX_FORCE = 3500;           // right-hand end of the pressure meter
  const TILT_RANGE = 45;            // pitch / roll meters show ±45°
  const names = new Map(E.CONFIG.regions.map((r) => [r.name.toLowerCase(), r.name]));
  const canon = (d) => names.get(String(d.region || '').toLowerCase()) || (d.x != null ? E.regionAt(d.x, d.y) || '' : '');

  /** A horizontal meter. `build(track)` adds static marks; returns {node, set}. */
  function meter(label, { unit, build, valueText }) {
    const track = h('div', { class: 'm-track', 'aria-hidden': 'true' });
    const fill = h('div', { class: 'm-fill' }); track.append(fill);
    build?.(track, fill);
    const val = h('span', { class: 'm-val' }), state = h('span', { class: 'm-state' });
    const node = h('div', { class: 'meter' }, h('div', { class: 'row between' }, h('strong', null, label), val), track, state);
    return { node, fill, track, val, state };
  }
  const pctOf = (v, max) => `${E.clamp(v / max * 100, 0, 100)}%`;

  E.view('practice', async ({ params, user, onLeave }) => {
    const organ = E.organById(params[0]);
    if (!organ) {
      return h('div', null, E.pageHead('Practice', 'Choose an exercise to begin.'),
        h('div', { class: 'card' }, E.emptyState('▶', 'No organ selected', 'Pick an organ first, then come back to practise.', h('a', { class: 'btn primary', href: '#/train' }, 'Select training'))));
    }
    await E.Images.load();
    const S = E.CONFIG.scoring, settings = E.Store.settings();

    // ---------- run state ----------
    const run = { state: 'idle', elapsed: 0, samples: [], startedAt: null, frozen: false, regionSec: {}, events: 0, hard: false, last: null, feed: null, status: 'idle', statusMsg: '' };
    let live = null, liveAt = 0, demo = null, lastTick = performance.now(), mode = settings.mode;

    // ---------- DOM: prompt ----------
    const promptMain = h('p', { class: 'prompt-main' }), promptSub = h('p', { class: 'muted' });
    const srAnnounce = h('div', { class: 'sr-only', 'aria-live': 'polite' });
    const statusChip = h('span', { class: 'chip status-chip' });
    const reachedList = h('ul', { class: 'req-list', 'aria-label': 'Required regions' });
    const prompt = h('section', { class: 'card prompt' }, h('div', null, h('p', { class: 'stat-label' }, 'Your target'), promptMain, promptSub), h('div', { class: 'prompt-side' }, statusChip, reachedList));

    // ---------- DOM: probe map ----------
    const mapSvg = svg('svg', { viewBox: '0 0 800 400', class: 'probe-map', role: 'img', 'aria-label': 'Map of body regions showing the probe position' });
    const cells = {};
    for (const r of E.CONFIG.regions) {
      const [x1, y1, x2, y2] = r.box, g = svg('g', { class: 'cell' });
      const rect = svg('rect', { x: x1 * 800 + 4, y: y1 * 400 + 4, width: (x2 - x1) * 800 - 8, height: (y2 - y1) * 400 - 8, rx: 14 });
      const name = svg('text', { x: (x1 + x2) * 400, y: (y1 + y2) * 200 - 4, 'text-anchor': 'middle', class: 'cell-name' }, r.name);
      const tag = svg('text', { x: (x1 + x2) * 400, y: (y1 + y2) * 200 + 24, 'text-anchor': 'middle', class: 'cell-tag' });
      g.append(rect, name, tag); mapSvg.append(g); cells[r.name] = { g, tag };
    }
    const probe = svg('g', { class: 'probe', visibility: 'hidden' }, svg('circle', { r: 20, class: 'probe-halo' }), svg('circle', { r: 9, class: 'probe-dot' }),
      svg('line', { x1: -26, x2: 26, y1: 0, y2: 0 }), svg('line', { x1: 0, x2: 0, y1: -26, y2: 26 }));
    mapSvg.append(probe);
    const mapCaption = h('p', { class: 'muted small-text', 'aria-live': 'off' });
    const mapCard = h('section', { class: 'card' }, h('h2', null, 'Probe position'), mapSvg, mapCaption);

    // ---------- DOM: ultrasound ----------
    const frame = h('div', { class: 'us-frame' });
    const placeholder = h('p', { class: 'us-ph' });
    const frozenBadge = h('span', { class: 'frozen-badge', hidden: true }, '❄ Image frozen');
    const usLabel = h('p', { class: 'muted small-text' });
    const usCard = h('section', { class: 'card' }, h('h2', null, 'Ultrasound image'), h('div', { class: 'us-wrap' }, frame, placeholder, frozenBadge), usLabel,
      !E.Images.available ? h('p', { class: 'notice' }, 'ⓘ Image dataset not found: showing illustrative pictures. Run serve.py for the real images.') : null,
      h('p', { class: 'muted small-text' }, 'Images: open datasets, CC BY 4.0.'));

    // ---------- DOM: meters ----------
    const mP = meter('Pressure', { build: (t) => {
      t.append(h('span', { class: 'mark', style: { left: pctOf(S.CONTACT, MAX_FORCE) } }), h('span', { class: 'mark limit', style: { left: pctOf(S.TOO_HARD, MAX_FORCE) } }));
    } });
    mP.node.append(h('p', { class: 'muted small-text' }, `Contact from ${S.CONTACT}, limit ${S.TOO_HARD}`));
    const tiltBuild = (target) => (t) => {
      const lo = E.clamp((target - S.TILT_TOLERANCE_DEG + TILT_RANGE) / (2 * TILT_RANGE) * 100, 0, 100), hi = E.clamp((target + S.TILT_TOLERANCE_DEG + TILT_RANGE) / (2 * TILT_RANGE) * 100, 0, 100);
      t.append(h('span', { class: 'band-ok', style: { left: `${lo}%`, width: `${hi - lo}%` } }), h('span', { class: 'mark', style: { left: '50%' } }));
    };
    const mPitch = meter('Pitch', { build: tiltBuild(S.TARGET_PITCH) }), mRoll = meter('Roll', { build: tiltBuild(S.TARGET_ROLL) });
    const mYaw = meter('Yaw', { build: (t) => t.append(h('span', { class: 'mark', style: { left: '50%' } })) });
    [mPitch, mRoll, mYaw].forEach((m) => m.track.classList.add('centered'));
    const meters = h('section', { class: 'card' }, h('h2', null, 'Live meters'), h('div', { class: 'meters' }, mP.node, mPitch.node, mRoll.node, mYaw.node));

    const warn = h('div', { class: 'warn-banner', role: 'alert' });
    const eventsChip = h('span', { class: 'chip' }, 'Pressure warnings: 0');

    // ---------- DOM: controls ----------
    const timer = h('p', { class: 'timer', role: 'timer', 'aria-label': 'Elapsed time' });
    const btnStart = h('button', { class: 'btn primary', onClick: start }, '▶ Start');
    const btnPause = h('button', { class: 'btn', onClick: togglePause, disabled: true }, '❚❚ Pause');
    const btnFreeze = h('button', { class: 'btn', 'aria-pressed': 'false', onClick: toggleFreeze }, '❄ Freeze image');
    const btnFinish = h('button', { class: 'btn danger', onClick: finish, disabled: true }, '■ Finish session');
    const controls = h('section', { class: 'card controls' }, h('div', null, h('p', { class: 'stat-label' }, 'Time'), timer, h('p', { class: 'muted small-text' }, `Target ${E.mmss(organ.expectedSec)}`)),
      h('div', { class: 'row wrap' }, btnStart, btnPause, btnFreeze, btnFinish), eventsChip);

    // ---------- DOM: settings ----------
    const urlIn = h('input', { type: 'text', id: 'feed-url', value: settings.feedUrl, spellcheck: 'false', 'aria-describedby': 'feed-help' });
    const modeSel = h('select', { id: 'feed-mode', onChange: () => { mode = modeSel.value; E.Store.saveSettings({ mode }); applyMode(); } },
      h('option', { value: 'demo' }, 'Demo mode (simulated data)'), h('option', { value: 'live' }, 'Live feed (probe hardware)'));
    modeSel.value = mode;
    const skillIn = h('input', { type: 'range', id: 'demo-skill', min: 0, max: 100, value: Math.round(settings.skill * 100), onInput: () => { skillOut.textContent = skillLabel(); E.Store.saveSettings({ skill: skillIn.value / 100 }); } });
    const skillLabel = () => (skillIn.value < 35 ? 'Beginner' : skillIn.value < 70 ? 'Intermediate' : 'Expert');
    const skillOut = h('output', { for: 'demo-skill' }, skillLabel());
    const connectBtn = h('button', { class: 'btn', onClick: () => { E.Store.saveSettings({ feedUrl: urlIn.value.trim() }); applyMode(); } }, 'Connect');
    const liveFields = h('div', { class: 'field' }, h('label', { for: 'feed-url' }, 'Live data address'), h('div', { class: 'pw-row' }, urlIn, connectBtn),
      h('p', { class: 'muted small-text', id: 'feed-help' }, 'ws://… for a WebSocket or http://… for a JSON endpoint. Fields: x, y, yaw, pitch, roll, force, region, image.'));
    const demoFields = h('div', { class: 'field' }, h('label', { for: 'demo-skill' }, 'Simulated trainee level'), h('div', { class: 'row' }, skillIn, skillOut));
    const lockMsg = h('p', { class: 'muted small-text' });
    const settingsBox = h('details', { class: 'card settings' }, h('summary', null, 'Data source settings'),
      h('div', { class: 'field' }, h('label', { for: 'feed-mode' }, 'Data source'), modeSel), liveFields, demoFields,
      lockMsg);

    // ---------- feed handling ----------
    function setStatus(st, msg) {
      run.status = st; run.statusMsg = msg;
      if (mode === 'live') { statusChip.className = `chip status-chip st-${st}`; statusChip.textContent = st === 'connected' ? '● Live · connected' : st === 'connecting' ? '◌ Live · connecting…' : '✕ Live · no connection'; statusChip.title = msg; }
      if (st === 'error' && mode === 'live') mapCaption.textContent = msg;
    }
    function applyMode() {
      run.feed?.stop(); run.feed = null; live = null;
      liveFields.hidden = mode !== 'live'; demoFields.hidden = mode !== 'demo';
      if (mode === 'demo') { statusChip.className = 'chip status-chip st-demo'; statusChip.textContent = '◆ Demo mode · simulated data'; statusChip.title = 'Data is simulated. No hardware is connected.'; mapCaption.textContent = 'Demo mode: the probe position is simulated.'; }
      else { mapCaption.textContent = ''; run.feed = new E.LiveFeed(urlIn.value, (d) => { live = d; liveAt = performance.now(); }, setStatus); run.feed.start(); }
    }

    // ---------- run control ----------
    function start() {
      if (mode === 'live' && run.status !== 'connected') { E.toast('No live data yet. Check the address in Data source settings, or switch to Demo mode.', 'error'); settingsBox.open = true; return; }
      Object.assign(run, { state: 'running', elapsed: 0, samples: [], startedAt: new Date().toISOString(), regionSec: {}, events: 0, hard: false });
      if (mode === 'demo') demo = new E.DemoFeed(organ.id, skillIn.value / 100, Date.now());
      lastTick = performance.now(); syncButtons(); srAnnounce.textContent = 'Session started.';
    }
    function togglePause() { run.state = run.state === 'running' ? 'paused' : 'running'; lastTick = performance.now(); syncButtons(); srAnnounce.textContent = run.state === 'paused' ? 'Paused.' : 'Resumed.'; }
    function toggleFreeze() { run.frozen = !run.frozen; btnFreeze.setAttribute('aria-pressed', String(run.frozen)); btnFreeze.textContent = run.frozen ? '❄ Unfreeze image' : '❄ Freeze image'; frozenBadge.hidden = !run.frozen; }
    function finish() {
      if (run.samples.length < 2) { E.toast('Nothing has been recorded yet. Press Start and scan first.', 'error'); return; }
      const session = E.buildSession({ user: user.id, organ: organ.id, startedAt: run.startedAt, samples: run.samples });
      E.Store.setPending(session); E.go('#/results/new');
    }
    function syncButtons() {
      const idle = run.state === 'idle';
      btnStart.disabled = !idle; btnPause.disabled = idle; btnFinish.disabled = idle;
      btnPause.textContent = run.state === 'paused' ? '▶ Resume' : '❚❚ Pause';
      modeSel.disabled = urlIn.disabled = connectBtn.disabled = skillIn.disabled = !idle;
      lockMsg.textContent = idle ? '' : 'Settings are locked while a session is in progress.';
    }

    // ---------- per-tick update ----------
    function currentData(dt) {
      if (mode === 'demo') {
        if (run.state === 'running' && demo) run.last = demo.step(dt);
        return run.last || { tracked: false, x: null, y: null, yaw: 0, pitch: 0, roll: 0, force: 0, region: '', image: '' };
      }
      if (!live || performance.now() - liveAt > E.CONFIG.feed.staleMs) {
        if (run.status === 'connected') statusChip.textContent = '◌ Live · connected, no data';
        return { tracked: false, x: null, y: null, yaw: 0, pitch: 0, roll: 0, force: 0, region: '', image: '' };
      }
      if (run.status === 'connected') statusChip.textContent = '● Live · connected';
      return live;
    }

    function tick() {
      const now = performance.now(), dt = Math.min(0.5, (now - lastTick) / 1000); lastTick = now;
      const d = currentData(dt), region = d.tracked ? canon(d) : '';
      const contact = d.force >= S.CONTACT, hard = d.force > S.TOO_HARD;

      if (run.state === 'running') {
        run.elapsed += dt;
        run.samples.push({ t: run.elapsed, x: d.x, y: d.y, yaw: d.yaw, pitch: d.pitch, roll: d.roll, force: d.force, region, image: d.image });
        if (contact && region) run.regionSec[region] = (run.regionSec[region] || 0) + dt;
        if (hard && !run.hard) { run.hard = true; run.events++; } else if (d.force < S.TOO_HARD * S.TOO_HARD_RESET) run.hard = false;
      }

      // map
      for (const [n, c] of Object.entries(cells)) {
        const here = n === region, reached = (run.regionSec[n] || 0) >= S.MIN_REGION_SECONDS, req = organ.required.includes(n);
        c.g.classList.toggle('active', here); c.g.classList.toggle('required', req); c.g.classList.toggle('reached', reached);
        c.g.classList.toggle('hard', here && hard);
        c.tag.textContent = (here ? '● Probe here' : '') + (here && (req || reached) ? ' · ' : '') + (reached ? '✓ Reached' : req ? '◎ Target' : '');
      }
      if (d.tracked && d.x != null) { probe.setAttribute('visibility', 'visible'); probe.setAttribute('transform', `translate(${d.x * 800} ${d.y * 400})`); } else probe.setAttribute('visibility', 'hidden');
      probe.classList.toggle('hard', hard);

      // prompt
      const target = organ.required.find((r) => (run.regionSec[r] || 0) < S.MIN_REGION_SECONDS);
      const msg = run.state === 'idle' ? `Press Start, then find the ${organ.required[0].toLowerCase()}` : target ? `Find the ${target.toLowerCase()}` : 'All target regions found. Finish when you are ready.';
      if (promptMain.textContent !== msg) { promptMain.textContent = msg; if (run.state !== 'idle') srAnnounce.textContent = msg; }
      promptSub.textContent = !d.tracked ? (mode === 'live' ? 'Probe not detected by the camera.' : 'Waiting to start.') :
        `Probe is over: ${region || 'outside the map'}${target && region === target && contact ? ` · hold steady ${Math.max(0, S.MIN_REGION_SECONDS - (run.regionSec[target] || 0)).toFixed(0)} s more` : ''}`;
      reachedList.replaceChildren(...organ.required.map((r) => { const ok = (run.regionSec[r] || 0) >= S.MIN_REGION_SECONDS; return h('li', { class: ok ? 'is-ok' : '' }, `${ok ? '✓' : '○'} ${r}`); }));

      // ultrasound image (stays on the last frame while frozen)
      if (!run.frozen) {
        const show = d.tracked && contact && d.image;
        E.Images.show(frame, show ? d.image : '', `Ultrasound image for the ${region || 'current'} position`);
        placeholder.textContent = show ? '' : !d.tracked ? 'Probe not tracked' : 'Press the probe gently on the body to see the image';
        placeholder.hidden = !!show;
        usLabel.textContent = show ? `Showing: ${region || 'current position'}` : '';
      }
      frame.classList.toggle('hard', hard);

      // meters
      mP.fill.style.width = pctOf(d.force, MAX_FORCE); mP.val.textContent = Math.round(d.force);
      const ps = E.pressureState(d.force);
      mP.node.dataset.state = ps; mP.state.textContent = ps === 'hard' ? '⚠ Too much pressure' : ps === 'good' ? '✓ Good pressure' : '○ No contact';
      for (const [m, v, target] of [[mPitch, d.pitch, S.TARGET_PITCH], [mRoll, d.roll, S.TARGET_ROLL]]) {
        const off = Math.abs(v - target) > S.TILT_TOLERANCE_DEG;
        m.fill.style.left = '50%'; setCentered(m.fill, v, TILT_RANGE);
        m.val.textContent = `${v.toFixed(1)}°`; m.node.dataset.state = off ? 'off' : 'good';
        m.state.textContent = off ? `⚠ Outside ±${S.TILT_TOLERANCE_DEG}° of target` : '✓ On target';
      }
      setCentered(mYaw.fill, d.yaw, 180); mYaw.val.textContent = `${d.yaw.toFixed(0)}°`; mYaw.state.textContent = 'Heading (for information)';

      // warning
      const wtxt = hard ? '⚠ Too much pressure. Ease off the probe.' : '';
      if (warn.textContent !== wtxt) warn.textContent = wtxt;
      warn.classList.toggle('on', hard);
      eventsChip.textContent = `Pressure warnings: ${run.events}`;
      timer.textContent = E.mmss(run.elapsed) + (run.state === 'paused' ? ' (paused)' : '');
    }
    /** Fill a centred meter from the middle towards `v` (range ±max). */
    function setCentered(fill, v, max) {
      const p = E.clamp(v / max, -1, 1) * 50;
      fill.style.left = `${p < 0 ? 50 + p : 50}%`; fill.style.width = `${Math.abs(p)}%`;
    }

    applyMode(); syncButtons();
    const timerId = setInterval(tick, 100);
    onLeave(() => { clearInterval(timerId); run.feed?.stop(); });
    tick();

    return h('div', null,
      E.pageHead(`Practice: ${organ.name}`, `Required regions: ${organ.required.join(', ')} · target time ${E.mmss(organ.expectedSec)}`),
      srAnnounce, prompt, warn,
      h('section', { class: 'grid two' }, mapCard, usCard), meters, controls, settingsBox);
  });
})(globalThis.Echo = globalThis.Echo || {});
