// The installed app: pages always come from the network (fresh data, offline page as fallback); the app's
// code (/_next/static, named by content hash, never changes) is kept on the phone and served from there,
// so opening the app does not download ~400 KB of JavaScript again over a slow or distant connection.
const CACHE='myservice-shell-v5';const STATIC='myservice-static-v1';const SHELL=['/offline','/icon.svg','/icon-192.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==STATIC).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function fromStatic(req){
  const cache=await caches.open(STATIC);
  const hit=await cache.match(req);
  if(hit)return hit;
  const res=await fetch(req);
  if(res.ok&&res.type==='basic'){
    cache.put(req,res.clone());
    // Old builds' files pile up after each deploy: keep the newest 300.
    cache.keys().then(keys=>{if(keys.length>300)return Promise.all(keys.slice(0,keys.length-300).map(k=>cache.delete(k)));});
  }
  return res;
}
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api/')||u.origin!==self.location.origin)return;
  if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('/offline')));
  else if(u.pathname.startsWith('/_next/static/'))e.respondWith(fromStatic(e.request));
  else if(u.pathname==='/icon.svg')e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
