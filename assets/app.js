/* =========================================================
 * CDL · CMMS · APP FRONTEND (compatible con Code.gs V4)
 * ========================================================= */

const state = {
  token: null,
  me: null,
  perms: null,
  bootstrap: null,
  cache: { semaforos: { equipos:{}, gruas:{}, auxiliares:{} } }
};

const qs = (s, p=document) => p.querySelector(s);
const escapeHtml = (s)=> String(s).replace(/[&<>"']/g, m=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[m]));

function getBootstrap(){ return window.bootstrap || null; }

function setText(sel, txt){
  const el = qs(sel);
  if(el) el.textContent = (txt ?? '');
}

function setBadgeRole(role){
  const el = qs('#badgeRole');
  if(!el) return;
  const r = (role || '').toString().trim();
  el.textContent = r ? r : '—';
}

function normalizeHash(){
  const h = location.hash || '';
  if(!h) return;
  if(h.startsWith('#/')) return;
  if(h.startsWith('#') && h.length > 1){
    const fixed = '#/' + h.slice(1);
    if(location.hash !== fixed) location.hash = fixed;
  }
}

/* =========================
 * ALERTAS
 * ========================= */
function showAlert(message, type='info'){
  const host = qs('#appAlert');
  if(!host) return;
  const t = (type || 'info').toString();
  host.innerHTML = `
    <div class="alert alert-${escapeHtml(t)} alert-dismissible fade show" role="alert">
      ${escapeHtml(message || '')}
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
  const url = new URL(API_BASE);
  url.searchParams.set('path', path);
  if(state.token) url.searchParams.set('token', state.token);

  Object.entries(params).forEach(([k,v])=>{
    if(v!==undefined && v!==null && String(v)!=='') url.searchParams.set(k,v);
  });

  const res = await fetch(url.toString());
  const data = await res.json();
  if(data?.ok === false) throw new Error(data.error);
  return data;
}

async function apiPost(payload){
  const res = await fetch(API_BASE,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(data?.ok === false) throw new Error(data.error);
  return data;
}

/* =========================
 * UI CABECERA
 * ========================= */
function paintHeader(){
  // Ojo: si tienes ids duplicados (#apiBaseLabel en menú y en modal),
  // solo se rellenará el primero que encuentre el DOM.
  setText('#apiBaseLabel', (typeof API_BASE !== 'undefined') ? API_BASE : '');

  const userName = state.me?.usuario || state.me?.user || state.me?.email || '';
  setText('#meUser', userName ? userName : 'Usuario');
  setBadgeRole(state.me?.rol || state.me?.role || '');
}

function openMenu(){
  const b = getBootstrap();
  const off = qs('#sideMenu');
  if(!b || !off) return;
  try{ b.Offcanvas.getOrCreateInstance(off).show(); }catch(_e){}
}

function openLoginModal(){
  const b = getBootstrap();
  const modalEl = qs('#loginModal');
  if(!b || !modalEl) return;
  try{ b.Modal.getOrCreateInstance(modalEl).show(); }catch(_e){}
}

function closeLoginModal(){
  const b = getBootstrap();
  const modalEl = qs('#loginModal');
  if(!b || !modalEl) return;
  try{
    const inst = b.Modal.getInstance(modalEl);
    if(inst) inst.hide();
  }catch(_e){}
}

function logout(){
  state.token = null;
  state.me = null;
  state.perms = null;
  state.bootstrap = null;
  localStorage.removeItem('CDL_TOKEN');
  buildMenu();
  paintHeader();
  clearAlert();
  location.hash = '#/planificacion';
}

function wireTopbar(){
  const btnMenu = qs('#btnMenu');
  if(btnMenu) btnMenu.addEventListener('click', (e)=>{ e.preventDefault(); openMenu(); });

  const btnOpenLogin = qs('#btnOpenLogin');
  if(btnOpenLogin) btnOpenLogin.addEventListener('click', (e)=>{
    if(!state.token){
      e.preventDefault();
      openLoginModal();
    }
  });

  const btnLogout = qs('#btnLogout');
  if(btnLogout) btnLogout.addEventListener('click', (e)=>{ e.preventDefault(); logout(); });
}

/* =========================
 * LOGIN (FORMATO CORRECTO Code.gs)
 * ========================= */
function extractToken(out){
  return out?.token || out?.data?.token || out?.result?.token || null;
}

async function doLoginRequest(user, pass){
  // ✅ TU Code.gs exige res+fn para login
  const out = await apiPost({ res:'auth', fn:'login', user, pass });
  const token = extractToken(out);
  if(!token) throw new Error('Login sin token');
  return token;
}

function wireLoginModal(){
  const btn = qs('#btnLogin');
  const userEl = qs('#loginUser');
  const passEl = qs('#loginPass');
  if(!btn || !userEl || !passEl) return;

  const doLogin = async ()=>{
    clearAlert();
    const user = userEl.value.trim();
    const pass = passEl.value;

    if(!user || !pass){
      showAlert('Introduce usuario y contraseña.', 'warning');
      return;
    }

    btn.disabled = true;
    const oldTxt = btn.textContent;
    btn.textContent = 'Entrando…';

    try{
      const token = await doLoginRequest(user, pass);
      state.token = token;
      localStorage.setItem('CDL_TOKEN', token);

      await ensureBootstrap();
      paintHeader();
      closeLoginModal();
      await onNavigate();

      showAlert('Sesión iniciada.', 'success');
    }catch(err){
      showAlert(err?.message || 'No se pudo iniciar sesión.', 'danger');
    }finally{
      btn.disabled = false;
      btn.textContent = oldTxt || 'Entrar';
    }
  };

  btn.addEventListener('click', (e)=>{ e.preventDefault(); doLogin(); });
  [userEl, passEl].forEach(el=>{
    el.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){ e.preventDefault(); doLogin(); }
    });
  });

  const modalEl = qs('#loginModal');
  if(modalEl){
    modalEl.addEventListener('shown.bs.modal', ()=>{ try{ userEl.focus(); }catch(_e){} });
  }
}

/* =========================
 * BOOTSTRAP
 * ========================= */
async function ensureBootstrap(){
  if(!state.token){
    state.token = localStorage.getItem('CDL_TOKEN');
    if(!state.token){
      state.me = null;
      state.perms = null;
      state.bootstrap = null;
      buildMenu();
      paintHeader();
      return false;
    }
  }

  const boot = await apiGet('bootstrap');
  state.bootstrap = boot;

  // Tu backend devuelve: me: { usuario, rol }
  state.me = boot.me || null;

  // Tu backend devuelve: perms: { pages, can }
  state.perms = boot.perms || null;

  state.cache.semaforos = boot.state || state.cache.semaforos;

  buildMenu();
  paintHeader();
  return true;
}

/* =========================
 * MENÚ
 * ========================= */
function canSee(page){ return state.perms?.pages?.includes(page); }

function buildMenu(){
  const list = qs('#menuItems');
  const legacy = qs('#sideMenu');
  const menuTarget = list || legacy;
  if(!menuTarget) return;

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

  if(!items.length){
    menuTarget.innerHTML = '';
    return;
  }

  const isUL = (menuTarget.tagName || '').toLowerCase() === 'ul';
  if(isUL){
    menuTarget.innerHTML = items.map(([k,l])=>`
      <li class="list-group-item p-0">
        <a class="d-block px-3 py-2 text-decoration-none" href="#/${k}">${escapeHtml(l)}</a>
      </li>
    `.trim()).join('');
  }else{
    menuTarget.innerHTML = items.map(([k,l])=>`<a href="#/${k}" class="menu-item">${escapeHtml(l)}</a>`).join('');
  }
}

/* =========================
 * ROUTER
 * ========================= */
function route(){
  normalizeHash();
  const raw = (location.hash || '#/planificacion');
  const clean = raw.startsWith('#/') ? raw.slice(2) : raw.replace('#/','').replace('#','');
  return clean || 'planificacion';
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

async function onNavigate(){ await loadView(route()); }

window.addEventListener('hashchange', onNavigate);

window.addEventListener('load', async ()=>{
  wireTopbar();
  wireLoginModal();
  paintHeader();
  await ensureBootstrap();
  await onNavigate();
});