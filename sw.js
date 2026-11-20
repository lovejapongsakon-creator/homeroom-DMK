/* ระบบกิจกรรมโฮมรูม — Service Worker ("ผู้ช่วยตัวจิ๋ว")
   - หน้าเว็บ: ดึงของใหม่จากเน็ตก่อน ถ้าเน็ตหลุดจึงใช้ฉบับที่เก็บไว้
   - รูปภาพ/ไอคอน/ฟอนต์: ใช้ของในเครื่องก่อน (เปิดเร็ว)
   - ข้อมูลจาก Google Apps Script: ไม่เก็บเลย (ส่งตรงทุกครั้ง ปลอดภัย)
   เมื่ออัปเดตระบบ ให้เปลี่ยนเลข VERSION ด้านล่างทุกครั้ง */
const VERSION = 'hr-1.10.0';
const SHELL = 'shell-' + VERSION;
const MEDIA = 'media-v1';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest',
  './assets/logo.webp', './assets/icons/icon-192.png', './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(req), timeout(6000)]);
    if (res && res.ok) cache.put('./index.html', res.clone());
    return res;
  } catch (err) {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) { return hit || Response.error(); }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ข้อมูลระบบ (Apps Script) ส่งตรง ไม่เก็บ
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;

  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }

  if (url.origin === self.location.origin) {
    if (/\.(webp|png|jpe?g|svg|gif|ico)$/i.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
    if (/\.webmanifest$/i.test(url.pathname)) { e.respondWith(staleWhileRevalidate(req)); return; }
    return;
  }
  if (url.hostname === 'i.ibb.co') { e.respondWith(cacheFirst(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(staleWhileRevalidate(req)); return; }
});
