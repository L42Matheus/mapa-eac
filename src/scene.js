import * as THREE from 'three';
import { AREAS, GAZEBOS, TREES, STONE_PATH, MAP_W, MAP_H } from './layout.js';

export const S = 0.1; // 1 px da imagem = 0.1 unidade do mundo
export const toWorld = (px, py) => new THREE.Vector3((px - MAP_W / 2) * S, 0, (py - MAP_H / 2) * S);
export const toMap = v => ({ px: v.x / S + MAP_W / 2, py: v.z / S + MAP_H / 2 });

const STYLE = {
  room:     { floor: 0xf4f0e7, wall: 0xd6cfc2, h: 3.2, base: 0.3 },
  dorm:     { floor: 0xf1e6d8, wall: 0xd3c2ae, h: 3.2, base: 0.3 },
  bath:     { floor: 0xdceaf6, wall: 0xb7cfe3, h: 3.2, base: 0.3 },
  hall:     { floor: 0xe6e2d9, wall: null,     h: 0,   base: 0.3 },
  green:    { floor: 0x67a24c, wall: null,     h: 0,   base: 0.08 },
  water:    { floor: 0x2e8290, wall: null,     h: 0,   base: 0.05 },
  path:     { floor: 0x9c9a95, wall: null,     h: 0,   base: 0.15 },
  wood:     { floor: 0xb3673f, wall: 0x8e4f2d, h: 2.4, base: 0.3 },
  entrance: { floor: 0x8a2c2c, wall: null,     h: 0,   base: 2.4 },
};

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...opts });

function makeLabel(text, { font = 'bold 44px Segoe UI, Arial', fg = '#1d1d1b', bg = null, pad = 14, height = 1.7 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  const tw = Math.ceil(ctx.measureText(text).width);
  c.width = tw + pad * 2; c.height = 64 + pad;
  ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  if (bg) { ctx.fillStyle = bg; roundRect(ctx, 0, 0, c.width, c.height, 18); ctx.fill(); }
  ctx.fillStyle = fg; ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(height * c.width / c.height, height, 1);
  sp.renderOrder = 10;
  return sp;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export { makeLabel };

/** Constrói a planta. Retorna { group, pickables, labels, roomMeshes, wallMats } */
export function buildMap() {
  const group = new THREE.Group();
  const pickables = [];
  const labels = new THREE.Group();
  const roomMeshes = [];
  const wallMats = [];

  for (const a of AREAS) {
    const st = STYLE[a.type] || STYLE.room;
    const w = a.w * S, d = a.h * S;
    const c = toWorld(a.x + a.w / 2, a.y + a.h / 2);

    // piso / laje
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, st.base, d), mat(st.floor));
    floor.position.set(c.x, st.base / 2, c.z);
    floor.receiveShadow = true; floor.castShadow = st.base > 0.1;
    floor.userData = { area: a };
    group.add(floor); pickables.push(floor); roomMeshes.push(floor);

    // paredes
    if (st.wall && st.h > 0) {
      const t = 0.22, y = st.base + st.h / 2;
      const wm = mat(st.wall, { transparent: true });
      wallMats.push(wm);
      const walls = [
        [w, t, c.x, c.z - d / 2 + t / 2], [w, t, c.x, c.z + d / 2 - t / 2],
        [t, d, c.x - w / 2 + t / 2, c.z], [t, d, c.x + w / 2 - t / 2, c.z],
      ];
      for (const [ww, dd, x, z] of walls) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(ww, st.h, dd), wm);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
        m.userData = { area: a, wall: true };
        group.add(m); pickables.push(m); roomMeshes.push(m);
      }
    }

    // etiqueta
    if (!['hall'].includes(a.type) && a.label) {
      const isGround = st.h === 0;
      const lab = makeLabel(a.label, {
        height: isGround ? 2.2 : 1.5,
        fg: isGround ? '#ffffff' : '#1d1d1b',
        bg: isGround ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.78)',
      });
      const maxW = Math.max(w, d) * 1.35 + 2;
      if (lab.scale.x > maxW) { const k = maxW / lab.scale.x; lab.scale.multiplyScalar(k); }
      lab.position.set(c.x, st.base + st.h + 0.9, c.z);
      labels.add(lab);
    }
  }

  // gazebos do luau
  for (const [px, py, r] of GAZEBOS) {
    const p = toWorld(px, py);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * S, r * S, 0.25, 8), mat(0xa66a48));
    base.position.set(p.x, 0.2, p.z); base.receiveShadow = true; group.add(base); pickables.push(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * S * 1.05, 1.6, 8), mat(0x8f5234));
    roof.position.set(p.x, 3.0, p.z); roof.castShadow = true; group.add(roof);
    for (let i = 0; i < 8; i++) {
      const ang = i / 8 * Math.PI * 2 + Math.PI / 8;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), mat(0x5a3a28));
      post.position.set(p.x + Math.cos(ang) * r * S * 0.92, 1.3, p.z + Math.sin(ang) * r * S * 0.92);
      group.add(post);
    }
  }

  // árvores
  const trunkM = mat(0x6b4a2e), leafM = mat(0x3f8a3a);
  for (const [px, py, r] of TREES) {
    const p = toWorld(px, py); const rr = r * S;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.15, rr * 0.2, rr * 1.2, 7), trunkM);
    trunk.position.set(p.x, rr * 0.6, p.z); group.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(rr, 12, 10), leafM);
    crown.position.set(p.x, rr * 1.5, p.z); crown.castShadow = true; group.add(crown); pickables.push(crown);
  }

  // caminho de pedra do jardim interno
  const stoneM = mat(0x8f8f86);
  const pts = STONE_PATH.map(([x, y]) => toWorld(x, y));
  const curve = new THREE.CatmullRomCurve3(pts);
  for (const p of curve.getPoints(40)) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 8), stoneM);
    s.position.set(p.x, 0.16, p.z); group.add(s);
  }
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.5, 12), mat(0xb8b3a6));
  const fc = toWorld(810, 640); fountain.position.set(fc.x, 0.35, fc.z); group.add(fountain);

  // quadra da gincana e da área teal
  const court = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 3), mat(0xcfd8dc));
  const cc = toWorld(1565, 568); court.position.set(cc.x, 0.15, cc.z); group.add(court);
  const court2 = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 8), mat(0xbfd9dd));
  const c2 = toWorld(1410, 875); court2.position.set(c2.x, 0.12, c2.z); group.add(court2);

  // chão geral
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * S * 2.5, MAP_H * S * 2.5), mat(0xeceae4));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true;
  ground.userData = { ground: true };
  group.add(ground); pickables.push(ground);

  const grid = new THREE.GridHelper(MAP_W * S * 2.5, 80, 0xd8d5cc, 0xe2dfd6);
  grid.position.y = 0; group.add(grid);

  group.add(labels);
  return { group, pickables, labels, roomMeshes, wallMats };
}

/** Plano com a imagem original do mapa, alinhado exatamente às coordenadas da planta. */
export function makeMapImagePlane(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * S, MAP_H * S),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.95 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.userData = { ground: true };
  return m;
}
