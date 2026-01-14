/* =========================================================
 * CDL · Front modular (GitHub Pages)
 * - Router hash (#/planificacion, #/incidencias)
 * - Login + token (localStorage)
 * - Carga vistas desde /views
 * ========================================================= */

const API_BASE = (window.API_BASE || '').trim();
const LS_TOKEN = 'cdl_token';
const LS_ROLE  = 'cdl_role';

const state = {
  token: localStorage.getItem(LS_TOKEN) || '',
  me: null,
  perms: null,
  bootstrap: null,
  cache: {
    plan: null,
    incid: null
  },
  selectedPlan: {
    linea: 'KALTENBACH',
    equipId: null,
    equipNombre: null
  }
};

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function showAlert(type, msg, keep=false){
  const host = qs('#appAlert');
  if(!host) return;
  host.innerHTML = `
    <div class="alert alert-${type} d-flex align-items-center justify-content-between" role="alert">
      <div>${msg}</div>
      <button type="button" class="btn-close" aria-label="Close"></button>
    </div>`;
  const btn = host.querySelector('.btn-close');
  btn?.addEventListener('click', ()=> host.innerHTML='');
  if(!keep) setTimeout(()=>{ if(host.innerHTML) host.innerHTML=''; }, 4000);
}

function normStr(s){
  return String(s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]+/g,'')
    .trim();
}

function escapeHtml(v){
  return String(v ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function toast(msg, type='secondary'){
  const t = String(type||'secondary').toLowerCase();
  const map = { ok:'success', info:'primary', warn:'warning', error:'danger' };
  showAlert(map[t] || t || 'secondary', String(msg||''), true);
}


async function apiGet(path, params={}){
  const url = new URL(API_BASE);
  url.searchParams.set('path', path);
  url.searchParams.set('token', state.token);
  Object.keys(params||{}).forEach(k=>{
    if(params[k]!==undefined && params[k]!==null && String(params[k])!=='') url.searchParams.set(k, params[k]);
  });
  const res = await fetch(url.toString(), { method:'GET' });
  const data = await res.json();
  if(data && data.ok===false) throw new Error(data.error||'Error');
  return data;
}

async function apiPost(payload) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(data && data.ok===false) throw new Error(data.error||'Error');
  return data;
}

function canSee(pageKey){
  const pages = state.perms?.pages || [];
  if(pages.includes('*')) return true;
  return pages.includes(pageKey);
}

function isRole(role){
  return (state.me?.rol || '') === role;
}

function buildMenu(){
  const menu = qs('#menuItems');
  if(!menu) return;

  const items = [];
  // Orden definitivo (según Mario)
  if(canSee('planificacion')) items.push({key:'planificacion', label:'Planificación', hash:'#/planificacion'});
  if(canSee('equipos')) items.push({key:'equipos', label:'Equipos', hash:'#/equipos'});
  if(canSee('gruas')) items.push({key:'gruas', label:'Puentes grúa', hash:'#/gruas'});
  if(canSee('auxiliares')) items.push({key:'auxiliares', label:'Equipos auxiliares', hash:'#/auxiliares'});
  if(canSee('incidencias')) items.push({key:'incidencias', label:'Incidencias', hash:'#/incidencias'});
  if(canSee('inventario')) items.push({key:'inventario', label:'Inventario', hash:'#/inventario'});
  // Nuevas solicitudes (creación) — usa el permiso de 'repuestos' en tu backend actual
  if(canSee('repuestos')) items.push({key:'solicitudes', label:'Nuevas solicitudes', hash:'#/solicitudes'});
  if(canSee('externas')) items.push({key:'externas', label:'Subcontratas', hash:'#/externas'});
  if(canSee('ot')) items.push({key:'ot', label:'OT', hash:'#/ot'});
  // Gestión de solicitudes (lista) — la dejamos al final
  if(canSee('repuestos')) items.push({key:'repuestos', label:'Repuestos', hash:'#/repuestos'});
  // (resto de páginas: las añadiremos después)

  menu.innerHTML = items.map(it=>`
    <a class="list-group-item list-group-item-action" href="${it.hash}" data-key="${it.key}">${it.label}</a>
  `).join('') || '<div class="text-muted">Sin páginas disponibles</div>';  return items;
}


async function loadView(name){
  const host = qs('#viewHost');
  if(!host) return;

  host.innerHTML = '<div class="text-muted p-3">Cargando…</div>';

  try{
    const res = await fetch(`views/${name}.html`, { cache:'no-store' });
    if(!res.ok) throw new Error(`No existe la vista: ${name} (${res.status})`);
    host.innerHTML = await res.text();
  }catch(e){
    console.error(e);
    host.innerHTML = `
      <div class="p-3">
        <div class="alert alert-warning mb-0">
          No se pudo cargar la página <b>${escapeHtml(String(name))}</b>.
          <div class="small text-muted mt-1">${escapeHtml(String(e.message||e))}</div>
        </div>
      </div>
    `;
  }
}

function route(){
  const h = (location.hash || '#/planificacion').replace('#/','');
  if(h==='planificacion') return 'planificacion';
  if(h==='incidencias') return 'incidencias';
  if(h==='inventario') return 'inventario';
  if(h==='repuestos') return 'repuestos';
  if(h==='equipos') return 'equipos';
  if(h==='gruas') return 'gruas';
  if(h==='auxiliares') return 'auxiliares';
  if(h==='externas') return 'externas';
  if(h==='ot') return 'ot';
  if(h==='solicitudes') return 'solicitudes';
  return 'planificacion';
}

async function ensureBootstrap(){
  if(!state.token){
    openLogin();
    return false;
  }
  try{
    const boot = await apiGet('bootstrap');
    state.bootstrap = boot;
    state.me = boot.me;
    state.perms = boot.perms;

    // Semáforos globales (equipos/grúas/auxiliares)
    state.cache.semaforos = boot.state || {equipos:{}, gruas:{}, auxiliares:{}};

    qs('#meUser').textContent = boot.me?.usuario || 'Usuario';
    qs('#badgeRole').textContent = boot.me?.rol || '—';
    qs('#badgeRole').classList.remove('d-none');

    buildMenu();
    return true;
  }catch(e){
    state.token='';
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_ROLE);
    showAlert('warning', 'Sesión no válida. Vuelve a iniciar sesión.', true);
    openLogin();
    return false;
  }
}

function openLogin(){
  qs('#apiBaseLabel').textContent = API_BASE;
  const modal = new bootstrap.Modal(qs('#loginModal'));
  modal.show();
}

async function doLogin(){
  const user = qs('#loginUser').value.trim();
  const pass = qs('#loginPass').value;
  if(!user || !pass) return showAlert('warning', 'Introduce usuario y contraseña.');

  try{
    const data = await apiPost({res:'auth', fn:'login', user, pass});
    state.token = data.token;
    localStorage.setItem(LS_TOKEN, data.token);
    localStorage.setItem(LS_ROLE, data.rol || '');
    showAlert('success', 'Acceso correcto.');
    await ensureBootstrap();
    bootstrap.Modal.getInstance(qs('#loginModal'))?.hide();
    await render();
  }catch(e){
    showAlert('danger', 'Login fallido: ' + e.message, true);
  }
}

function logout(){
  state.token='';
  state.bootstrap=null;
  state.me=null;
  state.perms=null;
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_ROLE);
  showAlert('info','Sesión cerrada.');
  openLogin();
}

function setupGlobalUI(){
  qs('#btnMenu')?.addEventListener('click', ()=> {
    const oc = new bootstrap.Offcanvas(qs('#sideMenu'));
    oc.show();
  });
  qs('#btnLogin')?.addEventListener('click', doLogin);
  qs('#btnOpenLogin')?.addEventListener('click', (e)=>{ e.preventDefault(); openLogin(); });
  qs('#btnLogout')?.addEventListener('click', (e)=>{ e.preventDefault(); logout(); });

  window.addEventListener('hashchange', render);
}

function getEquipLists(){
  const equipos = state.bootstrap?.equipos || [];
  const gruas = state.bootstrap?.gruas || [];
  const auxiliares = state.bootstrap?.auxiliares || [];
  return {equipos, gruas, auxiliares};
}

function normalizeSemEstadoFront(x){
  const s = String(x||'').toLowerCase().trim();
  if(s==='verde' || s==='marcha' || s==='ok') return 'marcha';
  if(s==='amarillo' || s==='restriccion' || s==='restricción') return 'restriccion';
  if(s==='rojo' || s==='parada' || s==='stop') return 'parada';
  if(s==='azul' || s==='reparacion' || s==='reparación') return 'reparacion';
  if(['marcha','restriccion','parada','reparacion'].includes(s)) return s;
  return s || 'marcha';
}

