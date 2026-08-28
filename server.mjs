import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const MAP_IMAGE_DIR = path.join(DATA_DIR, 'map-image');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias
if (!ADMIN_PASSWORD) console.warn('AVISO: ADMIN_PASSWORD não configurada — login de admin ficará impossível.');

fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(MAP_IMAGE_DIR, { recursive: true });

function loadMeta() {
  if (!fs.existsSync(META_FILE)) return { markers: [], media: [] };
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); }
  catch { return { markers: [], media: [] }; }
}
function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta));
}

// Bootstrap: se existe uma pasta seed/ no deploy, garante que seus pontos e
// mídias estejam no armazenamento persistente (idempotente — só adiciona o
// que ainda falta, então também "cura" instalações incompletas em redeploys).
async function bootstrapFromSeed() {
  const seedMetaPath = path.join(process.cwd(), 'seed', 'meta.json');
  const seedMediaDir = path.join(process.cwd(), 'seed', 'media');
  if (!fs.existsSync(seedMetaPath)) { if (!fs.existsSync(META_FILE)) saveMeta({ markers: [], media: [] }); return; }
  const seed = JSON.parse(fs.readFileSync(seedMetaPath, 'utf8'));
  const meta = loadMeta();
  const dirFiles = fs.existsSync(seedMediaDir) ? await fsp.readdir(seedMediaDir) : [];
  // nomes com acento podem ficar em formas Unicode diferentes (NFC/NFD) entre
  // o macOS de origem e o Linux do container — normaliza antes de comparar
  const norm = s => s.normalize('NFC');
  const dirFilesNorm = dirFiles.map(f => ({ raw: f, norm: norm(f) }));

  const haveMarkers = new Set(meta.markers.map(m => m.id));
  for (const m of seed.markers) if (!haveMarkers.has(m.id)) meta.markers.push(m);

  const mediaById = new Map(meta.media.map(m => [m.id, m]));
  let added = 0, fixed = 0;
  for (const m of seed.media) {
    const expectedName = norm(m.markerId.slice(0, 8) + '__' + m.name.replace(/[\/:*?"<>|]/g, '_'));
    const match = dirFilesNorm.find(f => f.norm === expectedName);
    const existing = mediaById.get(m.id);
    if (!match) { if (!existing) console.warn('bootstrap: faltando', m.name); continue; }
    const src = path.join(seedMediaDir, match.raw);
    const { size } = await fsp.stat(src);
    if (existing && existing.size === size) continue; // já instalada e correta
    const storedName = m.id + '__' + m.name.replace(/[\/:*?"<>|]/g, '_');
    await fsp.copyFile(src, path.join(MEDIA_DIR, storedName));
    const entry = { id: m.id, markerId: m.markerId, name: m.name, type: m.type, size, createdAt: m.createdAt || Date.now(), file: storedName };
    if (existing) { Object.assign(existing, entry); fixed++; }
    else { meta.media.push(entry); mediaById.set(m.id, entry); added++; }
  }
  saveMeta(meta);
  console.log(`bootstrap: ${meta.markers.length} pontos, ${meta.media.length}/${seed.media.length} mídias em ${DATA_DIR} (${added} adicionadas, ${fixed} corrigidas)`);
}
await bootstrapFromSeed();

// ---------------- Auth (senha única de admin) ----------------
function sign(payload) {
  const h = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
  return `${payload}.${h}`;
}
function verifyToken(token) {
  if (!token) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i), sig = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const exp = Number(payload.split(':')[1]);
  return Number.isFinite(exp) && Date.now() < exp;
}
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach(p => { const i = p.indexOf('='); if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function isAdminReq(req) { return verifyToken(parseCookies(req).admin_session); }
function requireAdmin(req, res, next) { if (!isAdminReq(req)) return res.status(401).json({ error: 'não autenticado' }); next(); }

// limita tentativas de senha por IP (memória, reinicia a cada deploy)
const loginAttempts = new Map();
function tooManyAttempts(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > 15 * 60 * 1000) { loginAttempts.delete(ip); return false; }
  return rec.count >= 10;
}
function registerAttempt(ip, ok) {
  if (ok) { loginAttempts.delete(ip); return; }
  const rec = loginAttempts.get(ip) || { count: 0, first: Date.now() };
  rec.count++; loginAttempts.set(ip, rec);
}

const app = express();
app.set('trust proxy', true);
app.use(express.json());

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (tooManyAttempts(ip)) return res.status(429).json({ error: 'muitas tentativas, aguarde alguns minutos' });
  const { password } = req.body || {};
  const ok = !!ADMIN_PASSWORD && typeof password === 'string' &&
    password.length === ADMIN_PASSWORD.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD));
  registerAttempt(ip, ok);
  if (!ok) return res.status(401).json({ error: 'senha incorreta' });
  const exp = Date.now() + SESSION_MAX_AGE_MS;
  const token = sign(`v1:${exp}`);
  res.cookie('admin_session', token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_MAX_AGE_MS, path: '/' });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.clearCookie('admin_session', { path: '/' }); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ isAdmin: isAdminReq(req) }));

