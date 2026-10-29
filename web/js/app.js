/* App shell: sidebar, theme, hash router. Views register themselves with Echo.view(name, fn). */
(function (E) {
  const { h } = E;
  const routes = {};
  let leaveFns = [], shell = null, renderToken = 0;

  E.view = (name, fn) => { routes[name] = fn; };
  E.go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

  // ---------- theme ----------
  const media = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const t = E.Store.settings().theme;
    document.documentElement.dataset.theme = t === 'auto' ? (media.matches ? 'dark' : 'light') : t;
    const btn = document.getElementById('theme-btn');
    if (btn) { const dark = document.documentElement.dataset.theme === 'dark'; btn.textContent = dark ? '☀ Light mode' : '☾ Dark mode'; btn.setAttribute('aria-pressed', String(dark)); }
  }
  media.addEventListener('change', applyTheme);
  E.toggleTheme = () => { E.Store.saveSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }); applyTheme(); };

  // ---------- shell ----------
  const NAV = [
    ['dashboard', '▦', 'Dashboard'], ['train', '◎', 'Select training'], ['practice', '▶', 'Practice'],
    ['results', '✔', 'Session results'], ['progress', '↗', 'My progress'], ['library', '▤', 'Learning library']
  ];
  function buildShell(user) {
    const nav = h('nav', { 'aria-label': 'Main' }, h('ul', null, NAV.map(([id, icon, label]) =>
      h('li', null, h('a', { href: `#/${id}`, 'data-nav': id }, h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, icon), label)))));
    const side = h('aside', { class: 'sidebar' },
      h('a', { class: 'brand', href: '#/dashboard' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, '◉'), 'EchoSense'),
      nav,
      h('div', { class: 'side-foot' },
        h('div', { class: 'who' }, h('strong', null, user.name), h('small', { class: 'muted' }, user.email)),
        h('button', { id: 'theme-btn', class: 'btn ghost', onClick: E.toggleTheme }, ''),
        h('button', { class: 'btn ghost', onClick: () => { E.Store.logOut(); E.go('#/login'); } }, 'Log out')));
    const main = h('main', { id: 'main', tabindex: '-1' });
    shell = { root: h('div', { class: 'shell' }, side, main), main };
    return shell;
  }

  async function render() {
    const token = ++renderToken;
    leaveFns.forEach((f) => { try { f(); } catch { /* ignore cleanup errors */ } }); leaveFns = [];
    const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/');
    const user = E.Store.currentUser(), app = document.getElementById('app');
    if (!user && name !== 'login') { location.hash = '#/login'; return; }
    if (user && (name === 'login' || !name)) { location.hash = '#/dashboard'; return; }
    const fn = routes[name];
    const ctx = { params, user, onLeave: (f) => leaveFns.push(f) };
    if (!fn) { app.replaceChildren(E.emptyState('?', 'Page not found', 'That address does not exist.', h('a', { class: 'btn primary', href: '#/dashboard' }, 'Go to dashboard'))); return; }

    if (name === 'login') { shell = null; app.replaceChildren(h('div', { class: 'login-wrap' }, await fn(ctx))); document.title = 'Log in · EchoSense'; return; }
    if (!shell || shell.user !== user.id) { buildShell(user).user = user.id; app.replaceChildren(shell.root); applyTheme(); }
    shell.root.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    shell.main.replaceChildren(E.skeleton(4));
    try {
      const node = await fn(ctx);
      if (token !== renderToken) return;                     // user navigated away while loading
      shell.main.replaceChildren(node);
    } catch (e) {
      console.error(e);
      if (token === renderToken) shell.main.replaceChildren(E.errorState(e.message || String(e), render));
    }
    const hd = shell.main.querySelector('h1'); document.title = `${hd ? hd.textContent : 'EchoSense'} · EchoSense`;
    shell.main.focus({ preventScroll: true }); scrollTo(0, 0);
  }

  addEventListener('hashchange', render);
  addEventListener('DOMContentLoaded', () => { applyTheme(); render(); });
  E.pageHead = (title, sub, ...actions) => h('header', { class: 'page-head' },
    h('div', null, h('h1', null, title), sub ? h('p', { class: 'muted' }, sub) : null),
    actions.length ? h('div', { class: 'row' }, actions) : null);
})(globalThis.Echo = globalThis.Echo || {});
