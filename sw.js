const C='kuro-v34',SHELL=['./','index.html','manifest.json','favicon-32.png','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
const IMG='kuro-img',API='kuro-api'; // offline copies of covers and public AniList answers (not 'kuro-v…', so updates keep them)
// cache:'reload' so a new version never stores a stale copy from the browser's HTTP cache
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))));self.skipWaiting()});
// delete old app-shell caches only; 'kuro-data' (alert schedule, +1 queue), 'kuro-img' and 'kuro-api' must survive updates
// claim open pages so they learn about the new version (the page then reloads or offers Reload)
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('kuro-v')&&x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method==='GET'&&u.hostname==='s4.anilist.co')return e.respondWith(img(r));
  // public AniList queries only: requests carrying a sign-in token (sync) are never stored
  if(r.method==='POST'&&u.origin==='https://graphql.anilist.co'&&!r.headers.has('Authorization'))return e.respondWith(api(r));
  if(r.method!=='GET'||u.origin!==location.origin)return;
  // network first, revalidated with the server (GitHub Pages lets browsers keep pages for 10 minutes otherwise)
  e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r,{ignoreSearch:true})));
});
async function trim(name,max){const c=await caches.open(name),k=await c.keys();for(let i=0;i<k.length-max;i++)await c.delete(k[i])}
// covers never change at the same address: cache first. Fetched with CORS so the stored copy is a normal (not opaque) response;
// cache:'reload' because the browser's HTTP cache may hold a copy from a plain <img> load without CORS headers, which would fail.
async function img(r){
  const c=await caches.open(IMG),hit=await c.match(r.url);if(hit)return hit;
  try{const res=await fetch(r.url,{mode:'cors',credentials:'omit',cache:'reload'});if(res.ok)c.put(r.url,res.clone()).then(()=>trim(IMG,600));return res}
  catch{return fetch(r)}
}
// AniList answers: network first (always fresh online); offline, or when AniList is busy/down, the last answer to the same query
async function api(r){
  const body=await r.clone().text(),key=await hashKey(body),c=await caches.open(API);
  try{
    const res=await fetch(r);
    if(res.ok){c.put(key,res.clone()).then(()=>trim(API,250));return res}
    if(res.status===429||res.status>=500){const hit=await c.match(key);if(hit)return hit}
    return res;
  }catch(err){const hit=await c.match(key);if(hit)return hit;throw err}
}
async function hashKey(body){const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));return './__gql/'+[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}

// Tapping an episode alert: focus Kuro and open the show, or open Kuro at #open=<id>.
// The "+1" button: queue the episode for the page (the list lives in the page's storage), without opening anything.
const QUEUE_URL='./__kuro-queue';
self.addEventListener('notificationclick',e=>{
  e.notification.close();const d=e.notification.data||{},id=d.id;
  if(e.action==='plus'&&id&&d.ep){e.waitUntil((async()=>{
    const c=await caches.open('kuro-data'),r=await c.match(QUEUE_URL),q=r?await r.json():[];q.push({id,ep:d.ep,t:Date.now()});
    await c.put(QUEUE_URL,new Response(JSON.stringify(q),{headers:{'Content-Type':'application/json'}}));
    const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});cs.forEach(w=>w.postMessage({queue:1}));
    if(!cs.length)await self.registration.showNotification(`Marked watched: Ep ${d.ep}`,{body:`${d.title||'Your show'}. Kuro saves it (and syncs it) next time you open it.`,icon:'icon-192.png',badge:'favicon-32.png',tag:'kuro-ep-'+id,silent:true,data:{id}});
  })());return}
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    const c=cs[0];
    if(c){if(id)c.postMessage({open:id});return c.focus()}
    return self.clients.openWindow('./'+(id?'#open='+id:''));
  }));
});

// Background check while Kuro is closed (Periodic Background Sync: Chrome/Edge, installed app; the browser decides when).
// Reads the schedule the page saved (show id, title, episode, air time), alerts for episodes that have aired and were
// not alerted yet, then asks AniList's public API for each show's next episode. No account data is used.
const ALERT_URL='./__kuro-alerts';
const NEXT_Q='query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id nextAiringEpisode{episode airingAt}}}}';
self.addEventListener('periodicsync',e=>{if(e.tag==='kuro-episodes')e.waitUntil(checkEpisodes())});
async function checkEpisodes(){
  const c=await caches.open('kuro-data'),r=await c.match(ALERT_URL);if(!r)return;
  const d=await r.json();if(!d.on||!d.items?.length)return;
  const now=Date.now()/1000,n=d.notified||{};
  for(const it of d.items)if(it.at<=now&&(n[it.id]||0)<it.ep){
    n[it.id]=it.ep;
    await self.registration.showNotification('New episode: '+it.t,{body:`Episode ${it.ep} is out. Tap to open it in Kuro.`,icon:'icon-192.png',badge:'favicon-32.png',tag:'kuro-ep-'+it.id,data:{id:it.id,ep:it.ep,title:it.t},actions:[{action:'plus',title:`+1 Mark Ep ${it.ep} watched`}]});
  }
  try{
    const res=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:NEXT_Q,variables:{ids:d.items.map(x=>x.id)}})});
    if(res.ok){const m=new Map((await res.json()).data.Page.media.map(x=>[x.id,x.nextAiringEpisode]));
      d.items=d.items.map(it=>{const nx=m.get(it.id);return nx?{...it,ep:nx.episode,at:nx.airingAt}:it}).filter(it=>m.has(it.id)?m.get(it.id):it.at>now-86400*14);}
  }catch{}
  d.notified=n;await c.put(ALERT_URL,new Response(JSON.stringify(d),{headers:{'Content-Type':'application/json'}}));
}
