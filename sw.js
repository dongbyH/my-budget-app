// The cache version must change whenever an update is published.
const CACHE='ggulggul-ui-v5.11.8-20261106';
const ASSETS=['./','./index.html','./style.css','./app.js','./news.js','./market.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./pig-hero.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('my-budget-')||key.startsWith('ggulggul-'))&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]))});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET'||new URL(req.url).origin!==location.origin||new URL(req.url).pathname.endsWith('/news.json'))return;event.respondWith(fetch(req).catch(()=>caches.open(CACHE).then(cache=>cache.match(req,{ignoreSearch:true}))))});
