/* =========================================================
 * CDL · CMMS · APP FRONTEND
 * Arquitectura modular (index shell + /views + /assets)
 * ========================================================= */

const state = {
  token: null,
  me: null,
  perms: null,
  bootstrap: null,
  cache: {
    semaforos: { equipos:{}, gruas:{}, auxiliares:{} }
  }
};

/* =========================
 * HELPERS
 * ========================= */
const qs = (s, p=document) => p.querySelector(s);
const qsa = (s, p=document) => [...p.querySelectorAll(s)];
const escapeHtml = (s)=> String(s).replace(/[&<>"']/g, m=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[m]));

/* =========================
 * API
 * ========================= */
async function apiGet(path, params={}){
  const url = new URL(API_BASE);
  url.searchParams.set('path', path);
  if(state.token) url.searchParams.set('token', state.token);
  Object.entries(params).forEach(([k,v])=>{
    if(v!==undefined && v!==null && String(v)!=='') url.searchParams.set(k,v);
  });
  const res = await fetch(url.toString());
  const data = await res.json();
  if(data?.ok===false) throw new Error(data.error);
  return data;
}

async function apiPost(payload){
  const res = await fetch(API_BASE,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(payload)
  });
  const data = await res.json();
  if(data?.ok===false) throw new Error(data.error);
  return data;
}

/* =========================
 * AUTH / BOOTSTRAP
 * ========================= */
async function ensureBootstrap(){
  if(!state.token){
    state.token = localStorage.getItem('CDL_TOKEN');
    if(!state.token) return false;
  }
  const boot = await apiGet('bootstrap');
  state.bootstrap = boot;
  state.me = boot.me;
  state.perms = boot.perms;
  state.cache.semaforos = boot.state || state.cache.semaforos;
  buildMenu();
  return true;
}

/* =========================
 * MENU
 * ========================= */
function canSee(page){
  return state.perms?.pages?.includes(page);
}

function buildMenu(){
  const menu = qs('#sideMenu');
  if(!menu) return;

  const items = [];
  if(canSee('planificacion')) items.push(['planificacion','Planificación']);
  if(canSee('equipos')) items.push(['equipos','Equipos']);
  if(canSee('gruas')) items.push(['gruas','Puentes grúa']);
  if(canSee('auxiliares')) items.push(['auxiliares','Auxiliares']);
  if(canSee('incidencias')) items.push(['incidencias','Incidencias']);
  if(canSee('inventario')) items.push(['inventario','Inventario']);
  if(canSee('solicitudes')) items.push(['solicitudes','Nuevas solicitudes']);
  if(canSee('repuestos')) items.push(['repuestos','Repuestos']);
  if(canSee('externas')) items.push(['externas','Subcontratas']);
  if(canSee('ot')) items.push(['ot','OT']);
  if(canSee('kpi')) items.push(['kpi','KPIs']);

  menu.innerHTML = items.map(
    ([k,l])=>`<a href="#/${k}" class="menu-item">${l}</a>`
  ).join('');
}

/* =========================
 * ROUTER
 * ========================= */
function route(){
  const h = (location.hash || '#/planificacion').replace('#/','');
  return h || 'planificacion';
}

async function loadView(name){
  const host = qs('#viewHost');
  if(!host) return;

  host.innerHTML = '<div class="p-3">Cargando…</div>';
  try{
    const res = await fetch(`views/${name}.html`,{cache:'no-store'});
    if(!res.ok) throw new Error('Vista no encontrada');
    host.innerHTML = await res.text();
  }catch(e){
    host.innerHTML = `
      <div class="p-3">
        <div class="alert alert-warning">
          No se pudo cargar la vista <b>${escapeHtml(name)}</b>
        </div>
      </div>`;
  }
}

/* =========================
 * ARRANQUE (CLAVE)
 * ========================= */
async function onNavigate(){
  await loadView(route());
}

window.addEventListener('hashchange', onNavigate);

window.addEventListener('load', async ()=>{
  await ensureBootstrap();
  await onNavigate();
});