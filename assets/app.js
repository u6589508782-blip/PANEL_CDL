/* =========================================================
 * CDL · Frontend (assets/app.js) — Compatible con Code.gs V4
 * - FIX Safari: POST como text/plain (evita preflight)
 * - FIX GH Pages subcarpeta: viewUrlFor robusto
 * - FIX Bootstrap: si falta boot.me, se rellena con datos del login
 * - ✅ Añadido: initPage() + carga real de equipos/grúas/auxiliares
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
    boot: null,
    data: {
      equipos: null,
      gruas: null,
      auxiliares: null,
      state: null
    }
  };

  // ---------- Normalización ----------
  function normStr(v) {
    return String(v ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  }

  function normEstado(v) {
    const s = normStr(v);
    if (!s) return "";
    if (s === "verde" || s === "marcha") return "marcha";
    if (s === "amarillo" || s === "restriccion") return "restriccion";
    if (s === "rojo" || s === "parada") return "parada";
    if (s === "azul" || s === "reparacion") return "reparacion";
    return s;
  }

  function estadoBadge(estado) {
    const e = normEstado(estado);
    const map = {
      marcha: { cls: "bg-success", label: "Verde · Marcha" },
      restriccion: { cls: "bg-warning text-dark", label: "Amarillo · Restricción" },
      parada: { cls: "bg-danger", label: "Rojo · Parada" },
      reparacion: { cls: "bg-primary", label: "Azul · Reparación" }
    };
    const x = map[e] || { cls: "bg-secondary", label: e ? `Estado · ${e}` : "Sin estado" };
    return `<span class="badge ${x.cls}">${escapeHtml(x.label)}</span>`;
  }

  function uniqSorted(arr) {
    return Array.from(new Set((arr || []).map((x) => String(x || "").trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "es"));
  }

  function setSelectOptions(sel, options, placeholder = "Todos") {
    if (!sel) return;
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    sel.appendChild(opt0);
    (options || []).forEach((v) => {
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = String(v);
      sel.appendChild(o);
    });
  }

  // ---------- Carga de datos ----------
  async function ensureList(which) {
    if (!state.token) throw new Error("No hay token. Inicia sesión.");

    if (which === "equipos") {
      state.data.equipos = await apiGet("equipos", { token: state.token });
      return state.data.equipos;
    }
    if (which === "gruas") {
      state.data.gruas = await apiGet("gruas", { token: state.token });
      return state.data.gruas;
    }
    if (which === "auxiliares") {
      state.data.auxiliares = await apiGet("auxiliares", { token: state.token });
      return state.data.auxiliares;
    }
    if (which === "state") {
      state.data.state = await apiGet("state", { token: state.token });
      return state.data.state;
    }
    throw new Error(`Lista desconocida: ${which}`);
  }

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

    // ✅ Safari/CORS: Apps Script no maneja OPTIONS (preflight).
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

    const usuario = String(user || "").trim();
    const payload = {
      res: "auth",
      fn: "login",
      user: usuario,
      pass: String(pass || "")
    };

    const out = await apiPost(payload);
    if (!out?.ok || !out?.token) throw new Error(out?.error || "Login fallido");

    // ✅ Guardamos ya quién es el usuario (fallback si bootstrap no trae me)
    state.me.usuario = usuario || state.me.usuario || "";
    state.me.rol = String(out.rol || state.me.rol || "").trim();
    setHeaderUser();

    saveToken(out.token);
    await bootstrapLoad();
  }

  function logout() {
    saveToken("");
    state.me = { usuario: "", rol: "" };
    state.perms = null;
    state.boot = null;
    state.data = { equipos: null, gruas: null, auxiliares: null, state: null };
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

  function viewUrlFor(page) {
    // ✅ GH Pages subcarpeta + Safari/PWA
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

    // Inicializa la lógica de la vista (carga datos reales)
    try {
      await initPage(page);
    } catch (e) {
      // Dejamos la vista visible, pero avisamos
      showAlert(e.message || e, "warning");
    }
  }

  function once(el, key) {
    if (!el) return false;
    const k = `data-${key}`;
    if (el.getAttribute(k) === "1") return false;
    el.setAttribute(k, "1");
    return true;
  }

  function safeObj(x) {
    return (x && typeof x === "object") ? x : {};
  }

  function safeArr(x) {
    return Array.isArray(x) ? x : [];
  }

  // ---------- Render · Equipos ----------
  function renderEquipos(list) {
    const grid = $("#eqGrid");
    if (!grid) return;

    const lineaSel = $("#eqLinea");
    const semSel = $("#eqSemFilter");
    const q = normStr($("#eqSearch")?.value || "");
    const linea = String(lineaSel?.value || "").trim();
    const sem = normEstado(semSel?.value || "");

    const arr = safeArr(list).map(safeObj);
    const filtered = arr.filter((x) => {
      const xLinea = String(x.linea || "").trim();
      const xSem = normEstado(x.estado || x.Estado || x["Estado "]);
      const hayLinea = !linea || xLinea === linea;
      const haySem = !sem || xSem === sem;
      const hayQ = !q || normStr(`${x.id} ${x.nombre} ${xLinea} ${x.ubicacion || ""} ${x.nave || ""}`)
        .includes(q);
      return hayLinea && haySem && hayQ;
    });

    grid.innerHTML = filtered.map((x) => {
      const xSem = normEstado(x.estado || x.Estado || x["Estado "]);
      return `
        <div class="col-12 col-md-6">
          <div class="card shadow-sm">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div class="fw-semibold">${escapeHtml(x.nombre || x.id || "(sin nombre)")}</div>
                  <div class="small text-muted">ID: ${escapeHtml(x.id || "—")} · Línea: ${escapeHtml(x.linea || "—")}</div>
                  <div class="small text-muted">Ubicación: ${escapeHtml(x.ubicacion || "—")} · Nave: ${escapeHtml(x.nave || "—")}</div>
                </div>
                <div>${estadoBadge(xSem)}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  async function initEquipos() {
    const grid = $("#eqGrid");
    if (!grid) return;

    // Carga lista
    grid.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const list = await ensureList("equipos");

    // Pinta filtros
    const lineaSel = $("#eqLinea");
    if (lineaSel && once(lineaSel, "init")) {
      const lineas = uniqSorted(safeArr(list).map((x) => safeObj(x).linea).filter(Boolean));
      setSelectOptions(lineaSel, lineas, "Todas las líneas");
      lineaSel.addEventListener("change", () => renderEquipos(list));
    }

    const semSel = $("#eqSemFilter");
    if (semSel && once(semSel, "init")) {
      semSel.addEventListener("change", () => renderEquipos(list));
    }

    const search = $("#eqSearch");
    if (search && once(search, "init")) {
      search.addEventListener("input", () => renderEquipos(list));
    }

    const btn = $("#btnEqRefresh");
    if (btn && once(btn, "init")) {
      btn.addEventListener("click", async () => {
        try {
          state.data.equipos = null;
          await initEquipos();
        } catch (e) {
          showAlert(e.message || e, "danger");
        }
      });
    }

    renderEquipos(list);
  }

  // ---------- Render · Grúas ----------
  function renderGruas(list) {
    const host = $("#grContent");
    if (!host) return;

    const naveSel = $("#grNave");
    const semSel = $("#grSemFilter");
    const q = normStr($("#grSearch")?.value || "");
    const nave = String(naveSel?.value || "").trim();
    const sem = normEstado(semSel?.value || "");

    const arr = safeArr(list).map(safeObj);
    const filtered = arr.filter((x) => {
      const xNave = String(x.nave || "").trim();
      const xSem = normEstado(x.estado || x.Estado || x["Estado "]);
      const hayNave = !nave || xNave === nave;
      const haySem = !sem || xSem === sem;
      const hayQ = !q || normStr(`${x.id} ${x.nombre} ${xNave} ${x.ubicacion || ""}`)
        .includes(q);
      return hayNave && haySem && hayQ;
    });

    host.innerHTML = filtered.map((x) => {
      const xSem = normEstado(x.estado || x.Estado || x["Estado "]);
      return `
        <div class="card shadow-sm mb-2">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${escapeHtml(x.nombre || x.id || "(sin nombre)")}</div>
                <div class="small text-muted">ID: ${escapeHtml(x.id || "—")} · Nave: ${escapeHtml(x.nave || "—")}</div>
                <div class="small text-muted">Ubicación: ${escapeHtml(x.ubicacion || "—")}</div>
              </div>
              <div>${estadoBadge(xSem)}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  async function initGruas() {
    const host = $("#grContent");
    if (!host) return;
    host.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const list = await ensureList("gruas");

    const naveSel = $("#grNave");
    if (naveSel && once(naveSel, "init")) {
      const naves = uniqSorted(safeArr(list).map((x) => safeObj(x).nave).filter(Boolean));
      setSelectOptions(naveSel, naves, "Todas las naves");
      naveSel.addEventListener("change", () => renderGruas(list));
    }

    const semSel = $("#grSemFilter");
    if (semSel && once(semSel, "init")) {
      semSel.addEventListener("change", () => renderGruas(list));
    }

    const search = $("#grSearch");
    if (search && once(search, "init")) {
      search.addEventListener("input", () => renderGruas(list));
    }

    const btn = $("#btnGrRefresh");
    if (btn && once(btn, "init")) {
      btn.addEventListener("click", async () => {
        try {
          state.data.gruas = null;
          await initGruas();
        } catch (e) {
          showAlert(e.message || e, "danger");
        }
      });
    }

    renderGruas(list);
  }

  // ---------- Render · Auxiliares ----------
  function renderAuxiliares(list) {
    const host = $("#axContent");
    if (!host) return;

    const catSel = $("#axCategoria");
    const semSel = $("#axSemFilter");
    const q = normStr($("#axSearch")?.value || "");
    const cat = String(catSel?.value || "").trim();
    const sem = normEstado(semSel?.value || "");

    const arr = safeArr(list).map(safeObj);
    const filtered = arr.filter((x) => {
      const xCat = String(x.grupo || x.linea || "").trim();
      const xSem = normEstado(x.estado || x.Estado || x["Estado "]);
      const hayCat = !cat || xCat === cat;
      const haySem = !sem || xSem === sem;
      const hayQ = !q || normStr(`${x.id} ${x.nombre} ${xCat} ${x.ubicacion || ""} ${x.nave || ""}`)
        .includes(q);
      return hayCat && haySem && hayQ;
    });

    host.innerHTML = filtered.map((x) => {
      const xSem = normEstado(x.estado || x.Estado || x["Estado "]);
      const xCat = String(x.grupo || x.linea || "").trim();
      return `
        <div class="card shadow-sm mb-2">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${escapeHtml(x.nombre || x.id || "(sin nombre)")}</div>
                <div class="small text-muted">ID: ${escapeHtml(x.id || "—")} · Categoría: ${escapeHtml(xCat || "—")}</div>
                <div class="small text-muted">Ubicación: ${escapeHtml(x.ubicacion || "—")} · Nave: ${escapeHtml(x.nave || "—")}</div>
              </div>
              <div>${estadoBadge(xSem)}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  async function initAuxiliares() {
    const host = $("#axContent");
    if (!host) return;
    host.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const list = await ensureList("auxiliares");

    const catSel = $("#axCategoria");
    if (catSel && once(catSel, "init")) {
      const cats = uniqSorted(safeArr(list).map((x) => safeObj(x).grupo || safeObj(x).linea).filter(Boolean));
      setSelectOptions(catSel, cats, "Todas las categorías");
      catSel.addEventListener("change", () => renderAuxiliares(list));
    }

    const semSel = $("#axSemFilter");
    if (semSel && once(semSel, "init")) {
      semSel.addEventListener("change", () => renderAuxiliares(list));
    }

    const search = $("#axSearch");
    if (search && once(search, "init")) {
      search.addEventListener("input", () => renderAuxiliares(list));
    }

    const btn = $("#btnAxRefresh");
    if (btn && once(btn, "init")) {
      btn.addEventListener("click", async () => {
        try {
          state.data.auxiliares = null;
          await initAuxiliares();
        } catch (e) {
          showAlert(e.message || e, "danger");
        }
      });
    }

    renderAuxiliares(list);
  }

  // ---------- Init por página ----------
  async function initPage(page) {
    if (!state.token) return; // sin sesión no cargamos datos privados

    if (page === "equipos") return initEquipos();
    if (page === "gruas") return initGruas();
    if (page === "auxiliares") return initAuxiliares();
    // El resto de páginas se irán implementando aquí (incidencias, inventario, repuestos, etc.)
  }

  function assertBootstrapShape(boot) {
    if (!boot || typeof boot !== "object") throw new Error("Bootstrap inválido (no es un objeto).");
    if (!boot.perms || typeof boot.perms !== "object") throw new Error("Bootstrap inválido (falta 'perms').");
    if (!Array.isArray(boot.perms.pages)) throw new Error("Bootstrap inválido (perms.pages no es array).");
    return true;
  }

  async function bootstrapLoad() {
    clearAlert();

    if (!state.token) throw new Error("No hay token. Inicia sesión.");

    const boot = await apiGet("bootstrap", { token: state.token });
    assertBootstrapShape(boot);

    if (!boot.me || typeof boot.me !== "object") {
      boot.me = {
        usuario: state.me.usuario || "usuario",
        rol: state.me.rol || ""
      };
    } else {
      boot.me.usuario = boot.me.usuario || state.me.usuario || "";
      boot.me.rol = boot.me.rol || state.me.rol || "";
    }

    state.boot = boot;
    state.me = boot.me;
    state.perms = boot.perms;

    setHeaderUser();
    updateAuthUi();
    buildMenu(boot.perms.pages);

    const pages = boot.perms.pages || [];
    const defaultPage = pages.includes("planificacion") ? "planificacion" : (pages[0] || "");
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
        state.data = { equipos: null, gruas: null, auxiliares: null, state: null };
        setHeaderUser();
        buildMenu([]);
        const host = $("#viewHost");
        if (host) host.innerHTML = "";
        showAlert(`Sesión no válida o carga fallida: ${e.message || e}`, "warning");
      }
    } else {
      buildMenu([]);
      try { await openPage("planificacion"); } catch { /* nada */ }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();