/* =========================================================
 * CDL · Frontend (assets/app.js) — Compatible con Code.gs V4
 * - Login POST: {res:'auth', fn:'login', user, pass}
 * - Bootstrap GET: ?path=bootstrap&token=...
 * - Menú dinámico desde perms.pages
 * - Carga vistas: /views/<page>.html (GitHub Pages subcarpeta OK)
 * - IDs API base separados (Opción B):
 *   - #apiBaseLabelMenu
 *   - #apiBaseLabelModal
 * ========================================================= */

(() => {
  "use strict";

  const API_BASE = String(window.API_BASE || "").trim();
  const LS_TOKEN = "cdl_token_v4";

  const $ = (sel) => document.querySelector(sel);

  const state = {
    token: "",
    me: { usuario: "", rol: "" },
    perms: null,
    boot: null
  };

  // ---------- UI helpers ----------
  function setApiBaseLabels() {
    const a = $("#apiBaseLabelMenu");
    const b = $("#apiBaseLabelModal");
    const v = API_BASE || "—";
    if (a) a.textContent = v;
    if (b) b.textContent = v;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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

  function setHeaderUser() {
    const meUser = $("#meUser");
    const badgeRole = $("#badgeRole");
    if (meUser) meUser.textContent = state.me.usuario || "Usuario";
    if (badgeRole) badgeRole.textContent = state.me.rol || "—";
  }

  function updateAuthUi() {
    const liLogin = $("#liLogin");
    const liLogout = $("#liLogout");

    const hasSession = !!state.token;
    if (liLogin) liLogin.style.display = hasSession ? "none" : "";
    if (liLogout) liLogout.style.display = hasSession ? "" : "none";
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
  function asJsonOrThrow(text, contextLabel) {
    const t = String(text ?? "");
    const looksHtml = /^\s*</.test(t) && /<html|<!doctype/i.test(t);
    if (looksHtml) {
      throw new Error(
        `${contextLabel}: la API ha devuelto HTML (no JSON). ` +
          `Suele ser token inválido/caducado o URL de API mal puesta.`
      );
    }

    try {
      return JSON.parse(t);
    } catch {
      const snippet = t.slice(0, 220).replace(/\s+/g, " ").trim();
      throw new Error(`${contextLabel}: respuesta NO es JSON. Inicio: "${snippet}"`);
    }
  }

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

    if (!res.ok) throw new Error(`HTTP ${res.status} en GET ${path}`);

    const json = asJsonOrThrow(text, `GET ${path}`);
    if (json && json.ok === false) throw new Error(json.error || "Error API");
    return json;
  }

  async function apiPost(bodyObj) {
    if (!API_BASE) throw new Error("API_BASE vacío en index.html");

    // ✅ FIX CORS/PREFLIGHT:
    // Apps Script WebApp no soporta OPTIONS (preflight).
    // application/json dispara preflight; text/plain NO.
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(bodyObj || {})
    });

    const text = await res.text();

    if (!res.ok) throw new Error(`HTTP ${res.status} en POST`);

    const json = asJsonOrThrow(text, "POST");
    if (json && json.ok === false) throw new Error(json.error || "Error API");
    return json;
  }

  // ---------- Auth ----------
  function loadToken() {
    state.token = String(localStorage.getItem(LS_TOKEN) || "").trim();
  }

  function saveToken(t) {
    state.token = String(t || "").trim();
    if (state.token) localStorage.setItem(LS_TOKEN, state.token);
    else localStorage.removeItem(LS_TOKEN);
    updateAuthUi();
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
    const host = $("#viewHost");
    if (host) host.innerHTML = "";
    showAlert("Sesión cerrada.", "secondary");
  }

  // ---------- Bootstrap / menu / views ----------
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

  // ✅ FIX PATH views robusto para GH Pages + iOS/PWA
  function viewUrlFor(page) {
    const origin = window.location.origin;
    let basePath = window.location.pathname || "/";

    if (/\.html$/i.test(basePath)) basePath = basePath.replace(/[^/]+$/i, "");
    if (!basePath.endsWith("/")) basePath += "/";

    return `${origin}${basePath}views/${encodeURIComponent(page)}.html`;
  }

  async function openPage(page) {
    clearAlert();
    if (!page) return;

    document.querySelectorAll("#menuItems .list-group-item").forEach((x) => {
      x.classList.toggle("active", x.dataset.page === page);
    });

    const host = $("#viewHost");
    if (!host) return;

    const url = viewUrlFor(page);

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      throw new Error(`Load failed (${page}) · HTTP ${r.status} · ${url}`);
    }

    const html = await r.text();
    host.innerHTML = html;
  }

  function assertBootstrapShape(boot) {
    const pages = boot?.perms?.pages;
    if (!boot || typeof boot !== "object") throw new Error("Bootstrap inválido (no es un objeto).");
    if (!boot.me || typeof boot.me !== "object") throw new Error("Bootstrap inválido (falta 'me').");
    if (!boot.perms || typeof boot.perms !== "object") throw new Error("Bootstrap inválido (falta 'perms').");
    if (!Array.isArray(pages)) throw new Error("Bootstrap inválido (perms.pages no es array).");
    return pages;
  }

  async function bootstrapLoad() {
    clearAlert();

    if (!state.token) throw new Error("No hay token. Inicia sesión.");

    const boot = await apiGet("bootstrap", { token: state.token });
    const pages = assertBootstrapShape(boot);

    state.boot = boot;
    state.me = boot?.me || { usuario: "", rol: "" };
    state.perms = boot?.perms || null;

    setHeaderUser();
    updateAuthUi();
    buildMenu(pages);

    const defaultPage = pages.includes("planificacion")
      ? "planificacion"
      : (pages[0] || "");
    if (defaultPage) await openPage(defaultPage);

    const modal = getLoginModal();
    if (modal) modal.hide();

    showAlert("Sesión iniciada.", "success");
  }

  // ---------- Init ----------
  async function init() {
    setApiBaseLabels();
    loadToken();
    setHeaderUser();
    updateAuthUi();

    const btnMenu = $("#btnMenu");
    if (btnMenu) {
      btnMenu.addEventListener("click", () => {
        const off = getOffcanvas();
        if (off) off.show();
      });
    }

    const btnShowLogin = $("#btnShowLogin");
    if (btnShowLogin) {
      btnShowLogin.addEventListener("click", () => {
        const m = getLoginModal();
        if (m) m.show();
      });
    }

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

    const btnLogout = $("#btnLogout");
    if (btnLogout) btnLogout.addEventListener("click", logout);

    if (state.token) {
      try {
        await bootstrapLoad();
      } catch (e) {
        saveToken("");
        state.me = { usuario: "", rol: "" };
        state.perms = null;
        state.boot = null;
        setHeaderUser();
        buildMenu([]);
        const host = $("#viewHost");
        if (host) host.innerHTML = "";
        showAlert(`Sesión no válida o carga fallida: ${e.message || e}`, "warning");
      }
    } else {
      buildMenu([]);
      try {
        await openPage("planificacion");
      } catch {
        // nada
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();