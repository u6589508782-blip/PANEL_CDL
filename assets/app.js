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
    ui: {
      planMachine: ""
    },
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
    if (s === "verde" || s === "marcha" || s === "operativo" || s === "ok") return "marcha";
    if (s === "amarillo" || s === "restriccion") return "restriccion";
    if (s === "rojo" || s === "parada" || s === "parado" || s === "stop") return "parada";
    if (s === "azul" || s === "reparacion" || s === "mantenimiento" || s === "averia") return "reparacion";
    return s;
  }

  function estadoBadge(estado) {
    const e = normEstado(estado);
    const map = {
      marcha: { cls: "estado-chip estado-marcha", label: "Operativo" },
      restriccion: { cls: "estado-chip estado-restriccion", label: "Restricción" },
      parada: { cls: "estado-chip estado-parada", label: "Parada" },
      reparacion: { cls: "estado-chip estado-reparacion", label: "Reparación" }
    };
    const x = map[e] || { cls: "estado-chip estado-unknown", label: e ? String(e) : "Sin estado" };
    return `<span class="${x.cls}">${escapeHtml(x.label)}</span>`;
  }

  function semaforoWidget(current, extraAttrs = "") {
    const cur = normEstado(current);
    const items = [
      { k: "marcha", t: "Operativo" },
      { k: "restriccion", t: "Restricción" },
      { k: "parada", t: "Parada" },
      { k: "reparacion", t: "Reparación" }
    ];
    return `<div class="semaforo" ${extraAttrs}>${items.map((it) => {
      const active = (cur === it.k) ? "is-active" : "";
      return `<button type="button" class="semaforo-btn ${active}" data-estado="${it.k}" title="${escapeHtml(it.t)}" aria-label="${escapeHtml(it.t)}"></button>`;
    }).join("")}</div>`;
  }

  async function setEstado(res, id, estado) {
    // Llamada estándar: res: "gruas"/"auxiliares"/"equipos"...
    const payload = { res, fn: "set_estado", token: state.token, id: String(id || ""), estado: normEstado(estado) };
    const out = await apiPost(payload);
    if (!out?.ok) throw new Error(out?.error || "No se pudo actualizar el estado");
    return true;
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
      pedidos: "Pedidos",
      pedido_kdp1_demo: "Pedido · KDP1 (demo)",
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
      const xid = x.id || x.ID || x.Id || "";
      return `
        <div class="col-12 col-md-6">
          <div class="card shadow-sm">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div class="fw-semibold">${escapeHtml(x.nombre || xid || "(sin nombre)")}</div>
                  <div class="small text-muted">ID: ${escapeHtml(xid || "—")} · Línea: ${escapeHtml(x.linea || "—")}</div>
                </div>
                <div>
                  ${semaforoWidget(xSem, `data-res="equipos" data-id="${escapeHtml(xid)}"`)}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Click en semáforo → actualiza estado
    grid.querySelectorAll(".semaforo").forEach((wrap) => {
      if (!once(wrap, "bind")) return;
      wrap.addEventListener("click", async (e) => {
        const btn = e.target?.closest?.(".semaforo-btn");
        if (!btn) return;
        const res = wrap.getAttribute("data-res") || "";
        const id = wrap.getAttribute("data-id") || "";
        const est = btn.getAttribute("data-estado") || "";
        try {
          await setEstado(res, id, est);
          wrap.querySelectorAll(".semaforo-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
        } catch (err) {
          showAlert(err.message || err, "danger");
        }
      });
    });
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
      const xid = x.id || x.ID || x.Id || "";
      return `
        <div class="card shadow-sm mb-2">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${escapeHtml(x.nombre || xid || "(sin nombre)")}</div>
                <div class="small text-muted">ID: ${escapeHtml(xid || "—")} · Nave: ${escapeHtml(x.nave || "—")}</div>
              </div>
              <div>
                ${semaforoWidget(xSem, `data-res="gruas" data-id="${escapeHtml(xid)}"`)}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Click en semáforo → actualiza estado
    host.querySelectorAll(".semaforo").forEach((wrap) => {
      if (!once(wrap, "bind")) return;
      wrap.addEventListener("click", async (e) => {
        const btn = e.target?.closest?.(".semaforo-btn");
        if (!btn) return;
        const res = wrap.getAttribute("data-res") || "";
        const id = wrap.getAttribute("data-id") || "";
        const est = btn.getAttribute("data-estado") || "";
        try {
          await setEstado(res, id, est);
          // Reflejo inmediato en UI
          wrap.querySelectorAll(".semaforo-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
        } catch (err) {
          showAlert(err.message || err, "danger");
        }
      });
    });
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

  function renderAuxiliares(list) {
    const host = $("#axContent");
    if (!host) return;

    const cat = String($("#axCategoria")?.value || "").trim();
    const sem = normEstado($("#axSemFilter")?.value || "");
    const q = normStr($("#axSearch")?.value || "");

    const arr = safeArr(list).map(safeObj);
    const filtered = arr.filter((x) => {
      const xCat = String(x.grupo || x.linea || "").trim();
      const xSem = normEstado(x.estado || x.Estado || x["Estado "]);
      const okCat = !cat || xCat === cat;
      const okSem = !sem || xSem === sem;
      const okQ = !q || normStr(`${x.id} ${x.nombre} ${xCat} ${x.ubicacion || ""}`).includes(q);
      return okCat && okSem && okQ;
    });

    host.innerHTML = filtered.map((x) => {
      const xSem = normEstado(x.estado || x.Estado || x["Estado "]);
      const xid = x.id || x.ID || x.Id || "";
      const xCat = String(x.grupo || x.linea || "").trim();
      return `
        <div class="card shadow-sm mb-2">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${escapeHtml(x.nombre || xid || "(sin nombre)")}</div>
                <div class="small text-muted">ID: ${escapeHtml(xid || "—")} · ${escapeHtml(xCat || "—")}</div>
              </div>
              <div>
                ${semaforoWidget(xSem, `data-res="auxiliares" data-id="${escapeHtml(xid)}"`)}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("") || `<div class="text-muted">Sin resultados.</div>`;

    host.querySelectorAll(".semaforo").forEach((wrap) => {
      if (!once(wrap, "bind")) return;
      wrap.addEventListener("click", async (e) => {
        const btn = e.target?.closest?.(".semaforo-btn");
        if (!btn) return;
        const res = wrap.getAttribute("data-res") || "";
        const id = wrap.getAttribute("data-id") || "";
        const est = btn.getAttribute("data-estado") || "";
        try {
          await setEstado(res, id, est);
          wrap.querySelectorAll(".semaforo-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
        } catch (err) {
          showAlert(err.message || err, "danger");
        }
      });
    });
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
    const catsHost = $("#invCats");
    const grid = $("#invGrid");
    const count = $("#invCount");
    const qInput = $("#invSearch");
    if (!catsHost || !grid) return;

    grid.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const list = safeArr(await ensureList("inventario")).map(safeObj);

    const MAIN_CATS = [
      "Mecánica",
      "Hidráulica",
      "Neumática",
      "Electricidad",
      "Procesos manuales",
      "Consumibles",
      "Por equipos"
    ];

    // Selección persistente
    let selected = localStorage.getItem("inv_main_cat") || MAIN_CATS[0];
    if (!MAIN_CATS.includes(selected)) selected = MAIN_CATS[0];

    function normCat(v) {
      const s = normStr(v);
      if (!s) return "";
      if (s.includes("mecan")) return "Mecánica";
      if (s.includes("hidra")) return "Hidráulica";
      if (s.includes("neuma")) return "Neumática";
      if (s.includes("elect")) return "Electricidad";
      if (s.includes("proceso") || s.includes("manual")) return "Procesos manuales";
      if (s.includes("consum")) return "Consumibles";
      if (s.includes("equipo")) return "Por equipos";
      return "";
    }

    function getMainCat(row) {
      return (
        normCat(row.categoria) ||
        normCat(row.Categoria) ||
        normCat(row.familia) ||
        normCat(row.Familia) ||
        normCat(row.tipo) ||
        normCat(row.Tipo) ||
        "Consumibles"
      );
    }

    function val(row, ...keys) {
      for (const k of keys) {
        const v = row?.[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") return v;
      }
      return "";
    }

    function num(v) {
      const n = Number(String(v ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    }

    function renderCats() {
      catsHost.innerHTML = MAIN_CATS.map((c) => {
        const active = c === selected ? "is-active" : "";
        return `<div class="inv-cat ${active}" data-cat="${escapeHtml(c)}"><span>${escapeHtml(c)}</span><span>›</span></div>`;
      }).join("");

      catsHost.querySelectorAll(".inv-cat").forEach((el) => {
        if (!once(el, "bind")) return;
        el.addEventListener("click", () => {
          selected = el.getAttribute("data-cat") || MAIN_CATS[0];
          localStorage.setItem("inv_main_cat", selected);
          renderCats();
          renderGrid();
        });
      });
    }

    function invCard(row) {
      const id = val(row, "id", "ID", "Id") || "";
      const nombre = val(row, "nombre", "Nombre", "repuesto", "Repuesto") || (id ? `Item ${id}` : "Repuesto");
      const ref = val(row, "ref", "Ref", "referencia", "Referencia") || "—";
      const qty = num(val(row, "qty", "Qty", "cantidad", "Cantidad", "unidades", "Unidades"));
      const min = num(val(row, "min", "Min", "minimo", "Mínimo", "stock_min", "STOCK_MIN"));
      const estado = (min && qty <= min) ? "BAJO STOCK" : "OK";

      const details = {
        "Referencia": ref,
        "Unidades": qty,
        "Mínimo": min || "—",
        "Ubicación": val(row, "ubicacion", "Ubicación", "ubic", "Ubic") || "—",
        "Equipo": val(row, "equipo", "Equipo") || "—",
        "Observaciones": val(row, "obs", "Obs", "observaciones", "Observaciones") || "—"
      };

      return `
        <div class="inv-card" data-id="${escapeHtml(id)}">
          <div class="inv-card-h">
            <div>
              <div class="inv-title">${escapeHtml(nombre)}</div>
              <div class="inv-meta">Ref: ${escapeHtml(ref)}</div>
            </div>
            <div class="d-flex align-items-start gap-2">
              <div class="inv-qty">
                <span class="badge ${estado === "BAJO STOCK" ? "text-bg-danger" : "text-bg-secondary"}">${escapeHtml(String(qty))}</span>
              </div>
              <button class="inv-toggle" type="button" aria-label="Desplegar">▾</button>
            </div>
          </div>
          <div class="inv-body" hidden>
            <div class="row g-2">
              ${Object.entries(details).map(([k,v]) => `
                <div class="col-12 col-md-6">
                  <div class="small text-muted">${escapeHtml(k)}</div>
                  <div class="fw-semibold">${escapeHtml(String(v))}</div>
                </div>
              `).join("")}
            </div>
            <div class="inv-actions">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-delta="-1">- 1</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-delta="+1">+ 1</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-delta="-10">- 10</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-delta="+10">+ 10</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-delta="-100">- 100</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-delta="+100">+ 100</button>
              <button type="button" class="btn btn-sm btn-primary" data-edit="1">Modificar</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderGrid() {
      const q = normStr(qInput?.value || "");
      const filtered = list.filter((row) => {
        const cat = getMainCat(row);
        if (cat !== selected) return false;
        if (!q) return true;
        const blob = normStr(`${val(row,"id","ID")} ${val(row,"nombre","Nombre")} ${val(row,"ref","Ref","referencia","Referencia")} ${val(row,"ubicacion","Ubicación")} ${val(row,"equipo","Equipo")} ${val(row,"obs","Obs","observaciones","Observaciones")}`);
        return blob.includes(q);
      });

      if (count) count.textContent = String(filtered.length);
      grid.innerHTML = filtered.map(invCard).join("") || `<div class="text-muted">Sin repuestos en esta categoría.</div>`;

      // Toggle details
      grid.querySelectorAll(".inv-card").forEach((card) => {
        const t = card.querySelector(".inv-toggle");
        if (t && once(t, "bind")) {
          t.addEventListener("click", () => {
            const body = card.querySelector(".inv-body");
            if (!body) return;
            body.hidden = !body.hidden;
            t.textContent = body.hidden ? "▾" : "▴";
          });
        }
      });

      // Ajustes de stock (delta)
      grid.querySelectorAll("[data-delta]").forEach((b) => {
        if (!once(b, "bind")) return;
        b.addEventListener("click", async () => {
          const card = b.closest(".inv-card");
          const id = card?.getAttribute("data-id") || "";
          const delta = Number(b.getAttribute("data-delta") || "0");
          if (!id || !Number.isFinite(delta) || delta === 0) return;
          try {
            const out = await apiPost({ res: "inventario", fn: "adjust_qty", token: state.token, id, delta });
            if (!out?.ok) throw new Error(out?.error || "No se pudo actualizar");
            // Refresco rápido: invalida cache y recarga
            state.data.inventario = null;
            await initInventario();
          } catch (e) {
            showAlert(e.message || e, "danger");
          }
        });
      });

      // Botón modificar (hook)
      grid.querySelectorAll("[data-edit='1']").forEach((b) => {
        if (!once(b, "bind")) return;
        b.addEventListener("click", () => {
          const id = b.closest(".inv-card")?.getAttribute("data-id") || "";
          showAlert(`Editar repuesto (pendiente): ${id}`, "warning");
        });
      });
    }

    // Search live
    if (qInput && once(qInput, "bind")) qInput.addEventListener("input", renderGrid);

    // Import CSV
    const file = $("#invCsvFile");
    const btnImport = $("#btnInvImportCsv");
    if (btnImport && file && once(btnImport, "bind")) {
      btnImport.addEventListener("click", () => file.click());
      file.addEventListener("change", async () => {
        const f = file.files?.[0];
        if (!f) return;
        try {
          const text = await f.text();
          const out = await apiPost({ res: "inventario", fn: "import_csv", token: state.token, csv: text });
          if (!out?.ok) throw new Error(out?.error || "No se pudo importar");
          showAlert("CSV importado correctamente", "success");
          state.data.inventario = null;
          await initInventario();
        } catch (e) {
          showAlert(e.message || e, "danger");
        } finally {
          file.value = "";
        }
      });
    }

    renderCats();
    renderGrid();
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
    const scopeSel = $("#kpiScope");
    const cardsHost = $("#kpiCards");
    const chartsHost = $("#kpiCharts");
    const note = $("#kpiNote");
    if (!scopeSel || !cardsHost || !chartsHost) return;

    const btnReload = $("#btnKpiReload");
    if (btnReload && once(btnReload, "bind")) {
      btnReload.addEventListener("click", async () => {
        try {
          state.data.kpi = null;
          await initKPI();
        } catch (e) {
          showAlert(e.message || e, "danger");
        }
      });
    }

    cardsHost.innerHTML = `<div class="text-muted">Cargando...</div>`;
    const rows = safeArr(await ensureList("kpi")).map(safeObj);

    const EQUIPOS = [
      "KDP1",
      "KDP3",
      "Sierra KBS",
      "Pintura",
      "HGG",
      "Sierra de paquetes",
      "T13",
      "Salidas Q8/Q9"
    ];

    // Rellenar selector
    if (once(scopeSel, "fill")) {
      const opts = [
        { value: "global", label: "Global" },
        ...EQUIPOS.map((e) => ({ value: e, label: e }))
      ];
      scopeSel.innerHTML = opts.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
    }

    // Scope persistente
    let scope = localStorage.getItem("kpi_scope") || "global";
    if (!["global", ...EQUIPOS].includes(scope)) scope = "global";
    scopeSel.value = scope;

    function getEquipo(row) {
      return String(row.equipo || row.Equipo || row.machine || row.Machine || row.eq || "").trim();
    }
    function getNum(row, ...keys) {
      for (const k of keys) {
        if (row[k] === undefined) continue;
        const n = Number(String(row[k]).replace(",", "."));
        if (Number.isFinite(n)) return n;
      }
      return 0;
    }
    function getDate(row) {
      return String(row.fecha || row.Fecha || row.created || row.Created || "").slice(0, 10);
    }

    function filterRows() {
      if (scope === "global") return rows;
      return rows.filter((r) => normStr(getEquipo(r)) === normStr(scope));
    }

    function aggregate(arr) {
      // Intentamos ser flexibles con nombres de columnas
      const unplanned = arr.reduce((a, r) => a + getNum(r, "paro_no_planificado", "horas_paro", "horasParo", "downtime_h", "downtime", "paro"), 0);
      const total = arr.reduce((a, r) => a + getNum(r, "horas_total", "horasTotal", "planned_h", "total_h"), 0);
      const mttr = arr.length ? (arr.reduce((a, r) => a + getNum(r, "mttr", "MTTR"), 0) / arr.length) : 0;
      const mttf = arr.length ? (arr.reduce((a, r) => a + getNum(r, "mttf", "MTTF"), 0) / arr.length) : 0;
      const repCost = arr.reduce((a, r) => a + getNum(r, "coste_repuestos", "coste", "repuestos_eur", "eur_repuestos"), 0);
      const avail = total > 0 ? Math.max(0, Math.min(1, (total - unplanned) / total)) : 0;
      return { unplanned, total, avail, mttr, mttf, repCost };
    }

    function topCauses(arr, n = 5) {
      // Esperamos campos tipo causa / motivo
      const map = new Map();
      for (const r of arr) {
        const c = String(r.causa || r.Causa || r.motivo || r.Motivo || r.fallo || r.Fallo || "").trim();
        if (!c) continue;
        map.set(c, (map.get(c) || 0) + 1);
      }
      return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n);
    }

    function render() {
      localStorage.setItem("kpi_scope", scope);
      const arr = filterRows();
      const agg = aggregate(arr);
      const causes = topCauses(arr);

      const fmtH = (v) => `${(Math.round(v*10)/10).toFixed(1)} h`;
      const fmtPct = (v) => `${Math.round(v*1000)/10}%`;
      const fmtEur = (v) => `${Math.round(v)} €`;

      cardsHost.innerHTML = `
        <div class="kpi-cards">
          <div class="kpi-card">
            <div class="kpi-label">Disponibilidad</div>
            <div class="kpi-value">${fmtPct(agg.avail)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Paro no planificado</div>
            <div class="kpi-value">${fmtH(agg.unplanned)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">MTTR</div>
            <div class="kpi-value">${fmtH(agg.mttr)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">MTTF</div>
            <div class="kpi-value">${fmtH(agg.mttf)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Coste repuestos</div>
            <div class="kpi-value">${fmtEur(agg.repCost)}</div>
          </div>
        </div>
      `;

      // Mini "gráfica" por días (placeholder útil sin librerías)
      const byDay = new Map();
      for (const r of arr) {
        const d = getDate(r) || "(sin fecha)";
        const h = getNum(r, "paro_no_planificado", "horas_paro", "horasParo", "downtime_h", "downtime", "paro");
        byDay.set(d, (byDay.get(d) || 0) + h);
      }
      const series = [...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-30);
      const max = Math.max(1, ...series.map(([,v]) => v));
      const bars = series.map(([d,v]) => {
        const w = Math.round((v / max) * 100);
        return `
          <div class="d-flex align-items-center gap-2 mb-1">
            <div class="small text-muted" style="width:86px">${escapeHtml(d)}</div>
            <div style="flex:1; background:#e5e7eb; border-radius:999px; height:10px; overflow:hidden">
              <div style="width:${w}%; height:10px; background:#111827"></div>
            </div>
            <div class="small" style="width:52px; text-align:right">${escapeHtml(fmtH(v))}</div>
          </div>
        `;
      }).join("");

      if (["HGG", "Sierra de paquetes"].includes(scope)) {
        chartsHost.innerHTML = `
          <div class="alert alert-secondary mb-0">
            <div class="fw-semibold">Gráficas desactivadas</div>
            <div class="small text-muted">Para este equipo, por ahora solo mostramos los KPIs resumen (sin gráficas).</div>
          </div>
        `;
      } else {
        chartsHost.innerHTML = `
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="fw-semibold mb-2">Paro no planificado (últimos 30 días)</div>
            ${bars || `<div class="text-muted">Sin datos suficientes.</div>`}
            <hr />
            <div class="fw-semibold mb-2">Top 5 causas (Pareto)</div>
            ${causes.length ? `
              <ol class="m-0">
                ${causes.map(([c,n]) => `<li><span class="fw-semibold">${escapeHtml(c)}</span> <span class="text-muted">(${n})</span></li>`).join("")}
              </ol>
            ` : `<div class="text-muted">Sin causas registradas.</div>`}
          </div>
        </div>
      `;

      }
      if (note) {
        const s = scope === "global" ? "Global (suma de todos los equipos)" : scope;
        note.textContent = `Mostrando: ${s}. Datos: ${arr.length} registros.`;
      }
    }

    if (once(scopeSel, "bind")) {
      scopeSel.addEventListener("change", () => {
        scope = scopeSel.value;
        render();
      });
    }

    render();
  }

  // ---------- Init por página ----------


  // ---------- Demo · Pedidos (sin datos) ----------
  function demoEquiposProductivos() {
    return [
      { grupo: "Línea Kaltenbach", items: ["Sierra KBS", "KDP1", "KDP3", "Pintura"] },
      { grupo: "Láser", items: ["Láser T12-2", "Láser T12-1", "Láser T7-1", "Láser T7-2", "Láser T11-1", "Láser T11-2"] },
      { grupo: "Equipos independientes", items: ["KDM", "Sierra de paquetes", "HGG Perfilado térmico", "TECOI (THOR)", "Mazak FG-400 NEO"] }
    ];
  }

  function initPedidos() {
    const host = document.querySelector('#pedidosHost');
    if (!host) return;

    const groups = demoEquiposProductivos();
    host.innerHTML = groups.map(g => {
      const lis = g.items.map(name => {
        const isKdp1 = name === 'KDP1';
        return `
          <li class="list-group-item d-flex justify-content-between align-items-center gap-2">
            <div class="fw-semibold">${escapeHtml(name)}</div>
            <button type="button" class="btn btn-sm ${isKdp1 ? 'btn-primary' : 'btn-outline-secondary'}" ${isKdp1 ? '' : 'disabled'} data-demo-kdp1="${isKdp1 ? '1' : '0'}">
              ${isKdp1 ? 'Abrir demo' : 'Vacío'}
            </button>
          </li>
        `;
      }).join('');
      return `
        <div class="card shadow-sm mb-3">
          <div class="card-body">
            <div class="fw-bold mb-2">${escapeHtml(g.grupo)}</div>
            <ul class="list-group list-group-flush">${lis}</ul>
          </div>
        </div>
      `;
    }).join('');

    const btns = document.querySelectorAll('[data-demo-kdp1="1"]');
    btns.forEach(btn => {
      if (!once(btn, 'init')) return;
      btn.addEventListener('click', async () => {
        try { await openPage('pedido_kdp1_demo'); }
        catch(e){ showAlert(e.message || e, 'danger'); }
      });
    });
  }

  function initPedidoKdp1Demo() {
    const back = document.querySelector('#btnBackPedidos');
    if (back && once(back, 'init')) {
      back.addEventListener('click', async () => {
        try { await openPage('pedidos'); }
        catch(e){ showAlert(e.message || e, 'danger'); }
      });
    }
  }

  // ---------- Planificación (real: lee Sheets) + acciones demo ----------
  const PLAN_ESTADOS = ["blanco", "azul", "amarillo", "verde", "rojo"];
  const PLAN_ESTADO_BTN = {
    blanco: { cls: "btn-light", label: "Programado" },
    azul: { cls: "btn-primary", label: "Alimentado" },
    amarillo: { cls: "btn-warning", label: "En prod." },
    verde: { cls: "btn-success", label: "Completado" },
    rojo: { cls: "btn-danger", label: "Incidencia" }
  };

  function planNormEstado(v) {
    const s = normStr(v);
    if (!s) return "";
    if (s === "programado" || s === "blanco") return "blanco";
    if (s === "alimentado" || s === "azul") return "azul";
    if (s === "produccion" || s === "en produccion" || s === "en_prod" || s === "amarillo") return "amarillo";
    if (s === "completado" || s === "terminado" || s === "verde") return "verde";
    if (s === "incidencia" || s === "parado" || s === "rojo") return "rojo";
    return "";
  }

  function planDeriveEstado(row) {
    const r = safeObj(row);
    const manual = planNormEstado(r.estado);
    if (manual) return manual;
    const terminado = String(r.terminado || "").toLowerCase() === "true" || r.terminado === true;
    const alimentado = String(r.alimentado || "").toLowerCase() === "true" || r.alimentado === true;
    if (terminado) return "verde";
    if (alimentado) return "azul";
    return "blanco";
  }

  function planShortTs(ts) {
    const t = String(ts || "").trim();
    if (!t) return "—";
    // ISO -> "YYYY-MM-DD HH:MM"
    const m = t.replace("T", " ").replace(".000Z", "");
    return m.slice(0, 16);
  }

  function planUniqueMachines(rows) {
    const arr = safeArr(rows).map(safeObj);
    return uniqSorted(arr.map(r => r.maquina || r.maq || "").filter(Boolean));
  }

  function planRenderCats(machines) {
    const host = $("#planCats");
    if (!host) return;
    const ms = safeArr(machines);
    host.innerHTML = ms.map(m => {
      const active = state.ui.planMachine === m;
      return `<button type="button" class="btn btn-sm ${active ? "btn-dark" : "btn-outline-secondary"} me-2 mb-2" data-plan-machine="${escapeHtml(m)}">${escapeHtml(m)}</button>`;
    }).join("");

    host.querySelectorAll("[data-plan-machine]").forEach(btn => {
      if (!once(btn, "init")) return;
      btn.addEventListener("click", async () => {
        state.ui.planMachine = btn.getAttribute("data-plan-machine") || "";
        planUpdateSelectedLabel();
        await planLoadAndRender(false);
      });
    });
  }

  function planUpdateSelectedLabel() {
    const sel = $("#planSelected");
    if (sel) sel.textContent = state.ui.planMachine || "—";
  }

  function planRowHtml(r) {
    const row = safeObj(r);
    const maq = String(row.maquina || row.maq || "").trim();
    const picking = String(row.picking || "").trim();
    const canOpen = normStr(maq) === "kdp1"; // demo: solo KDP1

    const estado = planDeriveEstado(row);
    const st = PLAN_ESTADO_BTN[estado] || PLAN_ESTADO_BTN.blanco;

    const alimentado = String(row.alimentado || "").toLowerCase() === "true" || row.alimentado === true;
    const btnAlCls = alimentado ? "btn-outline-secondary" : "btn-outline-primary";
    const btnAlTxt = alimentado ? "Quitar" : "Alimentado";

    return `
      <tr data-picking="${escapeHtml(picking)}" data-maquina="${escapeHtml(maq)}" data-estado="${escapeHtml(estado)}" data-alimentado="${alimentado ? "1" : "0"}" data-terminado="${(String(row.terminado||"").toLowerCase()==="true"||row.terminado===true) ? "1" : "0"}">
        <td class="text-muted">${escapeHtml(planShortTs(row.ts))}</td>
        <td>
          <button type="button" class="btn btn-sm btn-primary" ${canOpen ? "" : "disabled"} data-plan-open="1">Abrir</button>
        </td>
        <td>
          <button type="button" class="btn btn-sm ${st.cls} w-100" data-plan-estado="1" data-estado="${escapeHtml(estado)}" title="Cambiar estado">${escapeHtml(st.label)}</button>
        </td>
        <td>
          <button type="button" class="btn btn-sm ${btnAlCls} w-100" data-plan-alimentado="1" data-alimentado="${alimentado ? "1" : "0"}">${escapeHtml(btnAlTxt)}</button>
        </td>
        <td><span class="fw-semibold">${escapeHtml(picking || row.id || "—")}</span></td>
        <td>${escapeHtml(row.cliente || "—")}</td>
        <td class="small text-muted">${escapeHtml((row.input || "") + (row.output ? ` → ${row.output}` : ""))}</td>
        <td>${escapeHtml(row.kgs ?? "—")}</td>
        <td class="small">${escapeHtml(row.comentarios || "")}</td>
      </tr>
    `;
  }

  function planApplyFilters(rows) {
    const arr = safeArr(rows).map(safeObj);
    const q = String($("#planSearch")?.value || "").trim().toLowerCase();
    let out = arr;
    if (state.ui.planMachine) {
      out = out.filter(r => String(r.maquina || r.maq || "").trim() === state.ui.planMachine);
    }
    if (q) {
      out = out.filter(r => {
        const hay = (
          String(r.maquina || "") + " " +
          String(r.input || "") + " " +
          String(r.output || "") + " " +
          String(r.cliente || "") + " " +
          String(r.deleg || "") + " " +
          String(r.picking || "") + " " +
          String(r.comentarios || "")
        ).toLowerCase();
        return hay.includes(q);
      });
    }
    return out;
  }

  async function planLoadRows(forceReload = false) {
    // Preferimos bootstrap (rápido). Si no viene, pedimos GET planificacion.
    if (!forceReload && state.boot && Array.isArray(state.boot.planificacion)) {
      return state.boot.planificacion;
    }
    const out = await apiGet("planificacion", { token: state.token });
    // Back devuelve array directamente.
    return Array.isArray(out) ? out : safeArr(out?.items);
  }

  async function planLoadAndRender(forceReload = false) {
    const tbody = $("#planTbody");
    if (!tbody) return;

    const rows = await planLoadRows(forceReload);
    const machines = planUniqueMachines(rows);

    // Default machine (si existe): Pintura
    if (!state.ui.planMachine) {
      const def = machines.find(m => normStr(m) === normStr("Pintura")) || machines[0] || "";
      state.ui.planMachine = def;
    }

    planRenderCats(machines);
    planUpdateSelectedLabel();

    const filtered = planApplyFilters(rows);
    const count = $("#planCount");
    if (count) count.textContent = String(filtered.length);

    tbody.innerHTML = filtered.map(planRowHtml).join("");
  }

  async function planPostUpdate(picking, patch) {
    const pk = String(picking || "").trim();
    if (!pk) throw new Error("PICKING vacío.");

    // Endpoint nuevo: res=plan fn=update
    const body = { res: "plan", fn: "update", token: state.token, picking: pk, patch: safeObj(patch) };
    return apiPost(body);
  }

  function planNextEstado(current) {
    const cur = PLAN_ESTADOS.includes(current) ? current : "blanco";
    const i = PLAN_ESTADOS.indexOf(cur);
    return PLAN_ESTADOS[(i + 1) % PLAN_ESTADOS.length];
  }

  async function initPlanificacion() {
    const tbody = $("#planTbody");
    if (!tbody) return;

    // Events
    const btnReload = $("#btnPlanReload");
    if (btnReload && once(btnReload, "init")) {
      btnReload.addEventListener("click", async () => {
        try { await planLoadAndRender(true); }
        catch (e) { showAlert(e.message || e, "danger"); }
      });
    }

    const search = $("#planSearch");
    if (search && once(search, "init")) {
      search.addEventListener("input", async () => {
        try { await planLoadAndRender(false); }
        catch (e) { showAlert(e.message || e, "danger"); }
      });
    }

    // Delegación de eventos sobre la tabla
    if (once(tbody, "init")) {
      tbody.addEventListener("click", async (ev) => {
        const tr = ev.target.closest("tr[data-picking]");
        if (!tr) return;
        const picking = tr.getAttribute("data-picking") || "";
        const maq = tr.getAttribute("data-maquina") || "";

        // Abrir demo
        if (ev.target.closest("[data-plan-open]")) {
          if (normStr(maq) !== "kdp1") return;
          try { await openPage("pedido_kdp1_demo"); }
          catch (e) { showAlert(e.message || e, "danger"); }
          return;
        }

        // Cambiar estado (ciclo de colores)
        if (ev.target.closest("[data-plan-estado]")) {
          const btn = ev.target.closest("[data-plan-estado]");
          const cur = planNormEstado(btn?.getAttribute("data-estado") || tr.getAttribute("data-estado") || "blanco") || "blanco";
          const next = planNextEstado(cur);
          try {
            await planPostUpdate(picking, { estado: next });
            await planLoadAndRender(true);
          } catch (e) {
            showAlert(
              (e.message || e) + "\n\nSi te dice que no existe el endpoint, falta pegar el Code.gs con plan_update.",
              "danger"
            );
          }
          return;
        }

        // Alimentado (toggle)
        if (ev.target.closest("[data-plan-alimentado]")) {
          const btn = ev.target.closest("[data-plan-alimentado]");
          const curVal = (btn?.getAttribute("data-alimentado") || tr.getAttribute("data-alimentado") || "0") === "1";
          const nextVal = !curVal;

          const patch = { alimentado: nextVal, ultima_accion: "almacen" };
          // Si marcamos alimentado y no hay estado manual, ponemos azul por defecto
          // Si marcamos alimentado y el estado estaba en blanco, lo ponemos azul (si era rojo/amarillo/verde, lo respetamos)
          const curEstado = planNormEstado(tr.getAttribute("data-estado") || "") || "blanco";
          if (nextVal && curEstado === "blanco") patch.estado = "azul";
          if (!nextVal && (curEstado === "azul")) patch.estado = "blanco";

          try {
            await planPostUpdate(picking, patch);
            await planLoadAndRender(true);
          } catch (e) {
            showAlert(
              (e.message || e) + "\n\nSi te dice que no existe el endpoint, falta pegar el Code.gs con plan_update.",
              "danger"
            );
          }
        }
      });
    }

    // First render
    try {
      await planLoadAndRender(false);
    } catch (e) {
      showAlert(e.message || e, "danger");
    }
  }



  async function initPage(page) {
    if (!state.token) return;

    if (page === "planificacion") return initPlanificacion();
    if (page === "equipos") return initEquipos();
    if (page === "gruas") return initGruas();
    if (page === "auxiliares") return initAuxiliares();
    if (page === "incidencias") return initIncidencias();
    if (page === "inventario") return initInventario();
    if (page === "repuestos") return initRepuestos();
    if (page === "externas") return initExternas();
    if (page === "ot") return initOT();
    if (page === "kpi") return initKPI();
    if (page === "pedidos") return initPedidos();
    if (page === "pedido_kdp1_demo") return initPedidoKdp1Demo();
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
    const pages = state.perms.pages || [];

    // Demo visual: añadimos "Pedidos" al menú sin depender del backend
    const menuPages = Array.isArray(pages) ? pages.slice() : [];
    if (!menuPages.includes("pedidos")) {
      const i = menuPages.indexOf("planificacion");
      if (i >= 0) menuPages.splice(i + 1, 0, "pedidos");
      else menuPages.push("pedidos");
    }

    buildMenu(menuPages);
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

    // Feedback claro al usuario
    showAlert(`Sesión iniciada: ${state.me.usuario || ""} (${state.me.rol || ""})`, "success");
  }

  async function changePassword(oldPass, newPass) {
    clearAlert();
    if (!state.token) throw new Error("No hay sesión. Inicia sesión.");

    const payload = {
      res: "auth",
      fn: "change_pass",
      token: state.token,
      oldPass: String(oldPass || ""),
      newPass: String(newPass || "")
    };

    const out = await apiPost(payload);
    if (!out?.ok) throw new Error(out?.error || "No se pudo cambiar la contraseña");
    return true;
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

    const menuSearch = $("#menuSearch");
    if (menuSearch && once(menuSearch, "init")) {
      const applyFilter = () => {
        const q = normStr(menuSearch.value || "");
        document.querySelectorAll("#menuItems .list-group-item").forEach((li) => {
          const txt = normStr(li.textContent || "");
          li.style.display = (!q || txt.includes(q)) ? "" : "none";
        });
      };
      menuSearch.addEventListener("input", applyFilter);
      // Limpia al abrir el menú
      const side = $("#sideMenu");
      if (side) side.addEventListener("shown.bs.offcanvas", () => { menuSearch.value = ""; applyFilter(); });
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

    const btnTogglePass = $("#btnTogglePass");
    if (btnTogglePass && once(btnTogglePass, "init")) {
      btnTogglePass.addEventListener("click", () => {
        const inp = $("#loginPass");
        if (!inp) return;
        inp.type = (inp.type === "password") ? "text" : "password";
      });
    }

    const btnToggleChangePass = $("#btnToggleChangePass");
    if (btnToggleChangePass && once(btnToggleChangePass, "init")) {
      btnToggleChangePass.addEventListener("click", () => {
        const box = $("#changePassBox");
        if (!box) return;
        box.classList.toggle("d-none");
      });
    }

    const btnChangePass = $("#btnChangePass");
    if (btnChangePass && once(btnChangePass, "init")) {
      btnChangePass.addEventListener("click", async () => {
        const oldP = ($("#oldPass")?.value || "");
        const newP = ($("#newPass")?.value || "");
        if (!oldP || !newP) {
          showAlert("Rellena la contraseña antigua y la nueva.", "warning");
          return;
        }
        try {
          await changePassword(oldP, newP);
          // Limpia y cierra sub-bloque
          const box = $("#changePassBox");
          if (box) box.classList.add("d-none");
          if ($("#oldPass")) $("#oldPass").value = "";
          if ($("#newPass")) $("#newPass").value = "";
          showAlert("Contraseña actualizada.", "success");
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