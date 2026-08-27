import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildMap, makeLabel, makeMapImagePlane, toMap } from './scene.js';
import { db, uid } from './db.js';
import { api, detectServer } from './api.js';

// Modo "online": há um backend (Railway) guardando os pontos/mídias para todo
// mundo; só o admin logado pode editar. Sem backend (arquivo aberto localmente
// com duplo clique), continua tudo local no navegador (IndexedDB), sem login.
let ONLINE = false;
let IS_ADMIN = false;
const mediaByMarker = new Map(); // online: markerId -> [{id,name,type,size,url,createdAt}]
const canEdit = () => !ONLINE || IS_ADMIN;
function setAdminUI(isAdmin) {
  IS_ADMIN = isAdmin;
  document.body.classList.toggle('can-edit', canEdit());
  const btn = document.getElementById('btnAdmin');
  if (btn) { btn.textContent = isAdmin ? '🔓 Sair do modo admin' : '🔒 Entrar como admin'; btn.classList.toggle('active', isAdmin); }
  nameEl.readOnly = !canEdit(); notesEl.readOnly = !canEdit();
}

// ---------------- Cena ----------------
const canvasWrap = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasWrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e7e1);
const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 2000);
const HOME = { pos: new THREE.Vector3(0, 92, 88), target: new THREE.Vector3(0, 0, 4) };
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.minDistance = 6; controls.maxDistance = 420;
controls.target.copy(HOME.target);
controls.listenToKeyEvents(window);
controls.keyPanSpeed = 25;

scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b4a6, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-60, 110, 60); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const map = buildMap();
scene.add(map.group);
let mapImagePlane = null;

// ---------------- Pan com Espaço + arrastar ----------------
let spaceHeld = false;
function setSpace(on) {
  if (spaceHeld === on) return;
  spaceHeld = on;
  controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  document.body.classList.toggle('space-pan', on);
  renderer.domElement.style.cursor = on ? 'move' : (mode === 'idle' ? 'grab' : 'crosshair');
}
window.addEventListener('keydown', e => {
  if (e.code !== 'Space' || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
  e.preventDefault(); setSpace(true);
});
window.addEventListener('keyup', e => { if (e.code === 'Space') setSpace(false); });
window.addEventListener('blur', () => setSpace(false));

// ---------------- Marcadores ----------------
const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#00acc1', '#6d4c41', '#000000'];
const markersGroup = new THREE.Group(); scene.add(markersGroup);
const markers = new Map(); // id -> { data, obj, label }
let selectedId = null;
let mode = 'idle'; // idle | add | move

function makePin(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.0, 16), m);
  cone.rotation.x = Math.PI; cone.position.y = 1.5; cone.castShadow = true;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 18), m);
  ball.position.y = 3.7; ball.castShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  g.add(cone, ball, ring);
  g.traverse(o => { o.userData.pin = true; });
  return g;
}
const pinLabel = name => makeLabel(name || 'Sem nome', { height: 2.0, fg: '#fff', bg: 'rgba(20,20,20,0.82)', font: 'bold 40px Segoe UI, Arial' });

function addMarkerToScene(data) {
  const obj = makePin(data.color);
  obj.position.set(data.x, data.y, data.z);
  obj.userData.markerId = data.id;
  const label = pinLabel(data.name); label.position.y = 6.4; obj.add(label);
  markersGroup.add(obj);
  markers.set(data.id, { data, obj, label });
  return markers.get(data.id);
}

function refreshMarkerVisual(id) {
  const m = markers.get(id); if (!m) return;
  m.obj.remove(m.label);
  m.label = pinLabel(m.data.name); m.label.position.y = 6.4; m.obj.add(m.label);
  m.obj.traverse(o => { if (o.material && o.material.color) o.material.color.set(m.data.color); });
  m.obj.position.set(m.data.x, m.data.y, m.data.z);
}

function saveMarker(data) { return ONLINE ? api.putMarker(data) : db.putMarker(data); }

