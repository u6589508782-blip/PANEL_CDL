/* =========================================================
 * CDL · Frontend App (assets/app.js)
 * - Shell modular: index.html + /views/*.html
 * - Backend: Apps Script (Code.gs V4)
 * ========================================================= */

(() => {
  'use strict';

  /* =========================
   * CONFIG
   * ========================= */
  const STORAGE = {
    token: 'CDL_TOKEN',
    me: 'CDL_ME',
    perms: 'CDL_PERMS'
  };

  const PAGE_TITLES = {
    planificacion: 'Planificación',
    equipos: 'Equipos',
    gruas: 'Puentes grúa',
    auxiliares: 'Auxiliares',
    incidencias: 'Incidencias',
    inventario: 'Inventario',
    repuestos: 'Repuestos',
    externas: 'Externas',
    ot: 'OT',
    kpi: 'KPIs'
  };

  /* =========================
   * HELPERS DOM
   * ========================= */
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"]+/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[m] || m));
  }

  function toast(type, msg) {
    const host = qs('#appAlert');
    if (!host) return;

    const klass = type === 'ok' ? 'success' : (type === 'warn' ? 'warning' : 'danger');
    host.innerHTML = `
      <div class="alert alert-${klass} alert-dismissible fade show" role="alert">
        ${escapeHtml(msg)}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
      </div>`;
  }

  function getApiBase() {
    const api = (window.API_BASE || '').trim();
    return api;
  }

  function setApiLabel() {
    const api = getApiBase();
    qsa('#apiBaseLabel').forEach(el => { el.textContent = api || '—'; });
  }

  function getToken() {
    return String(localStorage.getItem(STORAGE.token) || '').trim();
  }

  function setToken(token) {
    if (token) localStorage.setItem(STORAGE.token, token);
    else localStorage.removeItem(STORAGE.token);
  }

  function setSession(me, perms) {
    if (me) localStorage.setItem(STORAGE.me, JSON.stringify(me));
    else localStorage.removeItem(STORAGE.me);

    if (perms) localStorage.setItem(STORAGE.perms, JSON.stringify(perms));
    else localStorage.removeItem(STORAGE.perms);
  }

  function getSession() {
    let me = null, perms = null;
    try { me = JSON.parse(localStorage.getItem(STORAGE.me) || 'null'); } catch (_) {}
    try { perms = JSON.parse(localStorage.getItem(STORAGE.perms) || 'null'); } catch (_) {}
    return { me, perms };
  }

  /* =========================
   * FETCH HELPERS
   * ========================= */
  async function fetchJson(url, opts = {}, timeoutMs = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch (_) { data = { ok: false, error: 'Respuesta no JSON', raw: text }; }

      if (!res.ok) {
        const msg = (data && (data.error || data.message)) ? (data.error || data.message) : `HTTP ${res.status}`;
        return { ok: false, error: msg, data };
      }

      // Tu backend a veces devuelve {ok:true,...} y en bootstrap devuelve objeto plano.
      if (data && data.ok === false) return { ok: false, error: data.error || 'Error', data };
      return { ok: true, data };
    } catch (e) {
      const msg = (e && e.name === 'AbortError') ? 'Timeout de red' : (e.message || String(e));
      return { ok: false, error: msg };
    } finally {
      clearTimeout(t);
    }
  }

  function apiGetUrl(path, params = {}) {
    const api = getApiBase();
    const u = new URL(api);
    u.searchParams.set('path', path);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') u.searchParams.set(k, String(v));
    });
    return u.toString();
  }

  async function apiGet(path, params = {}) {
    const url = apiGetUrl(path, params);
    return fetchJson(url, { method: 'GET' });
  }

  async function apiPost(body) {
    const api = getApiBase();
    return fetchJson(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }

  /* =========================
   * UI: ROLE + MENU
   * ========================= */
  function setRoleLabel(text) {
    const el = qs('#roleLabel');
    if (el) el.textContent = text || '—';
  }

  function buildMenu(perms) {
    const ul = qs('#sideMenuList');
    if (!ul) return;

    const pages = (perms && perms.pages && Array.isArray(perms.pages)) ? perms.pages : [];

    // Limpia
    ul.innerHTML = '';

    // Si no hay páginas, deja el menú “vacío” pero claro
    if (!pages.length) {
      ul.innerHTML = `
        <li class="nav-item">
          <span class="nav-link text-muted">Sin páginas disponibles</span>
        </li>`;
      return;
    }

    pages.forEach(page => {
      const title = PAGE_TITLES[page] || page;
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.innerHTML = `
        <a class="nav-link" href="#/${page}" data-page="${escapeHtml(page)}">
          ${escapeHtml(title)}
        </a>`;
      ul.appendChild(li);
    });

    // Cierra offcanvas al click
    qsa('a.nav-link', ul).forEach(a => {
      a.addEventListener('click', () => closeSideMenu());
    });
  }

  function openSideMenu() {
    const el = qs('#sideMenu');
    if (!el || !window.bootstrap) return;
    const oc = window.bootstrap.Offcanvas.getOrCreateInstance(el);
    oc.show();
  }

  function closeSideMenu() {
    const el = qs('#sideMenu');
    if (!el || !window.bootstrap) return;
    const oc = window.bootstrap.Offcanvas.getInstance(el);
    if (oc) oc.hide();
  }

  function openLoginModal() {
    const el = qs('#loginModal');
    if (!el || !window.bootstrap) return;
    const m = window.bootstrap.Modal.getOrCreateInstance(el);
    m.show();
    setTimeout(() => qs('#loginUser')?.focus(), 50);
  }

  function closeLoginModal() {
    const el = qs('#loginModal');
    if (!el || !window.bootstrap) return;
    const m = window.bootstrap.Modal.getInstance(el);
    if (m) m.hide();
  }

  /* =========================
   * AUTH / BOOTSTRAP
   * ========================= */
  async function ensureBootstrap() {
    setApiLabel();

    const token = getToken();
    if (!token) {
      setSession(null, null);
      setRoleLabel('—');
      buildMenu(null);
      return false;
    }

    const r = await apiGet('bootstrap', { token });
    if (!r.ok) {
      // Token inválido o backend no accesible
      setToken('');
      setSession(null, null);
      setRoleLabel('—');
      buildMenu(null);
      toast('err', `Bootstrap falló: ${r.error}`);
      return false;
    }

    const data = r.data || {};
    const me = data.me || null;
    const perms = data.perms || null;

    setSession(me, perms);
    setRoleLabel(me && me.rol ? me.rol : '—');
    buildMenu(perms);

    return true;
  }

  async function doLogin() {
    const user = String(qs('#loginUser')?.value || '').trim();
    const pass = String(qs('#loginPass')?.value || '');

    if (!user || !pass) {
      toast('warn', 'Introduce usuario y contraseña.');
      return;
    }

    const r = await apiPost({ res: 'auth', fn: 'login', user, pass });
    if (!r.ok) {
      toast('err', r.error || 'Login fallido');
      return;
    }

    const data = r.data || {};
    if (!data.token) {
      toast('err', 'Login: no se recibió token');
      return;
    }

    setToken(String(data.token));
    toast('ok', 'Sesión iniciada.');
    closeLoginModal();

    await ensureBootstrap();

    // Si no hay hash, manda a planificación
    if (!location.hash || location.hash === '#/' || location.hash === '#') {
      location.hash = '#/planificacion';
    } else {
      await onNavigate();
    }
  }

  async function doLogout() {
    setToken('');
    setSession(null, null);
    setRoleLabel('—');
    buildMenu(null);
    toast('ok', 'Sesión cerrada.');
    location.hash = '#/planificacion';
    closeSideMenu();
    await onNavigate();
  }

  /* =========================
   * ROUTER / VIEWS
   * ========================= */
  function route() {
    const h = (location.hash || '#/planificacion').replace('#/', '');
    return h || 'planificacion';
  }

  async function loadView(name) {
    const host = qs('#viewHost');
    if (!host) return;

    host.innerHTML = '<div class="p-3">Cargando…</div>';
    try {
      const res = await fetch(`views/${name}.html`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Vista no encontrada');
      host.innerHTML = await res.text();
    } catch (e) {
      host.innerHTML = `
        <div class="p-3">
          <div class="alert alert-warning">
            No se pudo cargar la vista <b>${escapeHtml(name)}</b>
          </div>
        </div>`;
    }
  }

  async function onNavigate() {
    const { perms } = getSession();
    const page = route();

    // Si no hay sesión o permisos, deja entrar solo a planificacion (y lo que tengas público).
    // Pero OJO: tu backend exige token para casi todo. Aquí solo evitamos “pantallas rotas”.
    if (perms && perms.pages && Array.isArray(perms.pages)) {
      if (!perms.pages.includes(page)) {
        // Si el usuario navega a algo que no puede ver, lo devolvemos a planificación
        location.hash = '#/planificacion';
        return;
      }
    }

    await loadView(page);
  }

  /* =========================
   * EXPONER API PARA VISTAS (si lo necesitas luego)
   * ========================= */
  window.CDL = window.CDL || {};
  window.CDL.api = {
    getToken,
    apiGet,
    apiPost,
    ensureBootstrap,
    getSession
  };

  /* =========================
   * INIT
   * ========================= */
  function bindUI() {
    setApiLabel();

    qs('#btnMenu')?.addEventListener('click', openSideMenu);
    qs('#btnOpenLogin')?.addEventListener('click', () => {
      if (getToken()) {
        // Si ya hay sesión, abre menú para navegar rápido
        openSideMenu();
      } else {
        openLoginModal();
      }
    });

    qs('#btnLogout')?.addEventListener('click', doLogout);
    qs('#btnLogin')?.addEventListener('click', doLogin);

    // Enter en password
    qs('#loginPass')?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') doLogin();
    });
    qs('#loginUser')?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') qs('#loginPass')?.focus();
    });
  }

  window.addEventListener('hashchange', onNavigate);

  window.addEventListener('load', async () => {
    bindUI();
    await ensureBootstrap();
    await onNavigate();
  });

})();