function getSemEstado(tipo, id){
  const t = String(tipo||'').toLowerCase().trim();
  const key = (t==='auxiliares' || t==='auxilia') ? 'auxiliares' : (t==='gruas' || t==='grua') ? 'gruas' : 'equipos';
  const _id = String(id||'').trim();
  const st = state.cache.semaforos?.[key]?.[_id]?.estado;
  return normalizeSemEstadoFront(st || 'marcha');
}

async function refreshStateAll(){
  try{
    const data = await apiGet('state');
    state.cache.semaforos = data || {equipos:{}, gruas:{}, auxiliares:{}};
  }catch(e){
    // si falla, mantenemos el último estado conocido
    console.warn('No se pudo refrescar state', e);
  }
}

function planCategoriesFromExcel(){
  // Basado en tu Excel (hoja equipos): columna "linea"
  const equipos = state.bootstrap?.equipos || [];
  const cats = {
    'Línea Kaltenbach': equipos.filter(e=> String(e.linea||'').toUpperCase().includes('KALTENBACH')),
    'Láser Trumpf': equipos.filter(e=> normStr(e.linea).includes('LASER') || normStr(e.linea).includes('LÁSER') || String(e.linea||'').toUpperCase().includes('TRUMPF')),
    'Equipos independientes': equipos.filter(e=> String(e.linea||'').toUpperCase().includes('INDEPEND'))
  };

  return [
    {key:'KALTENBACH', title:'Línea Kaltenbach', items:cats['Línea Kaltenbach']},
    {key:'LASER', title:'Láser Trumpf', items:cats['Láser Trumpf']},
    {key:'INDEPENDIENTES', title:'Equipos independientes', items:cats['Equipos independientes']}
  ];
}

function pickDefaultPlanSelection(){
  // Por defecto: "Pintura" dentro de Kaltenbach (según tu Excel: equipos.nombre contiene "PINTURA")
  const cats = planCategoriesFromExcel();
  const kal = cats.find(c=>c.key==='KALTENBACH');
  const list = kal?.items || [];
  const paint = list.find(e=> normStr(e.nombre).includes('PINTURA')) || list[0];
  if(paint){
    state.selectedPlan.linea = 'KALTENBACH';
    state.selectedPlan.equipId = String(paint.id||'').trim();
    state.selectedPlan.equipNombre = paint.nombre || '';
  }
}

function matchPlanRowsToSelection(rows, selection){
  // Empareja filas de planificacion con la máquina seleccionada.
  // Tu Excel usa OUTPUT como identificador principal (y a veces MAQUINA/MAQ).
  rows = Array.isArray(rows) ? rows : [];
  selection = selection || {};

  const equipId = selection.equipId;
  const equipos = state.bootstrap?.equipos || [];
  const equip = equipos.find(e=> String(e.id||'').trim()===String(equipId||'').trim()) || null;

  if(!equip) return rows;

  const equipNameN  = normStr(equip.nombre||'');
  const equipModelN = normStr(equip.modelo||'');
  const isPaint = equipNameN.includes('PINTURA');

  return rows.filter(r=>{
    const outN = normStr(r.output || r.OUTPUT || '');
    const maqN = normStr(r.maquina || r.maq || r.MAQUINA || r.MAQ || '');
    const inN  = normStr(r.input || r.INPUT || ''); // compatibilidad

    // Pintura → filtra por OUTPUT (o MAQUINA si viene ahí)
    if(isPaint){
      return outN.includes('PINTURA') || maqN.includes('PINTURA') || inN.includes('PINTURA');
    }

    // Match por OUTPUT
    if(equipNameN && outN && (equipNameN.includes(outN) || outN.includes(equipNameN))) return true;
    if(equipModelN && outN && (equipModelN.includes(outN) || outN.includes(equipModelN))) return true;

    // Match por MAQUINA/MAQ
    if(equipNameN && maqN && (equipNameN.includes(maqN) || maqN.includes(equipNameN))) return true;
    if(equipModelN && maqN && (equipModelN.includes(maqN) || maqN.includes(equipModelN))) return true;

    // Casos típicos CDL
    if(equipNameN.includes('KDP3') && (outN.includes('KDPN3') || outN.includes('KDP3') || maqN.includes('KDPN3') || maqN.includes('KDP3'))) return true;
    if(equipNameN.includes('KDP1') && (outN.includes('KDPN1') || outN.includes('KDP1') || maqN.includes('KDPN1') || maqN.includes('KDP1'))) return true;

    return false;
  });
}