async function createMarker(point) {
  const data = { id: uid(), name: 'Novo ponto', notes: '', color: COLORS[markers.size % COLORS.length], x: point.x, y: Math.max(point.y, 0), z: point.z, createdAt: Date.now() };
  const saved = await saveMarker(data);
  addMarkerToScene(ONLINE ? saved : data);
  renderList();
  selectMarker(data.id, { focusName: true });
}

async function deleteMarker(id) {
  const m = markers.get(id); if (!m) return;
  if (!confirm(`Excluir o ponto "${m.data.name}" e todas as mídias anexadas?`)) return;
  if (ONLINE) { await api.deleteMarker(id); mediaByMarker.delete(id); }
  else { await db.deleteMediaFor(id); await db.deleteMarker(id); }
  markersGroup.remove(m.obj);
  markers.delete(id);
  if (selectedId === id) closePanel();
  renderList();
}

// ---------------- Interação (raycast) ----------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;
const tooltip = document.getElementById('tooltip');

function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}
function pickMarker() {
  camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markersGroup.children, true);
  for (const h of hits) { let o = h.object; while (o && !o.userData.markerId) o = o.parent; if (o) return o.userData.markerId; }
  return null;
}
function pickSurface() {
  camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
  const list = mapImagePlane ? [mapImagePlane, ...map.pickables] : map.pickables;
  const hits = raycaster.intersectObjects(list, false);
  return hits[0] || null;
}

renderer.domElement.addEventListener('pointerdown', e => { downPos = { x: e.clientX, y: e.clientY, b: e.button }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downPos || e.button !== 0) { downPos = null; return; }
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 6 || spaceHeld) return;
  setPointer(e);
  if (mode === 'add' || mode === 'move') {
    const hit = pickSurface();
    if (!hit) return;
    if (mode === 'add') { createMarker(hit.point); setMode('idle'); }
    else if (mode === 'move' && selectedId) {
      const m = markers.get(selectedId);
      m.data.x = hit.point.x; m.data.y = Math.max(hit.point.y, 0); m.data.z = hit.point.z;
      saveMarker(m.data); refreshMarkerVisual(selectedId); setMode('idle');
    }
    return;
  }
  const id = pickMarker();
  if (id) selectMarker(id);
});

let hoverId = null;
renderer.domElement.addEventListener('pointermove', e => {
  setPointer(e);
  const id = pickMarker();
  if (id !== hoverId) {
    if (hoverId && markers.get(hoverId)) markers.get(hoverId).obj.scale.setScalar(1);
    hoverId = id;
    if (id && markers.get(id)) markers.get(id).obj.scale.setScalar(1.18);
    if (!spaceHeld) renderer.domElement.style.cursor = id ? 'pointer' : (mode === 'idle' ? 'grab' : 'crosshair');
  }
  const hit = pickSurface();
  const area = hit && hit.object.userData.area;
  if (area && !id) {
    tooltip.textContent = area.group ? `${area.label} · ${area.group}` : area.label;
    tooltip.style.display = 'block';
    tooltip.style.left = e.clientX + 14 + 'px'; tooltip.style.top = e.clientY + 14 + 'px';
  } else tooltip.style.display = 'none';
});
renderer.domElement.addEventListener('pointerleave', () => { tooltip.style.display = 'none'; });

function setMode(m) {
  mode = m;
  document.body.dataset.mode = m;
  document.getElementById('btnAdd').classList.toggle('active', m === 'add');
  document.getElementById('btnMove').classList.toggle('active', m === 'move');
  document.getElementById('hint').textContent =
    m === 'add' ? 'Clique em qualquer lugar do mapa para colocar o ponto (Esc cancela)'
    : m === 'move' ? 'Clique no novo lugar do ponto selecionado (Esc cancela)' : '';
  renderer.domElement.style.cursor = spaceHeld ? 'move' : (m === 'idle' ? 'grab' : 'crosshair');
}
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (mode !== 'idle') setMode('idle'); else if (document.getElementById('lightbox').classList.contains('open')) closeLightbox(); }
});

