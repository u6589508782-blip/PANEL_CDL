/* =========================================================
   CDL · APP (Fase 3)
   - Menú usuario/roles (localStorage)
   - Cambio de contraseña (panel colapsable)
   - Menú hamburguesa (abrir/cerrar, Esc)
   - Carrusel sólo en Dashboard (placeholder)
   - Mover listados, selects y visibilidad por rol
   - Ganchos (TODO) para sincronizar con Sheets / CSV
========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  initRoleUI();
  initUserMenu();
  initPwdPanel();
  initDrawer();
  initCarousel();
  initForms();
  enforceRoleVisibility();

  // Si usas SW con SKIP_WAITING opcional:
  navigator.serviceWorker?.addEventListener?.('controllerchange', ()=>{ /* noop */ });
});

/* =========================
   ROLES (localStorage)
========================= */
function getRole(){ return localStorage.getItem('cdl_role') || 'invitado'; }
function setRole(r){ localStorage.setItem('cdl_role', r); }

function initRoleUI(){
  const role = getRole();
  const badge = document.getElementById('userRoleBadge');
  const name  = document.getElementById('userName');
  const sel   = document.getElementById('roleSelect');
  if(badge) badge.textContent = role.charAt(0).toUpperCase()+role.slice(1);
  if(name && name.textContent.trim()==='') name.textContent = 'Invitado';
  if(sel){
    [...sel.options].forEach(o => o.selected = (o.value === role));
  }
}

/* =========================
   Menú de usuario
========================= */
function initUserMenu(){
  const btn  = document.getElementById('userBtn');
  const menu = document.getElementById('userMenu');
  const apply= document.getElementById('applyRole');

  if(!btn || !menu) return;

  btn.addEventListener('click', () => {
    const open = menu.hasAttribute('hidden') ? false : true;
    if(open){
      menu.setAttribute('hidden','');
      btn.setAttribute('aria-expanded','false');
    }else{
      menu.removeAttribute('hidden');
      btn.setAttribute('aria-expanded','true');
    }
  });

  apply?.addEventListener('click', () => {
    const sel = document.getElementById('roleSelect');
    if(sel && sel.value){
      setRole(sel.value);
      initRoleUI();
      enforceRoleVisibility();
    }
  });

  document.getElementById('switchUser')?.addEventListener('click', () => {
    // TODO: lógica real de login. Por ahora, simple prompt.
    const who = prompt('Usuario (solo visual):','Invitado');
    if(who){
      const userName = document.getElementById('userName');
      if(userName) userName.textContent = who;
    }
  });

  // Cerrar si clic fuera
  document.addEventListener('click', (e)=>{
    if(!menu.contains(e.target) && e.target!==btn){
      if(!menu.hasAttribute('hidden')){
        menu.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false');
      }
    }
  });
}

/* =========================
   Cambio de contraseña (colapsable)
========================= */
function initPwdPanel(){
  const toggle = document.getElementById('togglePwdPanel');
  const panel  = document.getElementById('pwdPanel');
  if(!toggle || !panel) return;

  toggle.addEventListener('click', ()=>{
    const open = panel.hasAttribute('hidden') ? false : true;
    if(open){
      panel.setAttribute('hidden',''); toggle.setAttribute('aria-expanded','false');
    }else{
      panel.removeAttribute('hidden'); toggle.setAttribute('aria-expanded','true');
    }
  });

  document.getElementById('pwdApply')?.addEventListener('click', (e)=>{
    e.preventDefault();
    // TODO: Implementar con backend/Apps Script. De momento solo feedback.
    alert('Contraseña actualizada (demo).');
    panel.setAttribute('hidden',''); toggle.setAttribute('aria-expanded','false');
  });
}

/* =========================
   Drawer (menú hamburguesa)
========================= */
function initDrawer(){
  const openBtn  = document.getElementById('hamburgerBtn');
  const drawer   = document.getElementById('navDrawer');
  const closeBtn = document.getElementById('navClose');
  if(!openBtn || !drawer) return;

  const open = ()=>{
    drawer.removeAttribute('hidden');
    openBtn.setAttribute('aria-expanded','true');
    setTimeout(()=>{ document.getElementById('navSearch')?.focus(); }, 0);
    document.addEventListener('keydown', onEsc);
  };
  const close = ()=>{
    drawer.setAttribute('hidden','');
    openBtn.setAttribute('aria-expanded','false');
    document.removeEventListener('keydown', onEsc);
  };
  const onEsc = (e)=>{ if(e.key==='Escape') close(); };

  openBtn.addEventListener('click', ()=> !drawer || drawer.hasAttribute('hidden') ? open() : close());
  closeBtn?.addEventListener('click', close);
  drawer.addEventListener('click', (e)=>{
    // Cerrar si clic en fondo (opcional: si añades overlay)
  });

  // Buscador del drawer
  document.getElementById('navSearchForm')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const q = (document.getElementById('navSearch')?.value||'').trim();
    if(q){ /* TODO: navegar/filtrar según q */ }
    close();
  });
}

