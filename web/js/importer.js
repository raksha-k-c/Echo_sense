/* Import of session logs written by ultrasound.py (press "l" to log).
 * Columns: t, tracked, x, y, yaw, pitch, roll, force, contact, zone, image */
(function (E) {
  const REQUIRED = ['t', 'x', 'y', 'yaw', 'pitch', 'roll', 'force', 'zone'];

  E.parseSessionCSV = (text) => {
    const rows = E.parseCSV(text);
    if (rows.length < 2) throw new Error('The file has no data rows.');
    const head = rows[0].map((c) => c.trim().toLowerCase());
    const missing = REQUIRED.filter((c) => !head.includes(c));
    if (missing.length) throw new Error(`This does not look like a session log. Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
    const col = (r, name) => { const i = head.indexOf(name); return i < 0 ? '' : (r[i] ?? '').trim(); };
    const known = new Map(E.CONFIG.regions.map((r) => [r.name.toLowerCase(), r.name]));
    const samples = [], unknown = new Set(); let skipped = 0;
    for (const r of rows.slice(1)) {
      const t = parseFloat(col(r, 't')), force = parseFloat(col(r, 'force')), pitch = parseFloat(col(r, 'pitch')), roll = parseFloat(col(r, 'roll'));
      if (![t, force, pitch, roll].every(Number.isFinite)) { skipped++; continue; }
      const xs = col(r, 'x'), ys = col(r, 'y'), x = xs === '' ? null : parseFloat(xs), y = ys === '' ? null : parseFloat(ys);
      const tracked = head.includes('tracked') ? col(r, 'tracked') !== '0' : x !== null;
      const zone = col(r, 'zone');
      let region = '';
      if (zone && tracked) { region = known.get(zone.toLowerCase()) || ''; if (!region) unknown.add(zone); }
      samples.push({ t, x: Number.isFinite(x) ? x : null, y: Number.isFinite(y) ? y : null, yaw: parseFloat(col(r, 'yaw')) || 0, pitch, roll, force, region, image: col(r, 'image') });
    }
    if (samples.length < 2) throw new Error('Fewer than two valid rows were found. Check that the columns hold numbers.');
    samples.sort((a, b) => a.t - b.t);
    const t0 = samples[0].t, startedAt = t0 > 1e9 ? new Date(t0 * 1000).toISOString() : new Date().toISOString();
    samples.forEach((s) => { s.t -= t0; });
    return { samples, skipped, unknown: [...unknown], startedAt };
  };

  /** Best-matching organ exercise for a log: most required regions reached, then most time in them. */
  E.guessOrgan = (samples) => {
    let best = null;
    for (const o of E.CONFIG.organs) {
      const a = E.analyse(samples, o.id), secs = o.required.reduce((s, r) => s + (a.regions[r] || 0), 0);
      if (!best || a.stats.coverage > best.cov || (a.stats.coverage === best.cov && secs > best.secs)) best = { id: o.id, cov: a.stats.coverage, secs };
    }
    return best.id;
  };
})(globalThis.Echo = globalThis.Echo || {});