// ---------------- Câmera ----------------
let flight = null;
function flyTo(target, offset = new THREE.Vector3(0, 28, 26), ms = 700) {
  flight = { t0: performance.now(), ms, p0: camera.position.clone(), t0v: controls.target.clone(), p1: target.clone().add(offset), t1: target.clone() };
}
function tickFlight(now) {
  if (!flight) return;
  const k = Math.min(1, (now - flight.t0) / flight.ms); const e = 1 - Math.pow(1 - k, 3);
  camera.position.lerpVectors(flight.p0, flight.p1, e);
  controls.target.lerpVectors(flight.t0v, flight.t1, e);
  if (k >= 1) flight = null;
}
document.getElementById('btnHome').onclick = () => { flight = { t0: performance.now(), ms: 800, p0: camera.position.clone(), t0v: controls.target.clone(), p1: HOME.pos.clone(), t1: HOME.target.clone() }; };
document.getElementById('btnTop').onclick = () => { flight = { t0: performance.now(), ms: 800, p0: camera.position.clone(), t0v: controls.target.clone(), p1: new THREE.Vector3(0, 190, 0.5), t1: new THREE.Vector3(0, 0, 0) }; };
document.getElementById('btnLabels').onclick = e => { map.labels.visible = !map.labels.visible; e.currentTarget.classList.toggle('active', map.labels.visible); };
document.getElementById('btnAdd').onclick = () => canEdit() && setMode(mode === 'add' ? 'idle' : 'add');
document.getElementById('opacity').oninput = e => { const v = +e.target.value; map.wallMats.forEach(m => { m.opacity = v; m.transparent = v < 1; m.needsUpdate = true; }); };

// ---------------- Imagem do mapa ----------------
const mapImgInput = document.getElementById('mapImageInput');
document.getElementById('btnMapImage').onclick = () => canEdit() && mapImgInput.click();
mapImgInput.onchange = async () => {
  const f = mapImgInput.files[0]; if (!f) return;
  if (ONLINE) { const { url } = await api.setMapImage(f); applyMapImage(url); }
  else { await db.setSetting('mapImage', f); applyMapImage(f); }
  mapImgInput.value = '';
};
document.getElementById('btnMapImageClear').onclick = async () => {
  if (ONLINE) await api.clearMapImage(); else await db.deleteSetting('mapImage');
  applyMapImage(null);
};
function applyMapImage(src) {
  if (mapImagePlane) { scene.remove(mapImagePlane); mapImagePlane.material.map.dispose(); mapImagePlane = null; }
  document.getElementById('btnMapImageClear').style.display = src ? '' : 'none';
  if (!src) return;
  const isBlob = typeof src !== 'string';
  const url = isBlob ? URL.createObjectURL(src) : src;
  new THREE.TextureLoader().load(url, tex => { mapImagePlane = makeMapImagePlane(tex); scene.add(mapImagePlane); if (isBlob) URL.revokeObjectURL(url); });
}

// ---------------- Painel lateral (lista) ----------------
const listEl = document.getElementById('markerList');
const searchEl = document.getElementById('search');
searchEl.oninput = renderList;
function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  const items = [...markers.values()].filter(m => !q || (m.data.name + ' ' + m.data.notes).toLowerCase().includes(q))
    .sort((a, b) => a.data.name.localeCompare(b.data.name, 'pt-BR'));
  document.getElementById('count').textContent = `${markers.size} ponto${markers.size === 1 ? '' : 's'}`;
  listEl.innerHTML = '';
  if (!items.length) { listEl.innerHTML = `<div class="empty">${markers.size ? 'Nada encontrado.' : 'Nenhum ponto ainda.<br>Clique em <b>＋ Adicionar ponto</b> e depois no mapa.'}</div>`; return; }
  for (const m of items) {
    const el = document.createElement('div');
    el.className = 'item' + (m.data.id === selectedId ? ' sel' : '');
    el.innerHTML = `<span class="dot" style="background:${m.data.color}"></span><span class="nm"></span><span class="cnt"></span>`;
    el.querySelector('.nm').textContent = m.data.name || 'Sem nome';
    el.querySelector('.cnt').textContent = m.mediaCount ? `${m.mediaCount}` : '';
    el.onclick = () => { selectMarker(m.data.id); flyTo(m.obj.position); };
    listEl.appendChild(el);
  }
}

