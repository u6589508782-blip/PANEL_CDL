/* =========================================================
 * CDL · Frontend (assets/app.js) — Compatible con Code.gs V4
 * - Login POST: {res:'auth', fn:'login', user, pass}
 * - Bootstrap GET: ?path=bootstrap&token=...
 * - Menú dinámico desde perms.pages
 * - Carga vistas: /views/<page>.html
 * ========================================================= */

(() => {
  "use strict";

  const API_BASE = String(window.API_BASE || "").trim();
  const LS_TOKEN = "cdl_token_v4";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    token: "",
    me: { usuario: "", rol: "" },
    perms: null,
    boot: null
  };

  // ---------- UI helpers ----------
  function setApiBaseLabels() {
    // OJO: en tu HTML hay 2 ids iguales #apiBaseLabel -> usamos querySelectorAll
    $$("#apiBaseLabel").forEach((el) => (el.textContent = API_BASE || "—"));
  }

  function showAlert(msg, type = "danger") {
    const host = $("#appAlert");
    if (!host) return;
    host.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${escapeHtml(String(msg || ""))}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
      </div>
    `;
  }

  function clearAlert() {
    const host = $("#appAlert");
    if (host) host.innerHTML = "";
  }

  function escapeHtml(s) {
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setHeaderUser() {
    const meUser = $("#meUser");
    const badgeRole = $("#badgeRole");
    if (meUser) meUser.textContent = state.me.usuario || "Usuario";
    if (badgeRole) badgeRole.textContent = state.me.rol || "—";
  }

  function getOffcanvas() {
    const el = $("#sideMenu");
    if (!el || !window.bootstrap?.Offcanvas) return null;
    return window.bootstrap.Offcanvas.getOrCreateInstance(el);
  }

  function getLoginModal() {
    const el = $("#loginModal");
    if (!el || !window.bootstrap?.Modal) return null;
    return window.bootstrap.Modal.getOrCreateInstance(el);
  }

  // ---------- API ----------
  async function apiGet(path, params = {}) {
    if (!API_BASE) throw new Error("API_BASE vacío en index.html");

    const url = new URL(API_BASE);
    url.searchParams.set("path", path);

    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== "") {
        url.searchParams.set(k, String(v));
      }
    });

    const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    const text = await res.text();

    let json;
    try { json = JSON.parse(text); } catch (_) { json = null; }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (json && json.ok === false) throw new Error(json.error || "Error API");
    return json ?? text;
  }

  async function apiPost(bodyObj) {
    if (!API_BASE) throw new Error("API_BASE vacío en index.html");

    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify(bodyObj || {})
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { json = null; }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (json && json.ok === false) throw new Error(json.error || "Error API");
    return json ?? text;
  }

  // ---------- Auth ----------
  function loadToken() {
    state.token = String(localStorage.getItem(LS_TOKEN) || "").trim();
  }

  function saveToken(t) {
    state.token = String(t || "").trim();
    if (state.token) localStorage.setItem(LS_TOKEN, state.token);
    else localStorage.removeItem(LS_TOKEN);
  }

  async function login(user, pass) {
    clearAlert();

    const payload = {
      res: "auth",
      fn: "login",
      user: String(user || "").trim(),
      pass: String(pass || "")
    };

    const out = await apiPost(payload);
    if (!out?.ok || !out?.token) throw new Error(out?.error || "Login fallido");

    saveToken(out.token);
    await bootstrapLoad();
  }

  function logout() {
    saveToken("");
    state.me = { usuario: "", rol: "" };
    state.perms = null;
    state.boot = null;
    setHeaderUser();
    buildMenu([]);
    $("#viewHost").innerHTML = "";
    showAlert("Sesión cerrada.", "secondary");
  }

  // ---------- Bootstrap / menu / views ----------
  async function bootstrapLoad() {
    clearAlert();

    if (!state.token) throw new Error("No hay token. Inicia sesión.");

    const boot = await apiGet("bootstrap", { token: state.token });

    // Code.gs devuelve: {me:{usuario, rol}, perms:{pages, can}, ...}
    state.boot = boot;
    state.me = boot?.me || { usuario: "", rol: "" };
    state.perms = boot?.perms || null;

    setHeaderUser();

    const pages = (state.perms && state.perms.pages) ? state.perms.pages : [];
    buildMenu(pages);

    // Abrir vista por defecto: planificacion (si existe)
    const defaultPage = pages.includes("planificacion") ? "planificacion" : (pages[0] || "");
    if (defaultPage) await openPage(defaultPage);

    // Cerrar modal si estaba abierto
    const modal = getLoginModal();
    if (modal) modal.hide();

    showAlert("Sesión iniciada.", "success");
  }

  function pageLabel(page) {
    const map = {
      planificacion: "Planificación",
      equipos: "Equipos",
      gruas: "Puentes grúa",
      auxiliares: "Auxiliares",
      incidencias: "Incidencias",
      inventario: "Inventario",
      repuestos: "Repuestos",
      externas: "Subcontrata",
      ot: "OT",
      kpi: "KPI"
    };
    return map[page] || page;
  }

  function buildMenu(pages) {
    const ul = $("#menuItems");
    if (!ul) return;

    ul.innerHTML = "";

    (pages || []).forEach((p) => {
      const li = document.createElement("li");
      li.className = "list-group-item list-group-item-action";
      li.style.cursor = "pointer";
      li.textContent = pageLabel(p);
      li.dataset.page = p;

      li.addEventListener("click", async () => {
        try {
          await openPage(p);
          const off = getOffcanvas();
          if (off) off.hide();
        } catch (e) {
          showAlert(e.message || e, "danger");
        }
      });

      ul.appendChild(li);
    });
  }

  async function openPage(page) {
    clearAlert();

    if (!page) return;

    // Marcar activo
    $$("#menuItems .list-group-item").forEach((x) => {
      x.classList.toggle("active", x.dataset.page === page);
    });

    const host = $("#viewHost");
    if (!host) return;

    // Cargar HTML de la vista
    const url = `views/${encodeURIComponent(page)}.html`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Load failed (${page})`);

    const html = await r.text();
    host.innerHTML = html;

    // Si en el futuro añades inicializadores por vista:
    // if (window.CDL_VIEWS?.[page]?.init) window.CDL_VIEWS[page].init({ state, apiGet, apiPost });
  }

  // ---------- Init ----------
  async function init() {
    setApiBaseLabels();
    loadToken();
    setHeaderUser();

    // Menú hamburguesa
    const btnMenu = $("#btnMenu");
    if (btnMenu) {
      btnMenu.addEventListener("click", () => {
        const off = getOffcanvas();
        if (off) off.show();
      });
    }

    // Login modal (botón usuario)
    const btnOpenLogin = $("#btnOpenLogin");
    if (btnOpenLogin) {
      btnOpenLogin.addEventListener("click", (ev) => {
        // Si no hay token -> abrir modal
        if (!state.token) {
          ev.preventDefault();
          ev.stopPropagation();
          const m = getLoginModal();
          if (m) m.show();
        }
        // Si hay token, dejamos que funcione el dropdown normal
      });
    }

    // Botón login
    const btnLogin = $("#btnLogin");
    if (btnLogin) {
      btnLogin.addEventListener("click", async () => {
        const u = ($("#loginUser")?.value || "").trim();
        const p = ($("#loginPass")?.value || "");
        try {
          await login(u, p);
        } catch (e) {
          showAlert(e.message || e, "danger");
        }
      });
    }

    // Logout
    const btnLogout = $("#btnLogout");
    if (btnLogout) btnLogout.addEventListener("click", logout);

    // Si ya hay token, intentamos bootstrap
    if (state.token) {
      try {
        await bootstrapLoad();
      } catch (e) {
        // Token caducado o inválido
        saveToken("");
        showAlert(`Sesión caducada o inválida: ${e.message || e}`, "warning");
      }
    } else {
      // Sin token, abre planificación como placeholder si existiera, o no carga nada.
      buildMenu([]);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();