/* Demo-mode simulator and sample-data generator.
 * DemoFeed walks a virtual probe through the organ's required regions. `skill` (0..1) controls
 * how steady the tilt is, how often pressure spikes happen and how long the trainee dwells.
 * The same simulator creates the sample history for the demo account.
 */
(function (E) {
  class DemoFeed {
    constructor(organId, skill = 0.7, seed = Date.now()) {
      this.organ = E.organById(organId);
      this.skill = skill;
      this.rnd = E.rng(seed);
      this.route = this.organ.required.slice();
      // a weaker trainee sometimes never gets to the last window
      this.skipLast = skill < 0.3 && this.rnd() < 0.6 && this.route.length > 1;
      this.stage = -1; this.t = 0; this.done = false;
      this.x = 0.5; this.y = 0.5; this.yaw = 0; this.pitch = 0; this.roll = 0;
      this.spike = 0; this.phase = 'travel'; this.dwellLeft = 0;
      this.nextStage();
    }
    gauss() { return Math.sqrt(-2 * Math.log(this.rnd() || 1e-9)) * Math.cos(2 * Math.PI * this.rnd()); }
    regionBox(name) { return E.CONFIG.regions.find((r) => r.name === name).box; }
    nextStage() {
      this.stage++;
      if (this.stage >= this.route.length) { this.done = true; this.stage = this.route.length - 1; this.phase = 'dwell'; this.dwellLeft = 1e9; return; }
      const b = this.regionBox(this.route[this.stage]);
      this.cx = b[0] + (b[2] - b[0]) * 0.5; this.cy = b[1] + (b[3] - b[1]) * (0.35 + this.rnd() * 0.3);
      this.amp = (b[2] - b[0]) * 0.28;
      const last = this.stage === this.route.length - 1 && this.skipLast;
      const base = this.organ.expectedSec / this.route.length * (0.5 + (1 - this.skill) * 1.4);
      this.dwell = last ? 0.8 : base * (0.8 + this.rnd() * 0.4);
      this.phase = 'travel';
    }
    step(dt) {
      this.t += dt;
      const sk = this.skill;
      let force;
      if (this.phase === 'travel') {
        const dx = this.cx - this.x, dy = this.cy - this.y, d = Math.hypot(dx, dy), v = (0.28 + 0.1 * sk) * dt;
        if (d <= v) { this.x = this.cx; this.y = this.cy; this.phase = 'dwell'; this.dwellLeft = this.dwell; }
        else { this.x += dx / d * v; this.y += dy / d * v; }
        force = sk > 0.6 ? 130 + this.rnd() * 120 : 380 + this.rnd() * 200;   // skilled trainees lift the probe to slide
      } else {
        this.x = this.cx + this.amp * Math.sin(this.t * 0.45 + this.stage);
        this.y = this.cy + 0.04 * Math.sin(this.t * 0.8);
        this.dwellLeft -= dt;
        force = 950 + 350 * Math.sin(this.t * 0.7) + this.gauss() * (1 - sk) * 700;
        if (this.dwellLeft <= 0 && !this.done) this.nextStage();
      }
      if (this.spike > 0) { force = 2650 + this.rnd() * 500; this.spike -= dt; }
      else if (this.rnd() < (1 - sk) * 0.1 * dt && this.phase === 'dwell') this.spike = 0.6 + this.rnd() * 0.8;
      // tilt: mean-reverting random walk around the target; steadier with skill
      const sd = 6 + (1 - sk) * 24, theta = 0.5;
      this.pitch += -theta * this.pitch * dt + sd * Math.sqrt(2 * theta * dt) * this.gauss();
      this.roll += -theta * this.roll * dt + sd * Math.sqrt(2 * theta * dt) * this.gauss();
      this.yaw += 3 * Math.sqrt(dt) * this.gauss() - 0.05 * this.yaw * dt;
      const region = E.regionAt(this.x, this.y);
      let image = '';
      if (region) {
        const r = E.CONFIG.regions.find((r) => r.name === region);
        image = E.Images.pick(r.dataset, (this.x - r.box[0]) / (r.box[2] - r.box[0]));
      }
      return { tracked: true, x: this.x, y: this.y, yaw: this.yaw, pitch: this.pitch, roll: this.roll, force: Math.max(0, force), region: region || '', image };
    }
  }
  E.DemoFeed = DemoFeed;

  /** Twelve-plus weeks of believable history: skill improves with some noise. */
  const SEED = 42;
  E.generateSampleSessions = (userId, count = 14) => {
    const rnd = E.rng(2024), order = ['liver', 'gallbladder', 'liver', 'kidney', 'spleen', 'gallbladder', 'liver', 'kidney', 'spleen', 'liver', 'gallbladder', 'kidney', 'spleen', 'liver'];
    const out = [];
    for (let i = 0; i < count; i++) {
      const skill = E.clamp(0.0 + 0.72 * (i / (count - 1)) + (rnd() - 0.5) * 0.14, 0.05, 0.95);
      const organ = order[i % order.length];
      const feed = new DemoFeed(organ, skill, SEED + i);
      const samples = [];
      let t = 0, extra = 0;
      while (t < 600 && extra < 3) { samples.push({ t, ...feed.step(0.5) }); t += 0.5; if (feed.done) extra += 0.5; }
      // spread over about five weeks, at plausible daytime hours; the newest session is from earlier today
      const when = new Date();
      if (i === count - 1) when.setHours(when.getHours() - 3);
      else { when.setDate(when.getDate() - Math.round((count - 1 - i) * 2.4)); when.setHours(8 + Math.floor(rnd() * 10), Math.floor(rnd() * 60), 0, 0); }
      const started = when.toISOString();
      out.push(E.buildSession({ user: userId, organ, startedAt: started, samples }));
    }
    return out;
  };
})(globalThis.Echo = globalThis.Echo || {});