// ---------------- Painel do ponto ----------------
const panel = document.getElementById('panel');
const nameEl = document.getElementById('pName');
const notesEl = document.getElementById('pNotes');
const colorsEl = document.getElementById('pColors');
const mediaGrid = document.getElementById('mediaGrid');
const fileInput = document.getElementById('fileInput');
let objectUrls = [];

function selectMarker(id, { focusName = false } = {}) {
  selectedId = id;
  const m = markers.get(id); if (!m) return;
  panel.classList.add('open');
  nameEl.value = m.data.name; notesEl.value = m.data.notes || '';
  const p = toMap(m.obj.position);
  document.getElementById('pCoords').textContent = `x ${Math.round(p.px)} · y ${Math.round(p.py)}`;
  colorsEl.innerHTML = COLORS.map(c => `<button class="sw${c === m.data.color ? ' on' : ''}" style="background:${c}" data-c="${c}" title="${c}"></button>`).join('');
  colorsEl.querySelectorAll('.sw').forEach(b => b.onclick = () => { if (!canEdit()) return; m.data.color = b.dataset.c; saveMarker(m.data); refreshMarkerVisual(id); selectMarker(id); renderList(); });
  renderList();
  loadMedia(id);
  if (focusName) { nameEl.focus(); nameEl.select(); }
}
function closePanel() { selectedId = null; panel.classList.remove('open'); revokeUrls(); renderList(); }
document.getElementById('pClose').onclick = closePanel;
document.getElementById('pDelete').onclick = () => canEdit() && selectedId && deleteMarker(selectedId);
document.getElementById('btnMove').onclick = () => { if (canEdit() && selectedId) setMode(mode === 'move' ? 'idle' : 'move'); };
document.getElementById('pFly').onclick = () => { const m = markers.get(selectedId); if (m) flyTo(m.obj.position); };

let saveTimer = null;
function saveFields() {
  if (!canEdit()) return;
  const m = markers.get(selectedId); if (!m) return;
  m.data.name = nameEl.value.trim() || 'Sem nome'; m.data.notes = notesEl.value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveMarker(m.data); refreshMarkerVisual(m.data.id); renderList(); }, 250);
}
nameEl.oninput = saveFields; notesEl.oninput = saveFields;

// ---- mídias ----
function revokeUrls() { objectUrls.forEach(u => URL.revokeObjectURL(u)); objectUrls = []; }
const fmtSize = n => n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB';