async function initPlanificacion(){
  if(!state.cache.plan){
    state.cache.plan = await apiGet('planificacion');
  }

  if(!state.selectedPlan.equipId) pickDefaultPlanSelection();

  const cats = planCategoriesFromExcel();
  const acc = qs('#planCats');

  acc.innerHTML = cats.map((c,idx)=>{
    const cid = `cat_${c.key}`;
    const show = (c.key===state.selectedPlan.linea) ? 'show' : '';
    const btns = (c.items||[]).map(e=>{
      const id = String(e.id||'').trim();
      const active = (id===String(state.selectedPlan.equipId||'')) ? 'active' : '';
      const label = e.nombre || e.modelo || ('Equipo '+id);
      return `<button type="button" class="list-group-item list-group-item-action ${active}" data-eid="${id}" data-elinea="${c.key}">${label}</button>`;
    }).join('') || '<div class="text-muted small p-2">Sin equipos</div>';

    return `
      <div class="accordion-item">
        <h2 class="accordion-header" id="h_${cid}">
          <button class="accordion-button ${idx===0?'':'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#${cid}">
            ${c.title}
          </button>
        </h2>
        <div id="${cid}" class="accordion-collapse collapse ${show}" data-bs-parent="#planCats">
          <div class="accordion-body p-0">
            <div class="list-group list-group-flush">${btns}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  qs('#planInfo').textContent = 'Basado en Excel: hoja "equipos" (línea) + hoja "planificacion" (datos).';
  qs('#planSelected').textContent = state.selectedPlan.equipNombre ? state.selectedPlan.equipNombre : '—';

  const isAdmin = isRole('admin');
  const btnReplace = qs('#btnPlanReplace');
  if(isAdmin) btnReplace.classList.remove('d-none');

  qsa('#planCats .list-group-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const eid = btn.getAttribute('data-eid');
      const elinea = btn.getAttribute('data-elinea');
      const label = btn.textContent.trim();

      state.selectedPlan.equipId = eid;
      state.selectedPlan.linea = elinea;
      state.selectedPlan.equipNombre = label;

      qsa('#planCats .list-group-item').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      qs('#planSelected').textContent = label;

      renderPlanTable();
    });
  });

  qs('#btnPlanReload')?.addEventListener('click', async ()=>{
    state.cache.plan = await apiGet('planificacion');
    renderPlanTable();
    showAlert('success','Planificación recargada.');
  });

  btnReplace?.addEventListener('click', ()=>{
    qs('#planReplaceHint')?.classList.toggle('d-none');
  });

  qs('#planSearch')?.addEventListener('input', ()=> renderPlanTable());

  renderPlanTable();
}

function renderPlanTable(){
  const rows = Array.isArray(state.cache.plan) ? state.cache.plan : [];
  const filteredBySel = matchPlanRowsToSelection(rows, state.selectedPlan);

  const q = normStr(qs('#planSearch')?.value || '');
  let items = filteredBySel;
  if(q){
    items = items.filter(r=> {
      const hay = normStr([
        r.id, r.cliente, r.deleg, r.output, r.picking, r.parte, r.carga, r.comentarios, r.input, r.maquina
      ].join(' '));
      return hay.includes(q);
    });
  }

  qs('#planCount').textContent = `(${items.length})`;

  const tb = qs('#planTbody');
  if(!items.length){
    tb.innerHTML = `<tr><td colspan="13" class="text-center p-4 text-muted">Sin registros para la selección actual</td></tr>`;
    return;
  }

  function boolCell(v){
    const b = (v===true || String(v).toLowerCase()==='true' || String(v)==='1');
    return b ? '✅' : '';
  }

  tb.innerHTML = items.map(r=>`
    <tr>
      <td>${r.id ?? ''}</td>
      <td>${r.cliente ?? ''}</td>
      <td>${r.deleg ?? ''}</td>
      <td>${r.uds ?? ''}</td>
      <td>${r.kgs ?? ''}</td>
      <td>${r.output ?? ''}</td>
      <td>${r.picking ?? ''}</td>
      <td>${r.parte ?? ''}</td>
      <td>${r.carga ?? ''}</td>
      <td>${r.comentarios ?? ''}</td>
      <td>${boolCell(r.alimentado)}</td>
      <td>${boolCell(r.terminado)}</td>
      <td class="text-muted small">${r.ts ?? ''}</td>
    </tr>
  `).join('');
}

async function initIncidencias(){
  try{
    const hq = (typeof parseHashQuery==='function') ? parseHashQuery() : {};
    if(hq && hq.equipo){
      const el = document.querySelector('#incEquipo');
      if(el) el.value = hq.equipo;
    }
  }catch(_e){}

  qs('#incInfo').textContent = 'Tarjetas + filtros + creación/finalización con semáforo.';
  qs('#btnIncReload')?.addEventListener('click', ()=> loadIncidencias());
  qs('#btnIncSearch')?.addEventListener('click', ()=> loadIncidencias());
  qs('#btnIncClear')?.addEventListener('click', ()=> {
    ['#fEquipo','#fQ'].forEach(s=> qs(s).value='');
    ['#fTipo','#fEstado'].forEach(s=> qs(s).value='');
    ['#fDesde','#fHasta'].forEach(s=> qs(s).value='');
    loadIncidencias();
  });

  qs('#btnIncOpenCreate')?.addEventListener('click', ()=> {
    fillIncEquipoSelect();
    new bootstrap.Modal(qs('#incCreateModal')).show();
  });
  qs('#incSemTipo')?.addEventListener('change', fillIncEquipoSelect);
  qs('#btnIncCreate')?.addEventListener('click', createIncidencia);

  await loadIncidencias();
}

function fillIncEquipoSelect(){
  const tipo = qs('#incSemTipo').value;
  const sel = qs('#incSemId');
  const lists = getEquipLists();
  const arr = (tipo==='equipos') ? lists.equipos : (tipo==='gruas') ? lists.gruas : lists.auxiliares;

  sel.innerHTML = arr.map(x=> {
    const id = String(x.id||'').trim();
    const name = x.nombre || x.modelo || ('ID '+id);
    return `<option value="${id}">${name}</option>`;
  }).join('');
}

async function loadIncidencias(){
  const params = {
    equipo: qs('#fEquipo')?.value || '',
    tipo: qs('#fTipo')?.value || '',
    estado: qs('#fEstado')?.value || '',
    q: qs('#fQ')?.value || '',
    desde: qs('#fDesde')?.value || '',
    hasta: qs('#fHasta')?.value || ''
  };

  try{
    const items = await apiGet('incidencias_search', params);
    state.cache.incid = Array.isArray(items) ? items : [];
    renderIncidencias();
  }catch(e){
    showAlert('danger','Error cargando incidencias: '+e.message, true);
  }
}

function stateBadge(estado){
  const st = String(estado||'').toLowerCase().trim();
  // Semáforo: colores uniformes en TODAS las páginas
  if(st.includes('marcha') || st==='verde') return '<span class="badge bg-success">marcha</span>';
  if(st.includes('restr')) return '<span class="badge bg-warning text-dark">restricción</span>';
  if(st.includes('parad') || st==='rojo') return '<span class="badge bg-danger">parada</span>';
  if(st.includes('repar') || st==='azul') return '<span class="badge bg-primary">reparación</span>';

  // Estados de incidencias/solicitudes
  if(st==='cerrada') return '<span class="badge text-bg-secondary">cerrada</span>';
  if(st==='abierta') return '<span class="badge text-bg-warning">abierta</span>';

  return `<span class="badge text-bg-light text-dark">${st||'—'}</span>`;
}

function renderIncidencias(){
  const grid = qs('#incGrid');
  const items = Array.isArray(state.cache.incid) ? state.cache.incid : [];
  qs('#incCount').textContent = `(${items.length})`;

  if(!items.length){
    grid.innerHTML = `<div class="text-muted">No hay incidencias con esos filtros.</div>`;
    return;
  }

  grid.innerHTML = items.slice().reverse().map(it=> {
    const id = it.id || '';
    const equipo = it.equipo || '';
    const resumen = it.resumen || (it.desc ? String(it.desc).slice(0,140) : '');
    const created = (it.created || it.inicio || '').toString();
    const estado = it.estado || 'abierta';

    return `
      <div class="card">
        <div class="card-body">
          <div class="d-flex align-items-start gap-2">
            <div class="me-auto">
              <div class="fw-semibold">${equipo}</div>
              <div class="text-muted small">${created}</div>
            </div>
            <div>${stateBadge(estado)}</div>
          </div>
          <hr class="my-2"/>
          <div class="small">${resumen}</div>
        </div>
        <div class="card-footer d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" data-act="copy" data-id="${id}">Copiar ID</button>
          <button class="btn btn-success btn-sm ms-auto" data-act="fin" data-id="${id}" ${String(estado).toLowerCase()==='cerrada'?'disabled':''}>Finalizar</button>
        </div>
      </div>
    `;
  }).join('');

  qsa('[data-act="copy"]').forEach(b=> b.addEventListener('click', ()=> {
    navigator.clipboard?.writeText(b.getAttribute('data-id')||'');
    showAlert('success','ID copiado.');
  }));

  qsa('[data-act="fin"]').forEach(b=> b.addEventListener('click', ()=> finalizeIncidencia(b.getAttribute('data-id'))));
}

async function createIncidencia(){
  const sem_tipo = qs('#incSemTipo').value;
  const sem_id = qs('#incSemId').value;
  const sem_estado = qs('#incSemEstado').value;

  const tipo = qs('#incTipo').value;
  const desc = qs('#incDesc').value.trim();
  const resumen = qs('#incResumen').value.trim();

  if(!sem_id || !desc){
    return showAlert('warning','Equipo y descripción son obligatorios.', true);
  }

  const equipoTxt = qs('#incSemId').selectedOptions[0]?.textContent || '';

  try{
    await apiPost({
      res:'incid', fn:'crear',
      token: state.token,
      equipo: equipoTxt,
      tipo,
      desc,
      resumen,
      sem_tipo,
      sem_id,
      sem_estado
    });

    showAlert('success','Incidencia creada.');
    qs('#incDesc').value='';
    qs('#incResumen').value='';
    bootstrap.Modal.getInstance(qs('#incCreateModal'))?.hide();
    await loadIncidencias();
  }catch(e){
    showAlert('danger','No se pudo crear: '+e.message, true);
  }
}

async function finalizeIncidencia(id){
  if(!id) return;

  const sem_tipo = qs('#incSemTipo')?.value || '';
  const sem_id = qs('#incSemId')?.value || '';

  try{
    await apiPost({
      res:'incid', fn:'finalize',
      token: state.token,
      id,
      sem_tipo,
      sem_id
    });
    showAlert('success','Incidencia finalizada (y semáforo a marcha si procede).');
    await loadIncidencias();
  }catch(e){
    showAlert('danger','No se pudo finalizar: '+e.message, true);
  }
}

async function render(){
  const ok = await ensureBootstrap();
  if(!ok) return;

  const r = route();
  if(r==='planificacion') {
    await loadView('planificacion');
    await initPlanificacion();
  } else if(r==='incidencias') {
    await loadView('incidencias');
    await initIncidencias();
  } else if(r==='inventario') {
    await loadView('inventario');
    await initInventario();
  } else if(r==='repuestos') {
    await loadView('repuestos');
    await initRepuestos();
  } else if(r==='equipos') {
    await loadView('equipos');
    await initEquipos();
  } else if(r==='gruas') {
    await loadView('gruas');
    await initGruas();
  } else if(r==='auxiliares') {
    await loadView('auxiliares');
    await initAuxiliares();
  } else if(r==='externas') {
    await loadView('externas');
    await initExternas();
  } else if(r==='ot') {
    await loadView('ot');
    await initOT();
  } else if(r==='solicitudes') {
    // esta página usa el mismo permiso que 'repuestos'
    await loadView('solicitudes');
    await initSolicitudes();
  }
}

(async function boot(){
  setupGlobalUI();
  await ensureBootstrap();
  if(state.token) await render();
  else openLogin();
})();

/* =========================
 * INVENTARIO (repuestos + consumibles)
 * - Repuestos: GET inventario_search (q,categoria,subcategoria,ubicacion)
 * - Consumibles: GET consumibles
 * - Ajuste stock: POST inv/delta (ref, delta)
 * - Import CSV (admin): POST inv/import (items)
 * ========================= */

function parseCSV(text){
  // Parser simple (coma o punto y coma). Soporta cabecera.
  const lines = String(text||'').replace(/\r/g,'').split('\n').filter(l=>l.trim().length);
  if(!lines.length) return [];
  const sep = (lines[0].includes(';') && !lines[0].includes(',')) ? ';' : ',';
  const split = (line)=>{
    const out=[]; let cur=''; let q=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){ q=!q; continue; }
      if(!q && ch===sep){ out.push(cur.trim()); cur=''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const head = split(lines[0]).map(h=>normStr(h));
  const hasHeader = head.includes('ref') || head.includes('desc') || head.includes('categoria');
  const start = hasHeader ? 1 : 0;
  const headers = hasHeader ? head : ['ref','desc','stock','min','categoria','codigo','subcategoria','ubicacion','unidad'];
  const rows=[];
  for(let i=start;i<lines.length;i++){
    const cols = split(lines[i]);
    const obj={};
    headers.forEach((h,idx)=> obj[h] = (cols[idx] ?? '').trim());
    rows.push(obj);
  }
  return rows;
}

async function initInventario(){
  // modo: 'rep' o 'cons'
  state.invMode = state.invMode || 'rep';
  state.invSelRef = null;

  const isAdmin = (state.me?.rol === 'admin');
  const btnImport = qs('#btnInvImportCsv');
  const fileInput = qs('#invImportFile');

  if(isAdmin){
    btnImport?.classList.remove('d-none');
    btnImport?.addEventListener('click', ()=> fileInput?.click());
    fileInput?.addEventListener('change', async (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      if(!f) return;
      try{
        toast('Leyendo CSV…');
        const txt = await f.text();
        const rows = parseCSV(txt).map(r=>({
          ref: r.ref || r.codigo || '',
          desc: r.desc || r.nombre || '',
          stock: Number(r.stock||0),
          min: Number(r.min||0),
          categoria: r.categoria || 'General',
          codigo: r.codigo || '',
          subcategoria: r.subcategoria || '',
          ubicacion: r.ubicacion || '',
          unidad: r.unidad || ''
        })).filter(x=>String(x.ref||'').trim() && String(x.desc||'').trim());

        if(!rows.length) return toast('CSV sin filas válidas');
        const ok = confirm(`Se van a importar ${rows.length} filas en inventario. ¿Continuar?`);
        if(!ok) return;

        await apiPost({res:'inv', fn:'import', items: rows});
        toast('Importado correctamente');
        state.cache.inv = null;
        await invLoadAndRender();
      }catch(e){
        console.error(e);
        toast('Error importando CSV');
      }finally{
        fileInput.value = '';
      }
    });
  }

  qs('#invTabRepuestos')?.addEventListener('click', async ()=>{
    state.invMode='rep';
    await invLoadAndRender(true);
  });
  qs('#invTabConsumibles')?.addEventListener('click', async ()=>{
    state.invMode='cons';
    await invLoadAndRender(true);
  });

  qs('#btnInvBuscar')?.addEventListener('click', async ()=> invLoadAndRender(true));
  qs('#invQ')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') invLoadAndRender(true); });

  qsa('.invDeltaBtn').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const delta = Number(String(b.dataset.delta||'0'));
      if(!state.invSelRef) return toast('Selecciona una fila primero');
      if(!delta) return;
      try{
        await apiPost({res:'inv', fn:'delta', ref: state.invSelRef, delta});
        toast(`Stock actualizado (${delta>0?'+':''}${delta})`);
        await invLoadAndRender(false);
      }catch(e){
        toast('No se pudo actualizar stock');
      }
    });
  });

  await invLoadAndRender(false);
}

function invSetTabs(){
  const a = qs('#invTabRepuestos');
  const b = qs('#invTabConsumibles');
  if(!a||!b) return;
  a.classList.toggle('btn-primary', state.invMode==='rep');
  a.classList.toggle('btn-outline-primary', state.invMode!=='rep');
  b.classList.toggle('btn-primary', state.invMode==='cons');
  b.classList.toggle('btn-outline-primary', state.invMode!=='cons');

  qsa('.inv-only-rep').forEach(el=>{
    el.classList.toggle('d-none', state.invMode!=='rep');
  });
}

async function invLoadAndRender(resetSel){
  invSetTabs();
  if(resetSel){ state.invSelRef=null; }
  const tbody = qs('#invTbody');
  const count = qs('#invCount');

  const q = qs('#invQ')?.value || '';
  const cat = qs('#invCat')?.value || '';
  const sub = qs('#invSub')?.value || '';
  const ub  = qs('#invUb')?.value || '';

  try{
    let items = [];
    if(state.invMode==='rep'){
      // server-side filter
      items = await apiGet('inventario_search', { q, categoria: cat, subcategoria: sub, ubicacion: ub });
      // normaliza para tabla
      items = (items||[]).map(x=>({
        ref: x.ref||x.codigo||'',
        desc: x.desc||x.nombre||'',
        stock: Number(x.stock||0),
        min: Number(x.min||0),
        categoria: x.categoria||'',
        subcategoria: x.subcategoria||'',
        ubicacion: x.ubicacion||'',
        unidad: x.unidad||''
      }));
    } else {
      items = await apiGet('consumibles');
      const nq = normStr(q);
      items = (items||[]).map(x=>({
        ref: x.ref||'',
        desc: x.nombre||x.desc||'',
        stock: Number(x.stock||0),
        min: Number(x.min||0),
        categoria: 'Consumibles',
        subcategoria: '',
        ubicacion: '',
        unidad: ''
      })).filter(x=>{
        if(!nq) return true;
        const hay = normStr(`${x.ref} ${x.desc}`);
        return hay.includes(nq);
      });
    }

    items.sort((a,b)=> (normStr(a.ref)).localeCompare(normStr(b.ref)));
    if(count) count.textContent = `${items.length} items`;
    if(!tbody) return;

    tbody.innerHTML = items.map((it,idx)=>`
      <tr class="inv-row ${state.invSelRef===it.ref?'row-select':''}" data-ref="${escapeHtml(it.ref)}">
        <td class="text-muted small">${idx+1}</td>
        <td><code>${escapeHtml(it.ref)}</code></td>
        <td>${escapeHtml(it.desc||'')}</td>
        <td class="text-end fw-semibold">${Number(it.stock||0)}</td>
        <td class="text-end">${Number(it.min||0)}</td>
        <td class="inv-only-rep">${escapeHtml(it.categoria||'')}</td>
        <td class="inv-only-rep">${escapeHtml(it.subcategoria||'')}</td>
        <td class="inv-only-rep">${escapeHtml(it.ubicacion||'')}</td>
        <td class="inv-only-rep">${escapeHtml(it.unidad||'')}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary invPickBtn" data-ref="${escapeHtml(it.ref)}">Seleccionar</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="10" class="text-muted p-3">Sin datos</td></tr>`;

    qsa('.invPickBtn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state.invSelRef = btn.dataset.ref || null;
        invLoadAndRender(false);
      });
    });

    // también seleccionar al clicar la fila
    qsa('tr.inv-row').forEach(tr=>{
      tr.addEventListener('click', (ev)=>{
        const ref = tr.getAttribute('data-ref');
        if(!ref) return;
        state.invSelRef = ref;
        invLoadAndRender(false);
      });
    });

  }catch(e){
    console.error(e);
    if(tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-danger p-3">Error cargando inventario</td></tr>`;
  }
}

