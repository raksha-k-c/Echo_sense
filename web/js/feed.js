/* Live data source: a WebSocket (ws://…) pushing JSON, or an HTTP endpoint (http://…) polled for JSON.
 * Expected fields: x, y (0..1), yaw, pitch, roll, force, region, image  (optional: tracked, stale). */
(function (E) {
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

  function normalise(m) {
    const hasPos = m.x !== null && m.x !== undefined && m.x !== '' && m.y !== null && m.y !== undefined && m.y !== '';
    const x = hasPos ? E.clamp(num(m.x), 0, 1) : null, y = hasPos ? E.clamp(num(m.y), 0, 1) : null;
    const tracked = m.tracked === undefined ? hasPos : !!Number(m.tracked) || m.tracked === true;
    return {
      tracked: tracked && !m.stale, stale: !!m.stale, x, y,
      yaw: num(m.yaw), pitch: num(m.pitch), roll: num(m.roll), force: Math.max(0, num(m.force)),
      region: String(m.region ?? m.zone ?? '') || (x === null ? '' : E.regionAt(x, y) || ''),
      image: String(m.image ?? '')
    };
  }

  class LiveFeed {
    constructor(url, onData, onStatus) { this.url = url.trim(); this.onData = onData; this.onStatus = onStatus; this.stopped = false; }
    start() {
      if (!this.url) { this.onStatus('error', 'Enter the address of the live data source first.'); return; }
      this.onStatus('connecting', `Connecting to ${this.url}…`);
      if (/^wss?:\/\//i.test(this.url)) this.openSocket(); else if (/^https?:\/\//i.test(this.url)) this.poll();
      else this.onStatus('error', 'The address must start with ws://, wss://, http:// or https://');
    }
    openSocket() {
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { this.onStatus('error', `Invalid address: ${e.message}`); return; }
      this.ws = ws;
      ws.onopen = () => this.onStatus('connected', `Connected to ${this.url}`);
      ws.onmessage = (ev) => { try { this.onData(normalise(JSON.parse(ev.data))); } catch { /* ignore a malformed frame */ } };
      ws.onerror = () => this.onStatus('error', `Cannot reach ${this.url}. Is the data bridge running?`);
      ws.onclose = () => { if (!this.stopped) { this.onStatus('error', `Connection to ${this.url} lost. Retrying…`); this.timer = setTimeout(() => this.openSocket(), 2000); } };
    }
    poll() {
      let failed = 0;
      const once = async () => {
        if (this.stopped) return;
        try {
          const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 1500);
          const res = await fetch(this.url, { cache: 'no-store', signal: ctl.signal }); clearTimeout(to);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.onData(normalise(await res.json()));
          failed = 0; this.onStatus('connected', `Connected to ${this.url}`);
        } catch (e) {
          if (++failed >= 3) this.onStatus('error', `Cannot reach ${this.url} (${e.message}). Is the data bridge running?`);
        }
        if (!this.stopped) this.timer = setTimeout(once, E.CONFIG.feed.pollMs);
      };
      once();
    }
    stop() { this.stopped = true; clearTimeout(this.timer); try { this.ws?.close(); } catch { /* already closed */ } }
  }
  E.LiveFeed = LiveFeed;
  E.normaliseFeed = normalise;
})(globalThis.Echo = globalThis.Echo || {});
