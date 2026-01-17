/* =========================================================
 * CDL · CMMS · assets/app.js
 * Compatible con Code.gs V4 (res/fn) + index.html (menuItems, loginModal)
 * ========================================================= */

const state = {
  token: null,
  me: null,
  perms: null,
  bootstrap: null,
};

const qs = (s, p=document) => p.querySelector(s);
const qsa = (s, p=document) => [...p.querySelectorAll(s)];
const escapeHtml = (s)=> String(s ?? '').replace(/[&<>"']/g, m=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[m]));

/* =========================
 * ALERTAS
 * ========================= */
function showAlert(message, type='info'){
  const host = qs('#appAlert');
  if(!host) return;
  host.innerHTML = `
    <div class="alert alert-${escapeHtml(type)} alert-dismissible fade show" role="alert">
      ${escapeHtml(message)}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
    </div>
  `;
}
function clearAlert(){
  const host = qs('#appAlert');
  if(host) host.innerHTML = '';
}

/* =========================
 * API
 * ========================= */
async function apiGet(path, params={}){
  const url = new URL(window.API_BASE);
  url.searchParams.set('path', path);
  if(state.token) url.searchParams.set('token', state.token);

  Object.entries(params).forEach(([k,v])=>{
    if(v!==undefined && v!==null && String(v)!=='') url.searchParams.set(k,v);
  });

  const res = await fetch(url.toString(), { cache:'no-store' });
  const data = await res.json();
  if(data?.ok === false) throw new Error(data.error);
  return data;
}

async function apiPost(payload){
  const res = await fetch(window.API_BASE,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(data?.ok === false) throw new Error(data.error);
  return data;
}

/* =========================
 * UI (cabecera, API label)
 * ========================= */
function paintApiBase(){
  // OJO: hay 2 apiBaseLabel en tu index.html (menú + modal)
  qsa('#apiBaseLabel').forEach(el => el.textContent = window.API_BASE || '');
}

function paintMe(){
  const user = state.me?.usuario || '';
  const rol  = state.me?.rol || '';

  const meUser = qs('#meUser');
  if(meUser) meUser.textContent = user ? user : 'Usuario';

  const badge = qs('#badgeRole');
  if(badge) badge.textContent = rol ? rol : '—';
}

/* =========================
 * MENÚ (usa #menuItems)
 * ========================= */
function canSee(page){
  return Array.isArray(state.perms?.pages) && state.perms.pages.includes(page);
}

function buildMenu(){
  const ul = qs('#menuItems');
  if(!ul) return;

  const items = [];
  if(canSee('planificacion')) items.push(['planificacion','Planificación']);
  if(canSee('equipos')) items.push(['equipos','Equipos']);
  if(canSee('gruas')) items.push(['gruas','Puentes grúa']);
  if(canSee('auxiliares')) items.push(['auxiliares','Auxiliares']);
  if(canSee('incidencias')) items.push(['incidencias','Incidencias']);
  if(canSee('inventario')) items.push(['inventario','Inventario']);
  if(canSee('repuestos')) items.push(['repuestos','Repuestos']);
  if(canSee('externas')) items.push(['externas','Subcontratas']);
  if(canSee('ot')) items.push(['ot','OT']);
  if(canSee('kpi')) items.push(['kpi','KPIs']);

  ul.innerHTML = items.map(([k,l])=>`
    <li class="list-group-item p-0">
      <a class="d-block px-3 py-2 text-decoration-none" href="#/${k}">${escapeHtml(l)}</a>
    </li>
  `).join('');
}

/* =========================
 * OFFCANVAS
 * ========================= */
function openMenu(){
  const off = qs('#sideMenu');
  if(!off || !window.bootstrap) return;
  try{ window.bootstrap.Offcanvas.getOrCreateInstance(off).show(); }catch(_e){}
}

/* =========================
 * AUTH / BOOTSTRAP
 * ========================= */
function saveToken(t){
  state.token = t || null;
  if(t) localStorage.setItem('CDL_TOKEN', t);
  else localStorage.removeItem('CDL_TOKEN');
}

async function ensureBootstrap(){
  if(!state.token){
    state.token = localStorage.getItem('CDL_TOKEN');
  }
  if(!state.token){
    state.me = null;
    state.perms = null;
    buildMenu();
    paintMe();
    return false;
  }

  const boot = await apiGet('bootstrap'); // TU backend devuelve {me, perms, ...}
  state.bootstrap = boot;
  state.me = boot.me || null;
  state.perms = boot.perms || null;

  buildMenu();
  paintMe();
  return true;
}

async function doLogin(user, pass){
  // ✅ TU Code.gs exige res+fn
  const out = await apiPost({ res:'auth', fn:'login', user, pass });
  const token = out?.token || out?.data?.token || null;
  if(!token) throw new Error('Login sin token');
  saveToken(token);
  await ensureBootstrap();
}

function logout(){
  saveToken(null);
  state.me = null;
  state.perms = null;
  state.bootstrap = null;
  buildMenu();
  paintMe();
  clearAlert();
  location.hash = '#/planificacion';
}

/* =========================
 * LOGIN MODAL
 * ========================= */
function openLoginModal(){
  const modalEl = qs('#loginModal');
  if(!modalEl || !window.bootstrap) return;
  try{ window.bootstrap.Modal.getOrCreateInstance(modalEl).show(); }catch(_e){}
}
function closeLoginModal(){
  const modalEl = qs('#loginModal');
  if(!modalEl || !window.bootstrap) return;
  try{
    const inst = window.bootstrap.Modal.getInstance(modalEl);
    if(inst) inst.hide();
  }catch(_e){}
}

function wireUI(){
  const btnMenu = qs('#btnMenu');
  if(btnMenu) btnMenu.addEventListener('click', (e)=>{ e.preventDefault(); openMenu(); });

  const btnOpenLogin = qs('#btnOpenLogin');
  if(btnOpenLogin){
    btnOpenLogin.addEventListener('click', (e)=>{
      // Si no hay token, usamos modal en vez de dropdown “vacío”
      if(!state.token){
        e.preventDefault();
        openLoginModal();
      }
    });
  }

  const btnLogout = qs('#btnLogout');
  if(btnLogout) btnLogout.addEventListener('click', (e)=>{ e.preventDefault(); logout(); });

  const btnLogin = qs('#btnLogin');
  const inUser = qs('#loginUser');
  const inPass = qs('#loginPass');

  const actLogin = async ()=>{
    clearAlert();
    const user = (inUser?.value || '').trim();
    const pass = (inPass?.value || '');
    if(!user || !pass){
      showAlert('Introduce usuario y contraseña.', 'warning');
      return;
    }

    btnLogin.disabled = true;
    const old = btnLogin.textContent;
    btnLogin.textContent = 'Entrando…';

    try{
      await doLogin(user, pass);
      closeLoginModal();
      showAlert('Sesión iniciada.', 'success');
    }catch(err){
      showAlert(err?.message || 'No se pudo iniciar sesión.', 'danger');
    }finally{
      btnLogin.disabled = false;
      btnLogin.textContent = old || 'Entrar';
    }
  };

  if(btnLogin) btnLogin.addEventListener('click', (e)=>{ e.preventDefault(); actLogin(); });
  [inUser, inPass].forEach(el=>{
    if(!el) return;
    el.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){ e.preventDefault(); actLogin(); }
    });
  });
}