async function loadMedia(id) {
  revokeUrls();
  mediaGrid.innerHTML = '<div class="empty">Carregando…</div>';
  const list = ONLINE ? (mediaByMarker.get(id) || []).slice() : await db.mediaFor(id);
  if (selectedId !== id) return;
  list.sort((a, b) => a.createdAt - b.createdAt);
  const m = markers.get(id); if (m) { m.mediaCount = list.length; renderList(); }
  mediaGrid.innerHTML = '';
  if (!list.length) { mediaGrid.innerHTML = '<div class="empty">Nenhum vídeo ou foto ainda.<br>Arraste arquivos aqui ou use <b>Adicionar vídeos/fotos</b>.</div>'; return; }
  for (const it of list) {
    const url = ONLINE ? it.url : URL.createObjectURL(it.blob);
    if (!ONLINE) objectUrls.push(url);
    const isVideo = it.type.startsWith('video/');
    const card = document.createElement('div'); card.className = 'media';
    card.innerHTML = `${isVideo ? `<video src="${url}" muted preload="metadata" playsinline></video><span class="play">▶</span>` : `<img src="${url}" alt="">`}
      <div class="meta"><span class="mn"></span><span class="ms">${fmtSize(it.size)}</span></div>
      <button class="del" title="Remover">✕</button>`;
    card.querySelector('.mn').textContent = it.name;
    card.onclick = e => { if (e.target.classList.contains('del')) return; openLightbox(it, url); };
    card.querySelector('.del').onclick = async () => {
      if (!canEdit() || !confirm(`Remover "${it.name}"?`)) return;
      if (ONLINE) { await api.deleteMedia(it.id); mediaByMarker.set(id, (mediaByMarker.get(id) || []).filter(x => x.id !== it.id)); }
      else await db.deleteMedia(it.id);
      loadMedia(id);
    };
    mediaGrid.appendChild(card);
  }
}
async function addFiles(files) {
  if (!canEdit() || !selectedId || !files?.length) return;
  const id = selectedId;
  const prog = document.getElementById('progress'); prog.style.display = 'block';
  let i = 0;
  for (const f of files) {
    i++; prog.textContent = `Salvando ${i}/${files.length}: ${f.name} (${fmtSize(f.size)})…`;
    if (!/^(video|image)\//.test(f.type)) continue;
    try {
      if (ONLINE) {
        const saved = await api.uploadMedia(id, f, e => { if (e.lengthComputable) prog.textContent = `Enviando ${i}/${files.length}: ${f.name} (${Math.round(e.loaded / e.total * 100)}%)…`; });
        mediaByMarker.set(id, [...(mediaByMarker.get(id) || []), saved]);
      } else {
        await db.putMedia({ id: uid(), markerId: id, name: f.name, type: f.type, size: f.size, blob: f, createdAt: Date.now() });
      }
    } catch (err) { alert(`Não foi possível salvar "${f.name}": ${err.message || err}`); }
  }
  prog.style.display = 'none';
  if (selectedId === id) loadMedia(id);
}
document.getElementById('pAddMedia').onclick = () => canEdit() && fileInput.click();
fileInput.onchange = () => { addFiles([...fileInput.files]); fileInput.value = ''; };
['dragenter', 'dragover'].forEach(ev => panel.addEventListener(ev, e => { e.preventDefault(); panel.classList.add('drop'); }));
['dragleave', 'drop'].forEach(ev => panel.addEventListener(ev, e => { e.preventDefault(); panel.classList.remove('drop'); }));
panel.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));

// ---- lightbox ----
const lightbox = document.getElementById('lightbox');
const lbBody = document.getElementById('lbBody');
function openLightbox(it, url) {
  lbBody.innerHTML = it.type.startsWith('video/') ? `<video src="${url}" controls autoplay playsinline></video>` : `<img src="${url}" alt="">`;
  document.getElementById('lbTitle').textContent = it.name;
  lightbox.classList.add('open');
}
function closeLightbox() { lightbox.classList.remove('open'); lbBody.innerHTML = ''; }
document.getElementById('lbClose').onclick = closeLightbox;
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

// ---------------- Exportar / Importar ----------------
document.getElementById('btnExport').onclick = async () => {
  const mediaMeta = ONLINE ? [...mediaByMarker.values()].flat() : await db.allMediaMeta();
  const data = { app: 'mapa-convento-3d', version: 1, exportedAt: new Date().toISOString(),
    markers: [...markers.values()].map(m => m.data),
    media: mediaMeta.map(({ id, markerId, name, type, size }) => ({ id, markerId, name, type, size })) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pontos-mapa-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
const importInput = document.getElementById('importInput');
document.getElementById('btnImport').onclick = () => canEdit() && importInput.click();
importInput.onchange = async () => {
  const f = importInput.files[0]; importInput.value = ''; if (!f || !canEdit()) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.markers)) throw new Error('arquivo inválido');
    let n = 0;
    for (const d of data.markers) {
      if (!d.id || typeof d.x !== 'number') continue;
      const saved = await saveMarker(d);
      const finalData = ONLINE ? saved : d;
      if (markers.has(d.id)) { markers.get(d.id).data = finalData; refreshMarkerVisual(d.id); } else addMarkerToScene(finalData);
      n++;
    }
    renderList(); alert(`${n} ponto(s) importado(s). As mídias não viajam no JSON — anexe novamente se necessário.`);
  } catch (err) { alert('Não foi possível importar: ' + (err.message || err)); }
};