app.get('/api/state', (req, res) => {
  const meta = loadMeta();
  res.json({
    markers: meta.markers,
    media: meta.media.map(({ file, ...m }) => ({ ...m, url: `/media/${encodeURIComponent(file)}` })),
  });
});

app.post('/api/markers', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.z !== 'number') return res.status(400).json({ error: 'coordenadas inválidas' });
  const meta = loadMeta();
  const id = b.id && meta.markers.some(m => m.id === b.id) ? b.id : (b.id || crypto.randomUUID());
  const data = { id, name: String(b.name || 'Sem nome').slice(0, 200), notes: String(b.notes || '').slice(0, 5000), color: String(b.color || '#e53935'), x: b.x, y: b.y, z: b.z, createdAt: b.createdAt || Date.now() };
  const idx = meta.markers.findIndex(m => m.id === id);
  if (idx >= 0) meta.markers[idx] = data; else meta.markers.push(data);
  saveMeta(meta);
  res.json(data);
});

app.delete('/api/markers/:id', requireAdmin, async (req, res) => {
  const meta = loadMeta();
  const keepMedia = [], toDelete = [];
  for (const m of meta.media) (m.markerId === req.params.id ? toDelete : keepMedia).push(m);
  for (const m of toDelete) await fsp.unlink(path.join(MEDIA_DIR, m.file)).catch(() => {});
  meta.media = keepMedia;
  meta.markers = meta.markers.filter(m => m.id !== req.params.id);
  saveMeta(meta);
  res.json({ ok: true });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
app.post('/api/media', requireAdmin, upload.single('file'), async (req, res) => {
  const f = req.file, markerId = req.body?.markerId;
  if (!f || !markerId) return res.status(400).json({ error: 'arquivo ou markerId ausente' });
  if (!/^(video|image)\//.test(f.mimetype)) return res.status(400).json({ error: 'tipo não suportado' });
  const meta = loadMeta();
  if (!meta.markers.some(m => m.id === markerId)) return res.status(404).json({ error: 'ponto não encontrado' });
  const id = crypto.randomUUID();
  const storedName = id + '__' + f.originalname.replace(/[\/:*?"<>|]/g, '_');
  await fsp.writeFile(path.join(MEDIA_DIR, storedName), f.buffer);
  const entry = { id, markerId, name: f.originalname, type: f.mimetype, size: f.size, createdAt: Date.now(), file: storedName };
  meta.media.push(entry); saveMeta(meta);
  const { file, ...pub } = entry;
  res.json({ ...pub, url: `/media/${encodeURIComponent(file)}` });
});

app.delete('/api/media/:id', requireAdmin, async (req, res) => {
  const meta = loadMeta();
  const entry = meta.media.find(m => m.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'não encontrada' });
  await fsp.unlink(path.join(MEDIA_DIR, entry.file)).catch(() => {});
  meta.media = meta.media.filter(m => m.id !== req.params.id);
  saveMeta(meta);
  res.json({ ok: true });
});

const mapImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
app.post('/api/mapimage', requireAdmin, mapImageUpload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f || !/^image\//.test(f.mimetype)) return res.status(400).json({ error: 'imagem inválida' });
  for (const old of await fsp.readdir(MAP_IMAGE_DIR)) await fsp.unlink(path.join(MAP_IMAGE_DIR, old)).catch(() => {});
  const name = 'current' + (path.extname(f.originalname) || '.png');
  await fsp.writeFile(path.join(MAP_IMAGE_DIR, name), f.buffer);
  res.json({ url: `/map-image/${name}?t=${Date.now()}` });
});
app.delete('/api/mapimage', requireAdmin, async (req, res) => {
  for (const old of await fsp.readdir(MAP_IMAGE_DIR)) await fsp.unlink(path.join(MAP_IMAGE_DIR, old)).catch(() => {});
  res.json({ ok: true });
});
app.get('/api/mapimage', (req, res) => {
  const files = fs.readdirSync(MAP_IMAGE_DIR);
  res.json({ url: files[0] ? `/map-image/${files[0]}` : null });
});

app.use('/media', express.static(MEDIA_DIR, { maxAge: '7d' }));
app.use('/map-image', express.static(MAP_IMAGE_DIR, { maxAge: '0' }));

const html = fs.readFileSync(path.join(process.cwd(), 'mapa-convento.html'));
app.get('/', (req, res) => { res.type('html').send(html); });

app.listen(PORT, () => console.log('listening on', PORT, '· data dir:', DATA_DIR));