/* =========================
 * ROUTER / VISTAS
 * ========================= */
function normalizeHash(){
  const h = location.hash || '';
  if(!h) return;
  if(h.startsWith('#/')) return;
  if(h.startsWith('#') && h.length > 1){
    location.hash = '#/' + h.slice(1);
  }
}

function route(){
  normalizeHash();
  const raw = (location.hash || '#/planificacion');
  const clean = raw.startsWith('#/') ? raw.slice(2) : raw.replace('#','');
  return clean || 'planificacion';
}

async function loadView(name){
  const host = qs('#viewHost');
  if(!host) return;

  host.innerHTML = '<div class="p-3">Cargando…</div>';
  try{
    const res = await fetch(`views/${name}.html`, { cache:'no-store' });
    if(!res.ok) throw new Error('Vista no encontrada');
    host.innerHTML = await res.text();
  }catch(_e){
    host.innerHTML = `
      <div class="p-3">
        <div class="alert alert-warning">
          No se pudo cargar la vista <b>${escapeHtml(name)}</b>
        </div>
      </div>`;
  }
}

async function onNavigate(){
  await loadView(route());
}

window.addEventListener('hashchange', onNavigate);

/* =========================
 * ARRANQUE
 * ========================= */
window.addEventListener('load', async ()=>{
  paintApiBase();
  wireUI();
  await ensureBootstrap();
  paintMe();
  await onNavigate();
});