const CACHE = 'powareveal-__CACHE_VERSION__';
const SHELL = __PRECACHE_FILES__;
self.addEventListener('install',event=>{
  // Installation commits only when the entire shell is cached successfully.
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).catch(async error=>{await caches.delete(CACHE);throw error;}));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('powareveal-')&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate')return await cache.match(new URL('index.html',scope).href) || fetch(event.request);
    const key=new URL(url);key.search='';key.hash='';
    const cached=await cache.match(key.href);if(cached)return cached;
    return fetch(event.request);
  })());
});
