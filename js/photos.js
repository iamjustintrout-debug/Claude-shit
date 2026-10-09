// Roll photos, stored in IndexedDB (far more room than localStorage).
// Each record: { full: Blob (JPEG, max 1600px), thumb: Blob (JPEG, max 360px), w, h, added }.

const DB_NAME = 'devapp';
const STORE = 'photos';
let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const putPhoto = (id, rec) => tx('readwrite', (s) => s.put(rec, id));
export const getPhoto = (id) => tx('readonly', (s) => s.get(id));
export const deletePhoto = (id) => tx('readwrite', (s) => s.delete(id));

export const newPhotoId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}

function scaled(img, max, quality) {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k);
  const h = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((resolve) => c.toBlob((b) => resolve({ blob: b, w, h }), 'image/jpeg', quality));
}

// Shrink a picked file to a stored full image and a thumbnail.
// Browsers apply the photo's EXIF rotation when drawing, so orientation is kept.
export async function processImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const full = await scaled(img, 1600, 0.85);
    const thumb = await scaled(img, 360, 0.75);
    if (!full.blob || !thumb.blob) throw new Error('Could not process that image.');
    return { full: full.blob, thumb: thumb.blob, w: full.w, h: full.h, added: new Date().toISOString() };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export async function dataURLToBlob(url) {
  return (await fetch(url)).blob();
}