/* =========================
 * REPUESTOS (solicitudes)
 * ========================= */
async function initRepuestos(){
  state.cache.rep = state.cache.rep || null;

  const modalEl = qs('#repModal');
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;

  qs('#btnRepNueva')?.addEventListener('click', ()=>{
    // limpia form
    ['repRef','repNombre','repQty','repUrgencia','repEquipo','repTipo','repComentario'].forEach(id=>{
      const el = qs('#'+id);
      if(!el) return;
      if(id==='repQty') el.value = 1;
      else el.value = '';
    });
    modal?.show();
  });

  qs('#btnRepGuardar')?.addEventListener('click', async ()=>{
    const ref = qs('#repRef')?.value?.trim() || '';
    const qty = Number(qs('#repQty')?.value || 0);
    if(!ref || qty<=0) return toast('Ref y cantidad obligatorios');
    const payload = {
      res:'rep', fn:'crear',
      ref,
      nombre: qs('#repNombre')?.value || '',
      qty,
      urgencia: qs('#repUrgencia')?.value || '',
      equipo: qs('#repEquipo')?.value || '',
      tipo: qs('#repTipo')?.value || '',
      comentario: qs('#repComentario')?.value || ''
    };
    try{
      await apiPost(payload);
      toast('Solicitud creada');
      state.cache.rep = null;
      modal?.hide();
      await repLoadAndRender();
    }catch(e){
      toast('No se pudo crear');
    }
  });

  qs('#btnRepFiltrar')?.addEventListener('click', repLoadAndRender);
  qs('#repQ')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') repLoadAndRender(); });

  await repLoadAndRender();
}

