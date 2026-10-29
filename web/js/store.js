/* Local persistence (browser localStorage): users, sessions, settings.
 * NOTE: this is a single-machine training tool. Passwords are salted+hashed, but there is no server,
 * so do not treat it as secure authentication.
 */
(function (E) {
  const K = { users: 'echosense.users', sessions: 'echosense.sessions', auth: 'echosense.auth', settings: 'echosense.settings' };
  const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch { E.toast('Could not save: browser storage is full or blocked.', 'error'); return false; }
  };

  async function hash(salt, pw) {
    const data = new TextEncoder().encode(salt + ':' + pw);
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return 'x' + E.hashStr(salt + pw).toString(16);   // fallback when not in a secure context
  }

  E.Store = {
    settings() { return { theme: 'auto', mode: E.CONFIG.feed.defaultMode, feedUrl: E.CONFIG.feed.defaultUrl, skill: 0.7, ...read(K.settings, {}) }; },
    saveSettings(patch) { write(K.settings, { ...this.settings(), ...patch }); },

    // ----- accounts -----
    users: () => read(K.users, []),
    async signUp(name, email, password, remember) {
      email = email.trim().toLowerCase();
      const users = this.users();
      if (users.some((u) => u.email === email)) throw new Error('An account with this email already exists. Try logging in.');
      const salt = E.uid();
      const user = { id: E.uid(), name: name.trim(), email, salt, hash: await hash(salt, password), created: new Date().toISOString() };
      users.push(user);
      if (!write(K.users, users)) throw new Error('Could not create the account (storage unavailable).');
      this.setAuth(user.id, remember);
      return user;
    },
    async logIn(email, password, remember) {
      email = email.trim().toLowerCase();
      const user = this.users().find((u) => u.email === email);
      if (!user || user.hash !== await hash(user.salt, password)) throw new Error('Email or password is incorrect.');
      this.setAuth(user.id, remember);
      return user;
    },
    setAuth(id, remember) {
      localStorage.removeItem(K.auth); sessionStorage.removeItem(K.auth);
      (remember ? localStorage : sessionStorage).setItem(K.auth, id);
    },
    logOut() { localStorage.removeItem(K.auth); sessionStorage.removeItem(K.auth); sessionStorage.removeItem('echosense.pending'); },
    currentUser() {
      const id = sessionStorage.getItem(K.auth) || localStorage.getItem(K.auth);
      return id ? this.users().find((u) => u.id === id) || null : null;
    },
    /** Creates the demo account (with a realistic history) the first time it is needed. */
    async ensureDemo() {
      const d = E.CONFIG.demoAccount;
      if (!this.users().some((u) => u.email === d.email)) {
        const u = await this.signUp(d.name, d.email, d.password, false);
        this.addSessions(E.generateSampleSessions(u.id));
      }
    },

    // ----- sessions -----
    allSessions: () => read(K.sessions, []),
    sessionsFor(userId) { return this.allSessions().filter((s) => s.user === userId).sort((a, b) => a.startedAt.localeCompare(b.startedAt)); },
    getSession(id) { return this.allSessions().find((s) => s.id === id) || null; },
    addSessions(list) { return write(K.sessions, [...this.allSessions(), ...list]); },
    saveSession(s) { return this.getSession(s.id) ? true : this.addSessions([s]); },

    // ----- unsaved result waiting on the Results screen -----
    setPending(s) { try { sessionStorage.setItem('echosense.pending', JSON.stringify(s)); } catch { /* too big: keep in memory only */ } E._pending = s; },
    pending() { if (E._pending) return E._pending; try { return JSON.parse(sessionStorage.getItem('echosense.pending')); } catch { return null; } },
    clearPending() { E._pending = null; sessionStorage.removeItem('echosense.pending'); }
  };
})(globalThis.Echo = globalThis.Echo || {});