// ---------------- Login de admin (só existe no modo online) ----------------
document.getElementById('btnAdmin')?.addEventListener('click', async () => {
  if (IS_ADMIN) {
    if (!confirm('Sair do modo admin?')) return;
    await api.logout().catch(() => {});
    setAdminUI(false);
    return;
  }
  const password = prompt('Senha de admin:');
  if (!password) return;
  try { await api.login(password); setAdminUI(true); }
  catch (err) { alert('Não foi possível entrar: ' + (err.message || err)); }
});

// ---------------- Boot ----------------
function resize() {
  const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

(async () => {
  ONLINE = await detectServer();
  document.body.classList.toggle('online', ONLINE);
  try {
    if (ONLINE) {
      const state = await api.state();
      state.markers.forEach(addMarkerToScene);
      for (const it of state.media) {
        mediaByMarker.set(it.markerId, [...(mediaByMarker.get(it.markerId) || []), it]);
        const m = markers.get(it.markerId); if (m) m.mediaCount = (m.mediaCount || 0) + 1;
      }
      const { url: mapImgUrl } = await api.getMapImage().catch(() => ({ url: null }));
      if (mapImgUrl) applyMapImage(mapImgUrl);
      const { isAdmin } = await api.me().catch(() => ({ isAdmin: false }));
      setAdminUI(isAdmin);
    } else {
      const saved = await db.allMarkers();
      saved.forEach(addMarkerToScene);
      const metas = await db.allMediaMeta();
      for (const mm of metas) { const m = markers.get(mm.markerId); if (m) m.mediaCount = (m.mediaCount || 0) + 1; }
      const img = await db.getSetting('mapImage');
      if (img) applyMapImage(img);
      // Sementes embutidas no HTML: instala pontos/mídias que ainda não existem neste navegador
      if (window.__SEED) {
        const have = new Set(saved.map(m => m.id));
        for (const d of window.__SEED.markers) if (!have.has(d.id)) { await db.putMarker(d); addMarkerToScene(d); }
        const haveMedia = new Set(metas.map(m => m.id));
        const toAdd = window.__SEED.media.filter(s2 => !haveMedia.has(s2.id));
        const loadEl = document.getElementById('loading');
        let i = 0;
        for (const s2 of toAdd) {
          i++; if (loadEl) loadEl.textContent = `Instalando vídeos e fotos neste navegador… ${i}/${toAdd.length}`;
          try {
            const blob = await (await fetch(`data:${s2.type};base64,${s2.b64}`)).blob();
            await db.putMedia({ id: s2.id, markerId: s2.markerId, name: s2.name, type: s2.type, size: blob.size, blob, createdAt: s2.createdAt || Date.now() });
            const m = markers.get(s2.markerId); if (m) m.mediaCount = (m.mediaCount || 0) + 1;
          } catch (err) { console.error('seed media', s2.name, err); }
        }
      }
      setAdminUI(true);
    }
  } catch (err) {
    console.error(err);
    if (!ONLINE) alert('Este navegador bloqueou o armazenamento local (IndexedDB). Abra o arquivo no Chrome ou Edge.');
  }
  renderList();
  if (!ONLINE && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  document.getElementById('loading').remove();
})();

renderer.setAnimationLoop(now => {
  tickFlight(now);
  controls.update();
  renderer.render(scene, camera);
});

// gancho de depuração (render forçado quando a aba está oculta)
window.__mapa = { renderer, scene, camera, controls, markers, render: () => { controls.update(); renderer.render(scene, camera); } };