function canApproveRepuestos(){
  return !!(state.perms?.can?.rep_approve);
}

async function repLoadAndRender(){
  const tbody = qs('#repTbody');
  const count = qs('#repCount');
  const q = normStr(qs('#repQ')?.value || '');
  const estado = normStr(qs('#repEstado')?.value || '');
  const orden = (qs('#repOrden')?.value || 'desc');

  try{
    const items = await apiGet('repuestos');
    let list = (items||[]).map(x=>({
      id: String(x.id||''),
      created: x.created||'',
      ref: String(x.ref||''),
      nombre: String(x.nombre||''),
      qty: Number(x.qty||1),
      solicitante: String(x.solicitante||''),
      estado: normStr(x.estado||'pendiente'),
      fecha_prevista: x.fecha_prevista||'',
      comentario: String(x.comentario||''),
      tipo: String(x.tipo||''),
      equipo: String(x.equipo||''),
      urgencia: String(x.urgencia||'')
    }));

    if(estado) list = list.filter(x=> x.estado===estado);
    if(q){
      list = list.filter(x=>{
        const hay = normStr(`${x.id} ${x.ref} ${x.nombre} ${x.equipo} ${x.tipo} ${x.urgencia} ${x.solicitante} ${x.comentario}`);
        return hay.includes(q);
      });
    }

    list.sort((a,b)=>{
      const da = String(a.created||'');
      const db = String(b.created||'');
      return orden==='asc' ? da.localeCompare(db) : db.localeCompare(da);
    });

    if(count) count.textContent = `${list.length} solicitudes`;

    const approve = canApproveRepuestos();
    const mkEstado = (s)=>{
      const x = normStr(s);
      const cls = (x==='pendiente')?'badge bg-warning text-dark' :
                  (x==='aprobado')?'badge bg-success' :
                  (x==='rechazado')?'badge bg-danger' :
                  (x==='planificado')?'badge bg-info text-dark' :
                  (x==='pedido')?'badge bg-primary' :
                  (x==='recibido')?'badge bg-secondary' : 'badge bg-light text-dark';
      return `<span class="${cls}">${escapeHtml(s||'')}</span>`;
    };

    if(!tbody) return;
    tbody.innerHTML = list.map(x=>{
      const actions = [];
      actions.push(`<button class="btn btn-sm btn-outline-secondary repComBtn" data-id="${escapeHtml(x.id)}" title="Añadir comentario">💬</button>`);
      if(approve){
        actions.push(`<button class="btn btn-sm btn-outline-success repApBtn" data-id="${escapeHtml(x.id)}">Aprobar</button>`);
        actions.push(`<button class="btn btn-sm btn-outline-danger repReBtn" data-id="${escapeHtml(x.id)}">Rechazar</button>`);
        actions.push(`<button class="btn btn-sm btn-outline-info repPlBtn" data-id="${escapeHtml(x.id)}">Planif.</button>`);
        actions.push(`<button class="btn btn-sm btn-outline-primary repPeBtn" data-id="${escapeHtml(x.id)}">Pedido</button>`);
        actions.push(`<button class="btn btn-sm btn-outline-secondary repRcBtn" data-id="${escapeHtml(x.id)}">Recibido</button>`);
      }
      return `
        <tr>
          <td><code>${escapeHtml(x.id)}</code></td>
          <td><code>${escapeHtml(x.ref)}</code></td>
          <td>${escapeHtml(x.nombre||'')}</td>
          <td class="text-end">${x.qty}</td>
          <td>${escapeHtml(x.equipo||'')}</td>
          <td>${escapeHtml(x.tipo||'')}</td>
          <td>${escapeHtml(x.urgencia||'')}</td>
          <td>${mkEstado(x.estado)}</td>
          <td>${escapeHtml(x.fecha_prevista||'')}</td>
          <td>${escapeHtml(x.solicitante||'')}</td>
          <td class="text-nowrap">${actions.join(' ')}</td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="11" class="text-muted p-3">Sin solicitudes</td></tr>`;

    // Wire actions
    qsa('.repApBtn').forEach(b=> b.addEventListener('click', ()=> repAct('aprobar', b.dataset.id)));
    qsa('.repReBtn').forEach(b=> b.addEventListener('click', async ()=>{
      const motivo = prompt('Motivo del rechazo:') || '';
      if(motivo===null) return;
      await repAct('rechazar', b.dataset.id, {motivo});
    }));
    qsa('.repPlBtn').forEach(b=> b.addEventListener('click', async ()=>{
      const fecha_prevista = prompt('Fecha prevista (YYYY-MM-DD):') || '';
      if(!fecha_prevista) return;
      await repAct('planificar', b.dataset.id, {fecha_prevista});
    }));
    qsa('.repPeBtn').forEach(b=> b.addEventListener('click', ()=> repAct('marcar_pedido', b.dataset.id)));
    qsa('.repRcBtn').forEach(b=> b.addEventListener('click', ()=> repAct('marcar_recibido', b.dataset.id)));

    qsa('.repComBtn').forEach(b=> b.addEventListener('click', async ()=>{
      const comentario = prompt('Comentario:') || '';
      if(!comentario) return;
      try{
        await apiPost({res:'rep', fn:'comentar', id: b.dataset.id, comentario});
        toast('Comentario guardado');
        await repLoadAndRender();
      }catch(e){
        toast('No se pudo comentar');
      }
    }));

  }catch(e){
    console.error(e);
    if(tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-danger p-3">Error cargando repuestos</td></tr>`;
  }
}

async function repAct(fn, id, extra){
  if(!id) return;
  try{
    await apiPost({res:'rep', fn, id, ...(extra||{})});
    toast('Actualizado');
    await repLoadAndRender();
  }catch(e){
    toast('Acción no permitida o error');
  }
}


// Prefill de Incidencias desde hash: #/incidencias?equipo=...
function parseHashQuery(){
  const h = String(location.hash||'');
  const qidx = h.indexOf('?');
  if(qidx<0) return {};
  const qs = h.slice(qidx+1);
  const out = {};
  qs.split('&').forEach(p=>{
    const [k,v] = p.split('=');
    if(!k) return;
    out[decodeURIComponent(k)] = decodeURIComponent(v||'');
  });
  return out;
}


/* --------- GRÚAS page --------- */
function normNave(v){
  const s = normStr(v||'');
  if(!s) return '';
  // normaliza formatos típicos
  if(s.includes('nave1') || s=='1' || s=='n1') return 'nave 1';
  if(s.includes('nave2') || s=='2' || s=='n2') return 'nave 2';
  if(s.includes('nave3') || s=='3' || s=='n3') return 'nave 3';
  if(s.includes('nave4') || s=='4' || s=='n4') return 'nave 4';
  if(s.includes('nave 1')) return 'nave 1';
  if(s.includes('nave 2')) return 'nave 2';
  if(s.includes('nave 3')) return 'nave 3';
  if(s.includes('nave 4')) return 'nave 4';
  return s;
}


async function initEquipos(){
  qs('#btnEqRefresh')?.addEventListener('click', async ()=>{
    await refreshStateAll();
    await equiposRender();
  });
  qs('#eqSearch')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') equiposRender(); });
  qs('#eqLinea')?.addEventListener('change', equiposRender);
  qs('#eqSemFilter')?.addEventListener('change', equiposRender);

  await refreshStateAll();
  await equiposRender();
}

function matchLineaEquipo(e, lineaSel){
  const linea = String(e?.linea||'').toUpperCase();
  if(!lineaSel) return true;
  if(lineaSel==='kaltenbach') return linea.includes('KALTENBACH');
  if(lineaSel==='laser') return linea.includes('LASER') || linea.includes('LÁSER') || linea.includes('TRUMPF');
  if(lineaSel==='independientes') return linea.includes('INDEPEND');
  return true;
}

async function equiposRender(){
  const grid = qs('#eqGrid');
  if(!grid) return;

  const q = normStr(qs('#eqSearch')?.value || '');
  const lineaSel = String(qs('#eqLinea')?.value || '').toLowerCase().trim();
  const semSel = String(qs('#eqSemFilter')?.value || '').toLowerCase().trim();

  const list = (state.bootstrap?.equipos || []).slice();
  const canWrite = !!state.perms?.can?.state_write;

  const items = list.filter(e=>{
    if(!matchLineaEquipo(e, lineaSel)) return false;

    const id = String(e.id||'').trim();
    const st = getSemEstado('equipos', id);
    if(semSel && st!==semSel) return false;

    if(q){
      const hay = normStr([id, e.nombre, e.modelo, e.linea, e.nave, e.ubicacion].join(' '));
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  if(!items.length){
    grid.innerHTML = '<div class="col-12 text-muted p-3">Sin resultados.</div>';
    return;
  }

  grid.innerHTML = items.map(e=>{
    const id = String(e.id||'').trim();
    const name = e.nombre || e.modelo || ('Equipo '+id);
    const linea = e.linea || '';
    const estado = getSemEstado('equipos', id);
    const badge = stateBadge(estado);

    const quick = canWrite ? `
      <div class="btn-group btn-group-sm mt-2" role="group">
        <button class="btn btn-outline-success stQuick" data-t="equipos" data-id="${escapeHtml(id)}" data-s="marcha">Verde</button>
        <button class="btn btn-outline-warning stQuick" data-t="equipos" data-id="${escapeHtml(id)}" data-s="restriccion">Amarillo</button>
        <button class="btn btn-outline-danger stQuick" data-t="equipos" data-id="${escapeHtml(id)}" data-s="parada">Rojo</button>
        <button class="btn btn-outline-primary stQuick" data-t="equipos" data-id="${escapeHtml(id)}" data-s="reparacion">Azul</button>
      </div>
    ` : '';

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card eq-card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div>
                <div class="fw-semibold">${escapeHtml(name)}</div>
                <div class="small text-muted">ID: ${escapeHtml(id)}${linea ? ' · '+escapeHtml(linea) : ''}</div>
              </div>
              <div>${badge}</div>
            </div>

            <div class="d-flex gap-2 flex-wrap mt-2">
              <a class="btn btn-sm btn-outline-secondary" href="#incidencias?equipo=${encodeURIComponent(id)}">Crear incidencia</a>
            </div>

            ${quick}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Botones rápidos semáforo
  grid.querySelectorAll('.stQuick').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const tipo = btn.getAttribute('data-t');
      const id = btn.getAttribute('data-id');
      const s = btn.getAttribute('data-s');
      try{
        await apiPost({res:'state', fn:'set_estado', tipo, id, estado:s, motivo:''});
        await refreshStateAll();
        await equiposRender();
      }catch(e){
        showAlert('danger', 'No se pudo cambiar el estado: '+e.message, true);
      }
    });
  });
}


async function initGruas(){
  qs('#btnGrRefresh')?.addEventListener('click', async ()=>{
    await refreshStateAll();
    await gruasRender();
  });
  qs('#grSearch')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') gruasRender(); });
  qs('#grNave')?.addEventListener('change', gruasRender);

  await refreshStateAll();
  await gruasRender();
  qs('#grSemFilter')?.addEventListener('change', ()=>{ gruasRender(); });

}

async function gruasRender(){
  const wrap = qs('#grContent');
  if(!wrap) return;

  const q = normStr(qs('#grSearch')?.value || '');
  const naveSel = normStr(qs('#grNave')?.value || '');
  const semSel = String(qs('#grSemFilter')?.value || '').toLowerCase().trim();

  const canWrite = !!state.perms?.can?.state_write;

  const src = (state.bootstrap?.gruas || []);
  let list = src.map(g=>{
    const id = String(g.id||'').trim();
    const nombre = String(g.nombre||g.grua||g.eq_nombre||'').trim() || ('Grúa '+id);
    const nave = normNave(g.nave||g.ubicacion||g.zona||g.area||'');
    const estado = getSemEstado('gruas', id);
    return {id, nombre, nave, estado};
  }).filter(x=>x.id);

  if(naveSel) list = list.filter(x=> normStr(x.nave)===naveSel);
  if(semSel) list = list.filter(x=> x.estado===semSel);
  if(q){
    list = list.filter(x=> normStr(`${x.id} ${x.nombre} ${x.nave}`).includes(q));
  }

  // agrupa por nave
  const groups = {};
  list.forEach(x=>{
    const k = x.nave || 'sin nave';
    (groups[k] ||= []).push(x);
  });

  const order = ['nave 1','nave 2','nave 3','nave 4','sin nave'];
  const keys = [...new Set([...order.filter(k=>groups[k]?.length), ...Object.keys(groups).filter(k=>!order.includes(k))])];

  wrap.innerHTML = keys.map(k=>{
    const items = groups[k] || [];
    const cards = items.map(x=>{
      const badge = stateBadge(x.estado);
      const quick = canWrite ? `
        <div class="btn-group btn-group-sm mt-2" role="group">
          <button class="btn btn-outline-success stQuick" data-t="gruas" data-id="${escapeHtml(x.id)}" data-s="marcha">Verde</button>
          <button class="btn btn-outline-warning stQuick" data-t="gruas" data-id="${escapeHtml(x.id)}" data-s="restriccion">Amarillo</button>
          <button class="btn btn-outline-danger stQuick" data-t="gruas" data-id="${escapeHtml(x.id)}" data-s="parada">Rojo</button>
          <button class="btn btn-outline-primary stQuick" data-t="gruas" data-id="${escapeHtml(x.id)}" data-s="reparacion">Azul</button>
        </div>
      ` : '';

      return `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="card eq-card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div class="fw-semibold">${escapeHtml(x.nombre)}</div>
                  <div class="small text-muted">ID: ${escapeHtml(x.id)} · ${escapeHtml(k)}</div>
                </div>
                <div>${badge}</div>
              </div>

              <div class="d-flex gap-2 flex-wrap mt-2">
                <a class="btn btn-sm btn-outline-secondary" href="#incidencias?equipo=${encodeURIComponent(x.id)}">Crear incidencia</a>
              </div>

              ${quick}
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="mb-3">
        <div class="fw-semibold mb-2">${escapeHtml(k.toUpperCase())}</div>
        <div class="row g-3">${cards || '<div class="col-12 text-muted">Sin elementos</div>'}</div>
      </div>
    `;
  }).join('') || '<div class="text-muted p-3">Sin resultados.</div>';

  // Botones rápidos semáforo
  wrap.querySelectorAll('.stQuick').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const tipo = btn.getAttribute('data-t');
      const id = btn.getAttribute('data-id');
      const s = btn.getAttribute('data-s');
      try{
        await apiPost({res:'state', fn:'set_estado', tipo, id, estado:s, motivo:''});
        await refreshStateAll();
        await gruasRender();
      }catch(e){
        showAlert('danger', 'No se pudo cambiar el estado: '+e.message, true);
      }
    });
  });
}


/* --------- AUXILIARES page --------- */
async function initAuxiliares(){
  qs('#btnAxRefresh')?.addEventListener('click', async ()=>{
    await refreshStateAll();
    await auxRender();
  });
  qs('#axSearch')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') auxRender(); });

  await refreshStateAll();
  await auxRender();
  qs('#axSemFilter')?.addEventListener('change', ()=>{ auxRender(); });

}

async function auxRender(){
  const wrap = qs('#axContent');
  if(!wrap) return;

  const q = normStr(qs('#axSearch')?.value || '');
  const catSel = String(qs('#axCategoria')?.value || '').toLowerCase().trim();
  const semSel = String(qs('#axSemFilter')?.value || '').toLowerCase().trim();

  const canWrite = !!state.perms?.can?.state_write;

  const src = (state.bootstrap?.auxiliares || []);
  let list = src.map(a=>{
    const id = String(a.id||'').trim();
    const nombre = String(a.nombre||a.equipo||a.eq_nombre||'').trim() || ('Auxiliar '+id);
    const categoria = normStr(a.categoria||a.grupo||a.tipo||'');
    const estado = getSemEstado('auxiliares', id);
    return {id, nombre, categoria, estado};
  }).filter(x=>x.id);

  // categoría: "Equipos auxiliares" vs "Sistemas movilidad y transporte"
  if(catSel){
    if(catSel==='auxiliares'){
      list = list.filter(x=> !(x.categoria.includes('movilidad') || x.categoria.includes('transporte') || x.categoria.includes('elevacion') || x.categoria.includes('elevación')) );
    }else if(catSel==='movilidad'){
      list = list.filter(x=> (x.categoria.includes('movilidad') || x.categoria.includes('transporte') || x.categoria.includes('elevacion') || x.categoria.includes('elevación')) );
    }
  }

  if(semSel) list = list.filter(x=> x.estado===semSel);
  if(q){
    list = list.filter(x=> normStr(`${x.id} ${x.nombre} ${x.categoria}`).includes(q));
  }

  // agrupa por categoría (si viene) para que sea legible
  const groups = {};
  list.forEach(x=>{
    const k = x.categoria || 'auxiliares';
    (groups[k] ||= []).push(x);
  });

  const keys = Object.keys(groups);
  wrap.innerHTML = keys.map(k=>{
    const items = groups[k] || [];
    const cards = items.map(x=>{
      const badge = stateBadge(x.estado);
      const quick = canWrite ? `
        <div class="btn-group btn-group-sm mt-2" role="group">
          <button class="btn btn-outline-success stQuick" data-t="auxiliares" data-id="${escapeHtml(x.id)}" data-s="marcha">Verde</button>
          <button class="btn btn-outline-warning stQuick" data-t="auxiliares" data-id="${escapeHtml(x.id)}" data-s="restriccion">Amarillo</button>
          <button class="btn btn-outline-danger stQuick" data-t="auxiliares" data-id="${escapeHtml(x.id)}" data-s="parada">Rojo</button>
          <button class="btn btn-outline-primary stQuick" data-t="auxiliares" data-id="${escapeHtml(x.id)}" data-s="reparacion">Azul</button>
        </div>
      ` : '';

      return `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="card eq-card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div class="fw-semibold">${escapeHtml(x.nombre)}</div>
                  <div class="small text-muted">ID: ${escapeHtml(x.id)}${k ? ' · '+escapeHtml(k) : ''}</div>
                </div>
                <div>${badge}</div>
              </div>

              <div class="d-flex gap-2 flex-wrap mt-2">
                <a class="btn btn-sm btn-outline-secondary" href="#incidencias?equipo=${encodeURIComponent(x.id)}">Crear incidencia</a>
              </div>

              ${quick}
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="mb-3">
        <div class="fw-semibold mb-2">${escapeHtml(k || 'Auxiliares').toUpperCase()}</div>
        <div class="row g-3">${cards || '<div class="col-12 text-muted">Sin elementos</div>'}</div>
      </div>
    `;
  }).join('') || '<div class="text-muted p-3">Sin resultados.</div>';

  // Botones rápidos semáforo
  wrap.querySelectorAll('.stQuick').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const tipo = btn.getAttribute('data-t');
      const id = btn.getAttribute('data-id');
      const s = btn.getAttribute('data-s');
      try{
        await apiPost({res:'state', fn:'set_estado', tipo, id, estado:s, motivo:''});
        await refreshStateAll();
        await auxRender();
      }catch(e){
        showAlert('danger', 'No se pudo cambiar el estado: '+e.message, true);
      }
    });
  });
}



