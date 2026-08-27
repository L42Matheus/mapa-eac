// Cliente do backend (modo "online"): pontos e mídias ficam no servidor,
// compartilhados por todos; só o admin logado pode escrever.
async function j(url, opts) {
  const r = await fetch(url, { credentials: 'same-origin', ...opts });
  if (!r.ok) { let msg = r.statusText; try { msg = (await r.json()).error || msg; } catch {} throw new Error(msg); }
  return r.status === 204 ? null : r.json();
}

export const api = {
  state: () => j('/api/state'),
  me: () => j('/api/me'),
  login: password => j('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }),
  logout: () => j('/api/logout', { method: 'POST' }),

  putMarker: data => j('/api/markers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteMarker: id => j(`/api/markers/${id}`, { method: 'DELETE' }),
  deleteMedia: id => j(`/api/media/${id}`, { method: 'DELETE' }),

  uploadMedia: (markerId, file, onProgress) => new Promise((resolve, reject) => {
    const fd = new FormData(); fd.append('markerId', markerId); fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media'); xhr.withCredentials = true;
    if (onProgress) xhr.upload.onprogress = onProgress;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else { let msg = xhr.statusText; try { msg = JSON.parse(xhr.responseText).error || msg; } catch {} reject(new Error(msg)); }
    };
    xhr.onerror = () => reject(new Error('erro de rede'));
    xhr.send(fd);
  }),

  getMapImage: () => j('/api/mapimage'),
  setMapImage: file => { const fd = new FormData(); fd.append('file', file); return j('/api/mapimage', { method: 'POST', body: fd }); },
  clearMapImage: () => j('/api/mapimage', { method: 'DELETE' }),
};

export async function detectServer() {
  try { return (await fetch('/api/state', { cache: 'no-store' })).ok; }
  catch { return false; }
}
