/* Ultrasound images.
 * Real images come from the dataset folder through serve.py (/api/dataset, /dataset/...).
 * If that is not available (page opened as a plain file), an illustrative picture is drawn
 * on a canvas so every screen still works. Image ids look like "Liver/liv_0100.jpg".
 */
(function (E) {
  const PROC_VARIANTS = 12;
  const procCache = new Map();

  // Rough anatomy per organ for the illustrative pictures: ellipses {cx, cy, rx, ry} in 0..1 fan space, plus echo level.
  const SHAPES = {
    Liver:       { base: 95, blobs: [{ cx: .5, cy: .55, rx: .42, ry: .3, v: 105 }, { cx: .35, cy: .5, rx: .05, ry: .12, v: 20 }, { cx: .62, cy: .62, rx: .04, ry: .1, v: 20 }] },
    Gallbladder: { base: 85, blobs: [{ cx: .5, cy: .5, rx: .15, ry: .22, v: 8 }, { cx: .5, cy: .82, rx: .15, ry: .1, v: 150 }] },
    Kidney:      { base: 70, blobs: [{ cx: .5, cy: .52, rx: .3, ry: .27, v: 55 }, { cx: .5, cy: .52, rx: .12, ry: .13, v: 190 }, { cx: .4, cy: .48, rx: .04, ry: .05, v: 10 }] },
    Spleen:      { base: 60, blobs: [{ cx: .5, cy: .5, rx: .38, ry: .2, v: 100 }, { cx: .5, cy: .8, rx: .4, ry: .05, v: 200 }] },
    Pancreas:    { base: 80, blobs: [{ cx: .5, cy: .5, rx: .35, ry: .09, v: 130 }, { cx: .38, cy: .65, rx: .1, ry: .04, v: 10 }] },
    Pelvis:      { base: 70, blobs: [{ cx: .5, cy: .5, rx: .3, ry: .25, v: 5 }, { cx: .5, cy: .8, rx: .3, ry: .1, v: 150 }] },
    Ovaries:     { base: 75, blobs: [{ cx: .5, cy: .5, rx: .2, ry: .13, v: 100 }, { cx: .45, cy: .48, rx: .03, ry: .03, v: 8 }, { cx: .55, cy: .52, rx: .035, ry: .03, v: 8 }, { cx: .5, cy: .44, rx: .025, ry: .025, v: 8 }] }
  };

  function drawProcedural(path) {
    if (procCache.has(path)) return procCache.get(path);
    const W = 320, H = 260, organ = path.split('/')[0], shape = SHAPES[organ] || SHAPES.Liver;
    const rnd = E.rng(E.hashStr(path));
    const jx = (rnd() - 0.5) * 0.08, jy = (rnd() - 0.5) * 0.06;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - W / 2, dy = y + 20, r = Math.hypot(dx, dy), ang = Math.atan2(dx, dy);
      let v = 0;
      if (Math.abs(ang) < 0.72 && r < H + 10 && r > 30) {
        const u = x / W, w = y / H;
        v = shape.base;
        for (const b of shape.blobs) {
          const d = ((u - b.cx - jx) / b.rx) ** 2 + ((w - b.cy - jy) / b.ry) ** 2;
          if (d < 1) v = v + (b.v - v) * Math.min(1, (1 - d) * 3);
        }
        v = v * (0.55 + 0.9 * rnd() ** 1.6) * (1 - 0.35 * (r / H));   // speckle + depth falloff
      }
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    procCache.set(path, c);
    return c;
  }

  E.Images = {
    available: false, loaded: false, index: {}, byName: {},

    /** Load the dataset index once. Never throws: failure means "use illustrative images". */
    async load() {
      if (this.loaded) return this.available;
      try {
        const res = await fetch('/api/dataset', { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status);
        this.index = await res.json();
        for (const list of Object.values(this.index)) for (const p of list) this.byName[p.split('/').pop()] = p;
        this.available = Object.keys(this.index).length > 0;
      } catch { this.available = false; }
      this.loaded = true;
      return this.available;
    },
    files(organ) {
      return this.index[organ]?.length ? this.index[organ]
        : Array.from({ length: PROC_VARIANTS }, (_, i) => `${organ}/proc_${String(i).padStart(2, '0')}`);
    },
    /** Image id for a position s (0..1) along a sweep through an organ. */
    pick(organ, s) { const f = this.files(organ); return f[Math.round(E.clamp(s, 0, 1) * (f.length - 1))]; },
    /** Accepts "Liver/liv_01.jpg", a bare file name, or empty. */
    resolve(name) { return !name ? '' : name.includes('/') ? name.split('\\').join('/') : (this.byName[name] || name); },

    /** An element showing the image (img for real files, canvas for illustrative ones). */
    element(path, alt) {
      path = this.resolve(path);
      const fallback = () => { const c = drawProcedural(path.includes('/') ? path : 'Liver/' + path); const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); k.setAttribute('role', 'img'); k.setAttribute('aria-label', alt + ' (illustrative image)'); return k; };
      if (!this.available) return fallback();
      const img = E.h('img', { src: '/dataset/' + encodeURI(path), alt, loading: 'lazy' });
      img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
      return img;
    },
    /** Replace the content of `box` only when the image actually changed (cheap to call every tick). */
    show(box, path, alt) {
      if (box.dataset.path === (path || '')) return;
      box.dataset.path = path || '';
      box.replaceChildren(...(path ? [this.element(path, alt)] : []));
    }
  };
})(globalThis.Echo = globalThis.Echo || {});