/* =========================
     * SUBCONTRATAS (externas)
     * ========================= */
    let _exRejectId = null;

    function exCanApprove(){
      return !!(state.perms?.can?.externas_approve);
    }

    function exBadge(estado){
      const s = normStr(estado||'pendiente');
      const cls = (s==='pendiente')?'badge bg-secondary' :
                  (s==='aprobada')?'badge bg-success' :
                  (s==='rechazada')?'badge bg-danger' :
                  (s==='cerrada')?'badge bg-dark' : 'badge bg-secondary';
      const label = s ? s[0].toUpperCase()+s.slice(1) : 'Pendiente';
      return `<span class="${cls}">${escapeHtml(label)}</span>`;
    }

    async function initExternas(){
      qs('#btnExRefresh')?.addEventListener('click', loadExternas);
      qs('#exSearch')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') renderExternas(); });
      qs('#exEstado')?.addEventListener('change', renderExternas);

      const btnNew = qs('#btnExNew');
      if(btnNew){
        btnNew.addEventListener('click', ()=>{
          const m = new bootstrap.Modal(qs('#modalExNew'));
          // defaults
          qs('#exEquipo').value = '';
          qs('#exProv').value = '';
          qs('#exAveria').value = '';
          qs('#exComentario').value = '';
          qs('#exSem').value = '';
          qs('#exReporta').value = (state.bootstrap?.me?.usuario || '');
          // fecha hoy
          try{
            const d = new Date();
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const dd = String(d.getDate()).padStart(2,'0');
            qs('#exFecha').value = `${yyyy}-${mm}-${dd}`;
          }catch(_e){}
          m.show();
        });
      }

      qs('#btnExCreate')?.addEventListener('click', async ()=>{
        const equipo = String(qs('#exEquipo')?.value||'').trim();
        const proveedor = String(qs('#exProv')?.value||'').trim();
        const averia = String(qs('#exAveria')?.value||'').trim();
        const comentario = String(qs('#exComentario')?.value||'').trim();
        const fecha = String(qs('#exFecha')?.value||'').trim();
        const sem = String(qs('#exSem')?.value||'').trim();
        const reporta = String(qs('#exReporta')?.value||'').trim();

        if(!equipo || !averia || !fecha || !sem || !reporta){
          toast('Faltan campos obligatorios');
          return;
        }

        // El backend actual guarda estado_equipo/fecha dentro de "nota" si se le pasan.
        const nota = `${averia}
REPORTA: ${reporta}${comentario?('\nCOMENTARIO: '+comentario):''}`;

        try{
          await apiPost({
            res:'externas', fn:'crear',
            equipo,
            proveedor,
            nota,
            estado_equipo: sem,
            fecha
          });
          toast('Solicitud creada');
          bootstrap.Modal.getInstance(qs('#modalExNew'))?.hide();
          await loadExternas();
        }catch(e){
          toast('Error creando solicitud');
        }
      });

      // Modal rechazo
      qs('#btnExDoReject')?.addEventListener('click', async ()=>{
        const motivo = String(qs('#exRejectMotivo')?.value||'').trim();
        if(!_exRejectId){ toast('ID inválido'); return; }
        try{
          await apiPost({res:'externas', fn:'rechazar', id:_exRejectId, motivo});
          toast('Rechazada');
          bootstrap.Modal.getInstance(qs('#modalExReject'))?.hide();
          await loadExternas();
        }catch(e){
          toast('Error al rechazar');
        }
      });

      await loadExternas();
    }

    async function loadExternas(){
      try{
        const list = await apiGet('externas');
        state.externas = Array.isArray(list) ? list : [];
      }catch(e){
        state.externas = [];
      }
      renderExternas();
    }

    function renderExternas(){
      const tbody = qs('#exTbody');
      if(!tbody) return;

      const q = normStr(qs('#exSearch')?.value||'');
      const est = normStr(qs('#exEstado')?.value||'');
      const can = exCanApprove();

      let rows = (state.externas||[]).map(x=>({
        id: String(x.id||'').trim(),
        created: String(x.created||''),
        equipo: String(x.equipo||''),
        proveedor: String(x.proveedor||''),
        estado: String(x.estado||'pendiente'),
        nota: String(x.nota||'')
      })).filter(r=>r.id);

      if(est) rows = rows.filter(r=> normStr(r.estado)===est);
      if(q){
        rows = rows.filter(r=> normStr(`${r.id} ${r.equipo} ${r.proveedor} ${r.estado} ${r.nota}`).includes(q));
      }

      rows.sort((a,b)=> String(b.created||'').localeCompare(String(a.created||'')));

      tbody.innerHTML = rows.map((r,idx)=>{
        const actions = [];
        if(can){
          if(normStr(r.estado)==='pendiente'){
            actions.push(`<button class="btn btn-sm btn-outline-success exApprove" data-id="${escapeHtml(r.id)}">Aprobar</button>`);
            actions.push(`<button class="btn btn-sm btn-outline-danger exReject" data-id="${escapeHtml(r.id)}">Rechazar</button>`);
          }
        }
        if(normStr(r.estado)!=='cerrada' && normStr(r.estado)!=='rechazada'){
          actions.push(`<button class="btn btn-sm btn-outline-dark exClose" data-id="${escapeHtml(r.id)}">Cerrar</button>`);
        }
        const det = escapeHtml(r.nota||'').replaceAll('\n','<br/>');
        return `
          <tr>
            <td class="text-muted small">${idx+1}</td>
            <td><code>${escapeHtml(r.id)}</code></td>
            <td class="small">${escapeHtml((r.created||'').slice(0,10))}</td>
            <td>${escapeHtml(r.equipo)}</td>
            <td>${escapeHtml(r.proveedor)}</td>
            <td>${exBadge(r.estado)}</td>
            <td class="small">${det}</td>
            <td class="text-nowrap">
              <div class="btn-group btn-group-sm" role="group">
                ${actions.join('')}
              </div>
            </td>
          </tr>
        `;
      }).join('') || `<tr><td colspan="8" class="text-muted p-3">Sin datos</td></tr>`;

      qsa('.exApprove').forEach(b=>{
        b.addEventListener('click', async ()=>{
          const id = b.dataset.id;
          try{
            await apiPost({res:'externas', fn:'aprobar', id});
            toast('Aprobada');
            await loadExternas();
          }catch(e){ toast('Error'); }
        });
      });

      qsa('.exClose').forEach(b=>{
        b.addEventListener('click', async ()=>{
          const id = b.dataset.id;
          try{
            await apiPost({res:'externas', fn:'cerrar', id});
            toast('Cerrada');
            await loadExternas();
          }catch(e){ toast('Error'); }
        });
      });

      qsa('.exReject').forEach(b=>{
        b.addEventListener('click', ()=>{
          _exRejectId = b.dataset.id;
          qs('#exRejectInfo').textContent = `Solicitud: ${_exRejectId}`;
          qs('#exRejectMotivo').value = '';
          new bootstrap.Modal(qs('#modalExReject')).show();
        });
      });
    }

    /* =========================
     * OT (Órdenes de Trabajo)
     * ========================= */
    let _otDoneId = null;

    function otBadge(estado){
      const s = normStr(estado||'abierta');
      const cls = (s==='abierta')?'badge bg-warning text-dark' :
                  (s==='finalizada')?'badge bg-success' : 'badge bg-secondary';
      const label = s ? s[0].toUpperCase()+s.slice(1) : 'Abierta';
      return `<span class="${cls}">${escapeHtml(label)}</span>`;
    }

    async function initOT(){
      qs('#btnOtRefresh')?.addEventListener('click', loadOT);
      qs('#otSearch')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') renderOT(); });
      qs('#otEstado')?.addEventListener('change', renderOT);

      qs('#btnOtNew')?.addEventListener('click', ()=>{
        const m = new bootstrap.Modal(qs('#modalOtNew'));
        qs('#otEquipo').value = '';
        qs('#otTipo').value = '';
        qs('#otTarea').value = '';
        m.show();
      });

      qs('#btnOtCreate')?.addEventListener('click', async ()=>{
        const equipo = String(qs('#otEquipo')?.value||'').trim();
        const tipo = String(qs('#otTipo')?.value||'').trim();
        const tarea = String(qs('#otTarea')?.value||'').trim();
        if(!equipo || !tarea){
          toast('Equipo y tarea obligatorios');
          return;
        }
        try{
          await apiPost({res:'ot', fn:'crear', equipo, tipo, tarea});
          toast('OT creada');
          bootstrap.Modal.getInstance(qs('#modalOtNew'))?.hide();
          await loadOT();
        }catch(e){
          toast('No permitido o error');
        }
      });

      qs('#btnOtDoDone')?.addEventListener('click', async ()=>{
        if(!_otDoneId){ toast('ID inválido'); return; }
        const intervenido_por = String(qs('#otDoneTec')?.value||'').trim();
        const descripcion = String(qs('#otDoneDesc')?.value||'').trim();
        try{
          await apiPost({res:'ot', fn:'complete', id:_otDoneId, intervenido_por, descripcion});
          toast('OT finalizada');
          bootstrap.Modal.getInstance(qs('#modalOtDone'))?.hide();
          await loadOT();
        }catch(e){
          toast('No permitido o error');
        }
      });

      await loadOT();
    }

    async function loadOT(){
      try{
        const list = await apiGet('ot');
        state.ot = Array.isArray(list) ? list : [];
      }catch(e){
        state.ot = [];
      }
      renderOT();
    }

    function renderOT(){
      const tbody = qs('#otTbody');
      if(!tbody) return;

      const q = normStr(qs('#otSearch')?.value||'');
      const est = normStr(qs('#otEstado')?.value||'');

      let rows = (state.ot||[]).map(x=>({
        id: String(x.id||'').trim(),
        fecha: String(x.fecha||x.created||''),
        equipo: String(x.equipo||''),
        tipo: String(x.tipo||''),
        tarea: String(x.tarea||''),
        estado: String(x.estado||'abierta')
      })).filter(r=>r.id);

      if(est) rows = rows.filter(r=> normStr(r.estado)===est);
      if(q){
        rows = rows.filter(r=> normStr(`${r.id} ${r.equipo} ${r.tipo} ${r.tarea} ${r.estado}`).includes(q));
      }

      rows.sort((a,b)=> String(b.fecha||'').localeCompare(String(a.fecha||'')));

      tbody.innerHTML = rows.map((r,idx)=>{
        const actions = [];
        if(normStr(r.estado)!=='finalizada'){
          actions.push(`<button class="btn btn-sm btn-outline-success otDone" data-id="${escapeHtml(r.id)}">Finalizar</button>`);
        }
        return `
          <tr>
            <td class="text-muted small">${idx+1}</td>
            <td><code>${escapeHtml(r.id)}</code></td>
            <td class="small">${escapeHtml((r.fecha||'').slice(0,10))}</td>
            <td>${escapeHtml(r.equipo)}</td>
            <td class="small">${escapeHtml(r.tipo)}</td>
            <td class="small">${escapeHtml(r.tarea)}</td>
            <td>${otBadge(r.estado)}</td>
            <td class="text-nowrap">
              <div class="btn-group btn-group-sm" role="group">${actions.join('')}</div>
            </td>
          </tr>
        `;
      }).join('') || `<tr><td colspan="8" class="text-muted p-3">Sin datos</td></tr>`;

      qsa('.otDone').forEach(b=>{
        b.addEventListener('click', ()=>{
          _otDoneId = b.dataset.id;
          qs('#otDoneInfo').textContent = `OT: ${_otDoneId}`;
          qs('#otDoneTec').value = (state.bootstrap?.me?.usuario || '');
          qs('#otDoneDesc').value = '';
          new bootstrap.Modal(qs('#modalOtDone')).show();
        });
      });
    }


