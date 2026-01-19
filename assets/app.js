/* =========================================================
 * CDL · Frontend (assets/app.js) — Integración completa V4
 * - FIX Safari: POST como text/plain (evita preflight)
 * - Router views GH Pages robusto
 * - ✅ Init páginas: equipos, gruas, auxiliares, incidencias,
 *   inventario, repuestos, externas, ot, kpi
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
      incidencias: null,
      inventario: null,
      repuestos: null,
      externas: null,
      ot: null,
      kpi: null
    }
  };

  // ---------- Utils ----------
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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

  // ---------- Alerts ----------
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

  // ---------- Session ----------
  function loadToken() {
    state.token = String(localStorage.getItem(LS_TOKEN) || "").trim();
  }

  function saveToken(t) {
    state.token = String(t || "").trim();
    if (state.token) localStorage.setItem(LS_TOKEN, state.token);
    else localStorage.removeItem(LS_TOKEN);
    updateAuthUi();
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

  // ---------- Ensure lists ----------
  async function ensureList(which) {
    if (!state.token) throw new Error("No hay token. Inicia sesión.");

    const t = state.token;

    if (which === "equipos") {
      state.data.equipos = await apiGet("equipos", { token: t });
      return state.data.equipos;
    }
    if (which === "gruas") {
      state.data.gruas = await apiGet("gruas", { token: t });
      return state.data.gruas;
    }
    if (which === "auxiliares") {
      state.data.auxiliares = await apiGet("auxiliares", { token: t });
      return state.data.auxiliares;
    }
    if (which === "incidencias") {
      state.data.incidencias = await apiGet("incidencias", { token: t });
      return state.data.incidencias;
    }
    if (which === "inventario") {
      state.data.inventario = await apiGet("inventario", { token: t });
      return state.data.inventario;
    }
    if (which === "repuestos") {
      state.data.repuestos = await apiGet("repuestos", { token: t });
      return state.data.repuestos;
    }
    if (which === "externas") {
      state.data.externas = await apiGet("externas", { token: t });
      return state.data.externas;
    }
    if (which === "ot") {
      state.data.ot = await apiGet("ot", { token: t });
      return state.data.ot;
    }
    if (which === "kpi") {
      state.data.kpi = await apiGet("kpi", { token: t });
      return state.data.kpi;
    }

    throw new Error(`Lista desconocida: ${which}`);
  }

  // ---------- Menu / views ----------
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

    host.innerHTML = await r.text();

    try {
      await initPage(page);
    } catch (e) {
      showAlert(e.message || e, "warning");
    }
  }

  // ---------- Renders ----------
  // Equipos
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
      const okLinea = !linea || xLinea === linea;
      const okSem = !sem || xSem === sem;
      const okQ = !q || normStr(`${x.id} ${x.nombre} ${xLinea} ${x.ubicacion || ""} ${x.nave || ""}`).includes(q);
      return okLinea && okSem && okQ;
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

    grid.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const list = await ensureList("equipos");

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

  // Grúas
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
      const okNave = !nave || xNave === nave;
      const okSem = !sem || xSem === sem;
      const okQ = !q || normStr(`${x.id} ${x.nombre} ${xNave} ${x.ubicacion || ""}`).includes(q);
      return okNave && okSem && okQ;
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

  // Auxiliares
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
      const okCat = !cat || xCat === cat;
      const okSem = !sem || xSem === sem;
      const okQ = !q || normStr(`${x.id} ${x.nombre} ${xCat} ${x.ubicacion || ""} ${x.nave || ""}`).includes(q);
      return okCat && okSem && okQ;
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

  // Incidencias (listado básico + búsqueda client-side)
  function renderIncidencias(list) {
    const grid = $("#incGrid");
    const count = $("#incCount");
    if (!grid) return;

    const q = normStr($("#fQ")?.value || "");
    const fEquipo = normStr($("#fEquipo")?.value || "");
    const fTipo = normStr($("#fTipo")?.value || "");
    const fEstado = normStr($("#fEstado")?.value || "");
    const fDesde = String($("#fDesde")?.value || "").trim();
    const fHasta = String($("#fHasta")?.value || "").trim();

    const arr = safeArr(list).map(safeObj);

    const filtered = arr.filter((x) => {
      const equipo = normStr(x.equipo || "");
      const tipo = normStr(x.tipo || "");
      const estado = normStr(x.estado || "");
      const created = String(x.created || "");

      const okEquipo = !fEquipo || equipo.includes(fEquipo);
      const okTipo = !fTipo || tipo.includes(fTipo);
      const okEstado = !fEstado || estado.includes(fEstado);

      const okDesde = !fDesde || (created >= fDesde);
      const okHasta = !fHasta || (created <= `${fHasta}T99`);

      const blob = normStr(`${x.id} ${x.equipo} ${x.tipo} ${x.estado} ${x.resumen} ${x.desc}`);
      const okQ = !q || blob.includes(q);

      return okEquipo && okTipo && okEstado && okDesde && okHasta && okQ;
    });

    if (count) count.textContent = String(filtered.length);

    grid.innerHTML = filtered.map((x) => `
      <div class="card shadow-sm mb-2">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <div class="fw-semibold">${escapeHtml(x.resumen || x.id || "Incidencia")}</div>
              <div class="small text-muted">ID: ${escapeHtml(x.id || "—")} · ${escapeHtml(x.created || "—")}</div>
              <div class="small text-muted">Equipo: ${escapeHtml(x.equipo || "—")} · Tipo: ${escapeHtml(x.tipo || "—")} · Estado: ${escapeHtml(x.estado || "—")}</div>
            </div>
            <span class="badge text-bg-secondary">${escapeHtml(x.estado || "—")}</span>
          </div>
        </div>
      </div>
    `).join("");
  }

  async function initIncidencias() {
    const grid = $("#incGrid");
    if (!grid) return;

    grid.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const list = await ensureList("incidencias");

    const btnReload = $("#btnIncReload");
    if (btnReload && once(btnReload, "init")) {
      btnReload.addEventListener("click", async () => {
        try {
          state.data.incidencias = null;
          await initIncidencias();
        } catch (e) {
          showAlert(e.message || e, "danger");
        }
      });
    }

    const btnSearch = $("#btnIncSearch");
    if (btnSearch && once(btnSearch, "init")) {
      btnSearch.addEventListener("click", () => renderIncidencias(list));
    }

    const btnClear = $("#btnIncClear");
    if (btnClear && once(btnClear, "init")) {
      btnClear.addEventListener("click", () => {
        ["fEquipo","fTipo","fEstado","fDesde","fHasta","fQ"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });
        renderIncidencias(list);
      });
    }

    const liveInputs = ["fEquipo","fTipo","fEstado","fDesde","fHasta","fQ"];
    liveInputs.forEach((id) => {
      const el = document.getElementById(id);
      if (el && once(el, "live")) el.addEventListener("input", () => renderIncidencias(list));
    });

    renderIncidencias(list);
  }

  // Inventario (tabla)
  function renderInventario(list) {
    const body = $("#invTbody");
    const count = $("#invCount");
    if (!body) return;

    const q = normStr($("#invQ")?.value || "");
    const cat = normStr($("#invCat")?.value || "");
    const sub = normStr($("#invSub")?.value || "");
    const ub = normStr($("#invUb")?.value || "");

    const arr = safeArr(list).map(safeObj);
    const filtered = arr.filter((x) => {
      const blob = normStr(`${x.ref} ${x.desc} ${x.categoria} ${x.subcategoria} ${x.ubicacion} ${x.codigo}`);
      const okQ = !q || blob.includes(q);
      const okCat = !cat || normStr(x.categoria || "").includes(cat);
      const okSub = !sub || normStr(x.subcategoria || "").includes(sub);
      const okUb = !ub || normStr(x.ubicacion || "").includes(ub);
      return okQ && okCat && okSub && okUb;
    });

    if (count) count.textContent = String(filtered.length);

    body.innerHTML = filtered.map((x) => `
      <tr>
        <td class="text-nowrap">${escapeHtml(x.ref || "")}</td>
        <td>${escapeHtml(x.desc || "")}</td>
        <td class="text-end">${escapeHtml(x.stock ?? "")}</td>
        <td class="text-end">${escapeHtml(x.min ?? "")}</td>
        <td>${escapeHtml(x.categoria || "")}</td>
        <td>${escapeHtml(x.subcategoria || "")}</td>
        <td>${escapeHtml(x.ubicacion || "")}</td>
      </tr>
    `).join("");
  }

  async function initInventario() {
    const body = $("#invTbody");
    if (!body) return;

    body.innerHTML = `<tr><td colspan="7" class="text-muted">Cargando...</td></tr>`;
    const list = await ensureList("inventario");
    renderInventario(list);

    const btn = $("#btnInvBuscar");
    if (btn && once(btn, "init")) btn.addEventListener("click", () => renderInventario(list));

    ["invQ","invCat","invSub","invUb"].forEach((id) => {
      const el = document.getElementById(id);
      if (el && once(el, "live")) el.addEventListener("input", () => renderInventario(list));
    });
  }

  // Repuestos (cards)
  function renderRepuestos(list) {
    const grid = $("#repGrid");
    const count = $("#repCount");
    if (!grid) return;

    const q = normStr($("#repSearch")?.value || "");
    const estado = normStr($("#repEstado")?.value || "");

    const arr = safeArr(list).map(safeObj);
    const filtered = arr.filter((x) => {
      const xEstado = normStr(x.estado || "");
      const okEstado = !estado || xEstado === estado;
      const blob = normStr(`${x.id} ${x.ref} ${x.nombre} ${x.equipo} ${x.solicitante} ${x.comentario} ${x.urgencia}`);
      const okQ = !q || blob.includes(q);
      return okEstado && okQ;
    });

    if (count) count.textContent = String(filtered.length);

    grid.innerHTML = filtered.map((x) => `
      <div class="card shadow-sm mb-2">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <div class="fw-semibold">${escapeHtml(x.nombre || x.ref || x.id || "Repuesto")}</div>
              <div class="small text-muted">ID: ${escapeHtml(x.id || "—")} · ${escapeHtml(x.created || "—")}</div>
              <div class="small text-muted">Ref: ${escapeHtml(x.ref || "—")} · Qty: ${escapeHtml(x.qty ?? "—")} · Equipo: ${escapeHtml(x.equipo || "—")}</div>
              <div class="small text-muted">Solicitante: ${escapeHtml(x.solicitante || "—")} · Urgencia: ${escapeHtml(x.urgencia || "—")}</div>
            </div>
            <span class="badge text-bg-secondary">${escapeHtml(x.estado || "—")}</span>
          </div>
        </div>
      </div>
    `).join("");
  }

  async function initRepuestos() {
    const grid = $("#repGrid");
    if (!grid) return;

    grid.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const list = await ensureList("repuestos");
    renderRepuestos(list);

    const btn = $("#btnRepReload");
    if (btn && once(btn, "init")) {
      btn.addEventListener("click", async () => {
        try {
          state.data.repuestos = null;
          await initRepuestos();
        } catch (e) {
          showAlert(e.message || e, "danger");
        }
      });
    }

    const s = $("#repSearch");
    if (s && once(s, "init")) s.addEventListener("input", () => renderRepuestos(list));

    const st = $("#repEstado");
    if (st && once(st, "init")) st.addEventListener("change", () => renderRepuestos(list));
  }

  // Externas (cards)
  function renderExternas(list) {
    const grid = $("#exGrid");
    const count = $("#exCount");
    if (!grid) return;

    const q = normStr($("#exSearch")?.value || "");
    const estado = normStr($("#exEstado")?.value || "");

    const arr = safeArr(list).map(safeObj);
    const filtered = arr.filter((x) => {
      const xEstado = normStr(x.estado || "");
      const okEstado = !estado || xEstado === estado;
      const blob = normStr(`${x.id} ${x.equipo} ${x.proveedor} ${x.nota} ${x.estado}`);
      const okQ = !q || blob.includes(q);
      return okEstado && okQ;
    });

    if (count) count.textContent = String(filtered.length);

    grid.innerHTML = filtered.map((x) => `
      <div class="card shadow-sm mb-2">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <div class="fw-semibold">${escapeHtml(x.proveedor || "Subcontrata")}</div>
              <div class="small text-muted">ID: ${escapeHtml(x.id || "—")} · ${escapeHtml(x.created || "—")}</div>
              <div class="small text-muted">Equipo: ${escapeHtml(x.equipo || "—")}</div>
              <div class="small text-muted">Nota: ${escapeHtml((x.nota || "").slice(0, 180))}</div>
            </div>
            <span class="badge text-bg-secondary">${escapeHtml(x.estado || "—")}</span>
          </div>
        </div>
      </div>
    `).join("");
  }

  async function initExternas() {
    const grid = $("#exGrid");
    if (!grid) return;

    grid.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const list = await ensureList("externas");
    renderExternas(list);

    const btn = $("#btnExReload");
    if (btn && once(btn, "init")) {
      btn.addEventListener("click", async () => {
        try {
          state.data.externas = null;
          await initExternas();
        } catch (e) {
          showAlert(e.message || e, "danger");
        }
      });
    }

    const s = $("#exSearch");
    if (s && once(s, "init")) s.addEventListener("input", () => renderExternas(list));

    const st = $("#exEstado");
    if (st && once(st, "init")) st.addEventListener("change", () => renderExternas(list));
  }

  // OT (cards)
  function renderOT(list) {
    const grid = $("#otGrid");
    const count = $("#otCount");
    if (!grid) return;

    const arr = safeArr(list).map(safeObj);
    if (count) count.textContent = String(arr.length);

    grid.innerHTML = arr.map((x) => `
      <div class="card shadow-sm mb-2">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <div class="fw-semibold">${escapeHtml(x.tarea || "OT")}</div>
              <div class="small text-muted">ID: ${escapeHtml(x.id || "—")} · Fecha: ${escapeHtml(x.fecha || "—")}</div>
              <div class="small text-muted">Equipo: ${escapeHtml(x.equipo || "—")} · Tipo: ${escapeHtml(x.tipo || "—")}</div>
              <div class="small text-muted">Estado: ${escapeHtml(x.estado || "—")}</div>
            </div>
            <span class="badge text-bg-secondary">${escapeHtml(x.estado || "—")}</span>
          </div>
        </div>
      </div>
    `).join("");
  }

  async function initOT() {
    const grid = $("#otGrid");
    if (!grid) return;

    grid.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const list = await ensureList("ot");
    renderOT(list);
  }

  // KPI (stub)
  async function initKPI() {
    const mount = $("#kpiMount");
    if (!mount) return;

    mount.innerHTML = `<div class="card-body text-muted">Cargando...</div>`;
    const data = await ensureList("kpi");

    mount.innerHTML = `
      <div class="card-body">
        <div class="fw-semibold mb-2">KPI (stub backend)</div>
        <pre class="small m-0" style="white-space:pre-wrap">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
      </div>
    `;
  }

  // ---------- Init por página ----------
  async function initPage(page) {
    if (!state.token) return;

    if (page === "equipos") return initEquipos();
    if (page === "gruas") return initGruas();
    if (page === "auxiliares") return initAuxiliares();
    if (page === "incidencias") return initIncidencias();
    if (page === "inventario") return initInventario();
    if (page === "repuestos") return initRepuestos();
    if (page === "externas") return initExternas();
    if (page === "ot") return initOT();
    if (page === "kpi") return initKPI();
  }

  // ---------- Bootstrap ----------
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

    state.boot = boot;
    state.me = boot.me || state.me;
    state.perms = boot.perms;

    setHeaderUser();
    updateAuthUi();
    buildMenu(state.perms.pages);

    const pages = state.perms.pages || [];
    const defaultPage = pages.includes("planificacion") ? "planificacion" : (pages[0] || "");
    if (defaultPage) await openPage(defaultPage);

    const modal = getLoginModal();
    if (modal) modal.hide();
  }

  async function login(user, pass) {
    clearAlert();

    const usuario = String(user || "").trim();
    const payload = { res: "auth", fn: "login", user: usuario, pass: String(pass || "") };

    const out = await apiPost(payload);
    if (!out?.ok || !out?.token) throw new Error(out?.error || "Login fallido");

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
    state.data = {
      equipos: null, gruas: null, auxiliares: null, incidencias: null,
      inventario: null, repuestos: null, externas: null, ot: null, kpi: null
    };
    setHeaderUser();
    buildMenu([]);
    const host = $("#viewHost");
    if (host) host.innerHTML = "";
    showAlert("Sesión cerrada.", "secondary");
  }

  // ---------- Init ----------
  async function init() {
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
        logout();
        showAlert(`Sesión no válida o carga fallida: ${e.message || e}`, "warning");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();