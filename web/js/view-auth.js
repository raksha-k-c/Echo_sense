/* Screen 1: Login / Sign up */
(function (E) {
  const { h } = E;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  E.view('login', () => {
    let mode = 'login';
    const box = h('div', { class: 'card login-card' });

    function draw() {
      const signup = mode === 'signup';
      const field = (id, label, type, extra = {}) => {
        const err = h('p', { class: 'field-error', id: `${id}-err`, role: 'alert' });
        const input = h('input', { id, name: id, type, 'aria-describedby': `${id}-err`, autocomplete: extra.autocomplete, required: true, ...extra.attrs });
        return { input, err, node: h('div', { class: 'field' }, h('label', { for: id }, label), extra.wrap ? extra.wrap(input) : input, err) };
      };
      const name = field('name', 'Full name', 'text', { autocomplete: 'name' });
      const email = field('email', 'Email', 'email', { autocomplete: 'email' });
      const toggle = h('button', { type: 'button', class: 'btn ghost small', 'aria-pressed': 'false', onClick: () => {
        const show = pw.input.type === 'password'; pw.input.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Hide' : 'Show'; toggle.setAttribute('aria-pressed', String(show)); toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      } }, 'Show');
      toggle.setAttribute('aria-label', 'Show password');
      const pw = field('password', 'Password', 'password', { autocomplete: signup ? 'new-password' : 'current-password', wrap: (i) => h('div', { class: 'pw-row' }, i, toggle) });
      const remember = h('input', { type: 'checkbox', id: 'remember', checked: true });
      const formErr = h('p', { class: 'form-error', role: 'alert' });
      const submit = h('button', { class: 'btn primary wide', type: 'submit' }, signup ? 'Create account' : 'Log in');

      const check = () => {
        let ok = true;
        const set = (f, msg) => { f.err.textContent = msg ? '⚠ ' + msg : ''; f.input.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (msg) ok = false; };
        if (signup) set(name, name.input.value.trim().length < 2 ? 'Enter your name.' : '');
        set(email, !EMAIL.test(email.input.value.trim()) ? 'Enter a valid email address, like name@example.com.' : '');
        set(pw, signup && pw.input.value.length < 8 ? 'Use at least 8 characters.' : !pw.input.value ? 'Enter your password.' : '');
        return ok;
      };
      const form = h('form', { novalidate: true, onSubmit: async (ev) => {
        ev.preventDefault(); formErr.textContent = '';
        if (!check()) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
        submit.disabled = true; submit.textContent = 'Please wait…';
        try {
          const rem = remember.checked;
          if (signup) await E.Store.signUp(name.input.value, email.input.value, pw.input.value, rem);
          else await E.Store.logIn(email.input.value, pw.input.value, rem);
          E.go('#/dashboard');
        } catch (e) { formErr.textContent = '⚠ ' + e.message; submit.disabled = false; submit.textContent = signup ? 'Create account' : 'Log in'; }
      } },
        signup ? name.node : null, email.node, pw.node,
        h('label', { class: 'check' }, remember, ' Remember me on this device'),
        formErr, submit);
      [name, email, pw].forEach((f) => f.input.addEventListener('blur', () => f.input.value && check()));

      const tab = (m, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === m), class: 'tab', onClick: () => { mode = m; draw(); } }, label);
      const demo = E.CONFIG.demoAccount;
      box.replaceChildren(
        h('div', { class: 'login-brand' }, h('span', { class: 'logo big', 'aria-hidden': 'true' }, '◉'), h('h1', null, 'EchoSense'), h('p', { class: 'muted' }, 'Ultrasound probe handling trainer')),
        h('div', { class: 'tabs', role: 'tablist' }, tab('login', 'Log in'), tab('signup', 'Create account')),
        form,
        h('div', { class: 'divider' }, h('span', null, 'or')),
        h('button', { class: 'btn wide', type: 'button', onClick: async () => {
          try { await E.Store.ensureDemo(); await E.Store.logIn(demo.email, demo.password, false); E.go('#/dashboard'); }
          catch (e) { formErr.textContent = '⚠ ' + e.message; }
        } }, 'Explore with the demo account'),
        h('p', { class: 'muted small-text' }, 'Accounts and sessions are stored only in this browser.'));
      (signup ? name.input : email.input).focus();
    }
    draw();
    return box;
  });
})(globalThis.Echo = globalThis.Echo || {});
