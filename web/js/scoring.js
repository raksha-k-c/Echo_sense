/* Session analysis and scoring. All thresholds come from Echo.CONFIG.scoring. */
(function (E) {
  const C = () => E.CONFIG.scoring;
  E.organById = (id) => E.CONFIG.organs.find((o) => o.id === id);
  E.regionAt = (x, y) => {
    if (x == null || y == null) return null;
    const r = E.CONFIG.regions.find((r) => x >= r.box[0] && x < r.box[2] + (r.box[2] >= 1 ? 1e-9 : 0) && y >= r.box[1] && y < r.box[3] + (r.box[3] >= 1 ? 1e-9 : 0));
    return r ? r.name : null;
  };
  E.band = (score) => C().bands.find((b) => score >= b.min);

  /** Pressure state of one force reading. */
  E.pressureState = (force) => force > C().TOO_HARD ? 'hard' : force >= C().CONTACT ? 'good' : 'none';

  /**
   * Analyse a list of samples {t, x, y, yaw, pitch, roll, force, region} (t in seconds, ascending).
   * Each sample is weighted by the time until the next one (gaps are capped), so uneven sample
   * rates give the same result. Returns the stats stored with the session.
   */
  E.analyse = (samples, organId) => {
    const S = C(), organ = E.organById(organId);
    const regions = {}, pressureByRegion = {};
    let total = 0, contactT = 0, pressureOk = 0, tiltOk = 0, tiltErrSum = 0, pitchBad = 0, rollBad = 0, events = 0, hard = false;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const dt = i < samples.length - 1 ? E.clamp(samples[i + 1].t - s.t, 0, S.MAX_SAMPLE_GAP_SEC) : 0;
      const contact = s.force >= S.CONTACT;
      const inRange = contact && s.force <= S.TOO_HARD;
      total += dt;
      if (inRange) pressureOk += dt;
      // pressure events: rising edge above TOO_HARD, re-armed once force falls below the reset level
      if (s.force > S.TOO_HARD && !hard) { hard = true; events++; if (s.region) pressureByRegion[s.region] = (pressureByRegion[s.region] || 0) + 1; }
      else if (s.force < S.TOO_HARD * S.TOO_HARD_RESET) hard = false;
      if (contact) {
        const dp = Math.abs(s.pitch - S.TARGET_PITCH), dr = Math.abs(s.roll - S.TARGET_ROLL);
        contactT += dt;
        tiltErrSum += ((dp + dr) / 2) * dt;
        if (dp > S.TILT_TOLERANCE_DEG) pitchBad += dt;
        if (dr > S.TILT_TOLERANCE_DEG) rollBad += dt;
        if (dp <= S.TILT_TOLERANCE_DEG && dr <= S.TILT_TOLERANCE_DEG) tiltOk += dt;
        if (s.region) regions[s.region] = (regions[s.region] || 0) + dt;
      }
    }
    const duration = samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 0;
    const reached = organ.required.filter((r) => (regions[r] || 0) >= S.MIN_REGION_SECONDS);
    const missed = organ.required.filter((r) => !reached.includes(r));
    const coverage = reached.length / organ.required.length;
    const pressureShare = total ? pressureOk / total : 0;
    const tiltShare = total ? tiltOk / total : 0;
    const over = organ.expectedSec * (S.TIME_OVERRUN_FACTOR - 1);
    const timeShare = duration <= organ.expectedSec ? 1 : E.clamp(1 - (duration - organ.expectedSec) / over, 0, 1);
    const w = S.weights;
    const score = Math.round(100 * (w.coverage * coverage + w.pressure * pressureShare + w.tilt * tiltShare + w.time * timeShare));
    for (const k of Object.keys(regions)) regions[k] = Math.round(regions[k] * 10) / 10;
    return {
      score, duration: Math.round(duration), regions, reached, missed, pressureEvents: events, pressureByRegion,
      avgTiltError: Math.round((contactT ? tiltErrSum / contactT : 0) * 10) / 10,
      stats: {
        coverage, pressureShare, tiltShare, timeShare,
        contactShare: total ? contactT / total : 0,
        pitchBadShare: total ? pitchBad / total : 0, rollBadShare: total ? rollBad / total : 0
      }
    };
  };

  /** Plain-language "Areas to practise", written from the analysed data. */
  E.advice = (session) => {
    const S = C(), organ = E.organById(session.organ), st = session.stats, tips = [];
    for (const r of session.missed || []) tips.push(`The ${r.toLowerCase()} window was not reached. Hold light, steady contact there for at least ${S.MIN_REGION_SECONDS} seconds.`);
    const worst = Object.entries(session.pressureByRegion || {}).sort((a, b) => b[1] - a[1])[0];
    if (worst) tips.push(`Too much pressure in the ${worst[0].toLowerCase()} window (${worst[1]} time${worst[1] > 1 ? 's' : ''}). Ease off until the image just appears.`);
    else if (session.pressureEvents) tips.push(`Too much pressure ${session.pressureEvents} time${session.pressureEvents > 1 ? 's' : ''}, mostly while moving between windows. Lighten your grip when sliding.`);
    if (st.contactShare < 0.7) tips.push(`The probe lost contact for ${E.pct(1 - st.contactShare)} of the session. Keep gentle contact while you slide.`);
    if (st.tiltShare < 0.75) {
      const axis = st.pitchBadShare > st.rollBadShare * 1.3 ? 'pitch (rocking forward/back)' : st.rollBadShare > st.pitchBadShare * 1.3 ? 'roll (tilting side to side)' : 'pitch and roll';
      tips.push(`Tilt was outside ±${S.TILT_TOLERANCE_DEG}° for ${E.pct(1 - st.tiltShare)} of the session, mainly ${axis}. Keep the probe closer to upright.`);
    }
    if (session.duration > organ.expectedSec) tips.push(`The scan took ${E.mmss(session.duration - organ.expectedSec)} longer than the expected ${E.mmss(organ.expectedSec)}. Plan your route before you start.`);
    if (!tips.length) tips.push('Nothing stood out. Try a more advanced organ, or aim for an even steadier hand.');
    return tips;
  };

  /** Build the stored session record from samples. */
  E.buildSession = ({ user, organ, startedAt, samples }) => {
    const a = E.analyse(samples, organ);
    // Downsample for storage (analysis above used every sample).
    const keep = []; let last = -Infinity;
    for (const s of samples) if (s.t - last >= E.CONFIG.recordIntervalSec) { keep.push(s); last = s.t; }
    const step = Math.ceil(keep.length / E.CONFIG.maxStoredSamples);
    const stored = keep.filter((_, i) => i % step === 0).map((s) => ({
      t: +s.t.toFixed(1), x: s.x == null ? null : +s.x.toFixed(3), y: s.y == null ? null : +s.y.toFixed(3),
      yaw: +s.yaw.toFixed(1), pitch: +s.pitch.toFixed(1), roll: +s.roll.toFixed(1), force: Math.round(s.force), region: s.region || ''
    }));
    return {
      id: E.uid(), user, organ, startedAt, duration: a.duration, score: a.score, regions: a.regions,
      reached: a.reached, missed: a.missed, pressureEvents: a.pressureEvents, pressureByRegion: a.pressureByRegion,
      avgTiltError: a.avgTiltError, stats: a.stats, samples: stored
    };
  };
})(globalThis.Echo = globalThis.Echo || {});
