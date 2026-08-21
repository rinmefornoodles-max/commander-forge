const CACHE='commander-forge-6.15.0';
const CACHE_PREFIX='commander-forge-';
const CORE_ASSETS=[
  './',
  './index.html',
  './commander-forge-6.13.0.css?v=6.13.0',
  './commander-forge-6.15.0.js?v=6.15.0',
  './commander-forge-engine-client-v6.js',
  './commander-forge-oracle-compiler-v7.js?v=7.2.0-static-restrictions',
  './commander-forge-oracle-compiler-v8.js?v=8.0.0-ability-inventory',
  './manifest.webmanifest',
  './feedback-config.js',
  './commander-forge-stability-6.15.0.js?v=6.15.0',
  './commander-forge-diagnostics-6.15.0.js?v=6.15.0',
  './forge-mark.svg',
  './card-back.svg',
  './token.svg',
  './VERSION.txt'
];

self.addEventListener('install',(event)=>{
  event.waitUntil(
    caches.open(CACHE)
      .then((cache)=>cache.addAll(CORE_ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',(event)=>{
  event.waitUntil(
    caches.keys()
      .then((keys)=>Promise.all(keys
        .filter((key)=>key.startsWith(CACHE_PREFIX)&&key!==CACHE)
        .map((key)=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',(event)=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('fetch',(event)=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request)
        .then((response)=>{
          if(response?.ok)caches.open(CACHE).then((cache)=>cache.put('./index.html',response.clone())).catch(()=>{});
          return response;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  if(url.pathname.endsWith('/VERSION.txt')){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then((response)=>{
          if(response?.ok)caches.open(CACHE).then((cache)=>cache.put('./VERSION.txt',response.clone())).catch(()=>{});
          return response;
        })
        .catch(()=>caches.match('./VERSION.txt'))
    );
    return;
  }

  const core=new Set(CORE_ASSETS.map((asset)=>new URL(asset,self.registration.scope).pathname));
  if(!core.has(url.pathname))return;

  event.respondWith(
    caches.match(request,{ignoreSearch:true})
      .then((cached)=>cached||fetch(request).then((response)=>{
        if(response?.ok)caches.open(CACHE).then((cache)=>cache.put(request,response.clone())).catch(()=>{});
        return response;
      }))
  );
});
