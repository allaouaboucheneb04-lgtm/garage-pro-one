// Garage Pro One - simple offline cache
const CACHE = "garagepro-v1";
const CORE = [
  "./",
  "./index.html",
  "./assets/style.css",
  "./assets/app.js",
  "./assets/firebase-config.js",
  "./assets/logo-128.png",
  "./assets/logo.png",
  "./assets/favicon.ico",
  "./assets/favicon-32.png",
  "./assets/favicon-16.png",
  "./assets/apple-touch-icon.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  if(req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then(hit=> hit || fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(req, copy)).catch(()=>{});
      return res;
    }).catch(()=>hit))
  );
});