/* =========================
   Carrusel (sólo en Dashboard)
========================= */
function initCarousel(){
  const vp = document.getElementById('carouselViewport');
  if(!vp) return;

  // Placeholder de ejemplo. Reemplaza por tus imágenes reales.
  const slides = [
    {src:'linea-kaltenbach.png', alt:'Línea Kaltenbach'},
    {src:'logo_mantenimiento.png', alt:'Mantenimiento CDL'},
  ];
  vp.innerHTML = slides.map(s=>`<figure><img src="${s.src}" alt="${s.alt}"></figure>`).join('');

  let idx = 0;
  const prev = document.getElementById('carPrev');
  const next = document.getElementById('carNext');
  const go = (d)=>{
    idx = (idx + d + slides.length) % slides.length;
    vp.style.transform = `translateX(-${idx*100}%)`;
  };

  // Layout simple de carrusel horizontal
  vp.style.display='flex';
  vp.style.transition='transform .35s ease';
  [...vp.children].forEach(c=>{ c.style.minWidth='100%'; });

  prev?.addEventListener('click', ()=>go(-1));
  next?.addEventListener('click', ()=>go(+1));
}

/* =========================
   Formularios & Listas
========================= */
function initForms(){
  // EQUIPOS
  const equipoForm = document.getElementById('equipoFichaForm');
  equipoForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const val = document.getElementById('equipoQuery').value.trim() || document.getElementById('equipoSelect').value;
    if(val){ /* TODO: abrir ficha del equipo val */ }
  });

  // GRÚAS
  const gruaForm = document.getElementById('gruaFichaForm');
  gruaForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const val = document.getElementById('gruaQuery').value.trim() || document.getElementById('gruaSelect').value;
    if(val){ /* TODO: abrir ficha de la grúa val */ }
  });

  // AUXILIARES
  const auxForm = document.getElementById('auxFichaForm');
  auxForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const val = document.getElementById('auxQuery').value.trim() || document.getElementById('auxSelect').value;
    if(val){ /* TODO: abrir ficha del auxiliar val */ }
  });

  // INCIDENCIAS – Finalizar
  const finForm = document.getElementById('finIncidenciaForm');
  finForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    // TODO: enviar cierre de incidencia
    alert('Incidencia marcada como solucionada (demo).');
    // TODO: refrescar listado y semáforos
  });
  document.getElementById('finCat')?.addEventListener('change', syncFinElem);
  syncFinElem();

  // INCIDENCIAS – Buscador
  document.getElementById('buscaIncForm')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    // TODO: aplicar filtros y rellenar #incList
  });

  // INVENTARIO – Acciones
  document.getElementById('btnAddRep')?.addEventListener('click', ()=>{
    // TODO: abrir flujo añadir
  });
  document.getElementById('btnDecRep')?.addEventListener('click', ()=>{
    // TODO: abrir flujo descontar
  });
  document.getElementById('invSearchForm')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const q = document.getElementById('invQuery').value.trim();
    if(q){ /* TODO: filtrar catálogo/listado */ }
  });

  // SOLICITUDES
  document.getElementById('solForm')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    // TODO: enviar solicitud a Sheets
    alert('Solicitud enviada (demo).');
  });

  // OTs
  document.getElementById('otForm')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    // TODO: crear OT en Sheets
    alert('OT creada (demo).');
  });

  // TODO: Cargar CSV repuestos y poblar catálogo, selects, etc.
  // fetch('repuestos.csv').then(r=>r.text()).then(parseCSV).then(applyRepuestos);
}

/* =========================
   Visibilidad por rol
========================= */
function enforceRoleVisibility(){
  const role = getRole();
  // Mostrar solo admin
  document.querySelectorAll('[data-role="admin"]').forEach(el=>{
    if(role==='admin'){ el.removeAttribute('hidden'); } else { el.setAttribute('hidden',''); }
  });
}

/* =========================
   Utilidades (demo)
========================= */
function syncFinElem(){
  const cat = document.getElementById('finCat')?.value || 'equipos';
  const elem = document.getElementById('finElem');
  if(!elem) return;
  // TODO: reemplazar por datos reales desde Sheets / CSV / API
  const demo = {
    equipos:['KDP1','KDP3','KDM','Mazak FG-400 NEO'],
    gruas:['N1-01','N1-02','N2-01','N3-02','N4-01'],
    auxiliares:['Compresor 1','Secador 2','Horno pintura','Caldera']
  };
  elem.innerHTML = `<option value="">— Selecciona —</option>` +
    (demo[cat]||[]).map(v=>`<option value="${v}">${v}</option>`).join('');
}

/* Ejemplo simple de CSV -> array (si lo necesitas) */
function parseCSV(text){
  const rows = text.split(/\r?\n/).filter(Boolean);
  const [head, ...lines] = rows.map(r=>r.split(','));
  return lines.map(cells => Object.fromEntries(head.map((h,i)=>[h.trim(), (cells[i]||'').trim()])));
}
function applyRepuestos(items){
  // TODO: rellenar invCatalog, selects, etc. con items
}