/* =========================
 * NUEVAS SOLICITUDES
 * (repuestos + consumibles)
 * ========================= */
async function initSolicitudes(){
  const btnSend = qs('#btnSolSend');
  const btnClear = qs('#btnSolClear');

  function clearForm(){
    qs('#solTipo').value = 'repuesto';
    qs('#solQty').value = 1;
    qs('#solUrg').value = '';
    qs('#solRef').value = '';
    qs('#solNombre').value = '';
    qs('#solEquipo').value = '';
    qs('#solObs').value = '';
    qs('#solRef')?.focus();
  }

  async function send(){
    const tipo = String(qs('#solTipo')?.value||'repuesto').trim();
    const qty = Number(qs('#solQty')?.value||1);
    const urgencia = String(qs('#solUrg')?.value||'').trim();
    const ref = String(qs('#solRef')?.value||'').trim();
    const nombre = String(qs('#solNombre')?.value||'').trim();
    const equipo = String(qs('#solEquipo')?.value||'').trim();
    const obs = String(qs('#solObs')?.value||'').trim();

    if(!ref || !(qty>0)){
      toast('Referencia y cantidad obligatorias');
      return;
    }

    try{
      await apiPost({
        res:'rep', fn:'crear',
        ref,
        qty,
        nombre,
        equipo,
        urgencia,
        tipo,
        obs
      });
      toast('Solicitud creada');
      clearForm();
    }catch(e){
      toast('No permitido o error');
    }
  }

  btnClear?.addEventListener('click', clearForm);
  btnSend?.addEventListener('click', send);

  qs('#solRef')?.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){
      e.preventDefault();
      send();
    }
  });

  // Defaults
  clearForm();
  // prefill reportante not needed (backend uses token user)
}
