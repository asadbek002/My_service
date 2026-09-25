const CACHE='myservice-shell-v2';const SHELL=['/offline','/icon.svg','/icon-192.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/')||u.origin!==self.location.origin)return;
  if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('/offline')));
  else if(u.pathname==='/icon.svg')e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
