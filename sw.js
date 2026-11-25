const C='kuro-v17',SHELL=['./','index.html','manifest.json','favicon-32.png','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)));self.skipWaiting()});
// delete old app-shell caches only; 'kuro-data' (episode alert schedule) must survive updates
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('kuro-v')&&x!==C).map(x=>caches.delete(x))))));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)));
});

// Tapping an episode alert: focus Kuro and open the show, or open Kuro at #open=<id>
self.addEventListener('notificationclick',e=>{
  e.notification.close();const id=e.notification.data?.id;
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
    await self.registration.showNotification('New episode: '+it.t,{body:`Episode ${it.ep} is out. Tap to open it in Kuro.`,icon:'icon-192.png',badge:'favicon-32.png',tag:'kuro-ep-'+it.id,data:{id:it.id}});
  }
  try{
    const res=await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:NEXT_Q,variables:{ids:d.items.map(x=>x.id)}})});
    if(res.ok){const m=new Map((await res.json()).data.Page.media.map(x=>[x.id,x.nextAiringEpisode]));
      d.items=d.items.map(it=>{const nx=m.get(it.id);return nx?{...it,ep:nx.episode,at:nx.airingAt}:it}).filter(it=>m.has(it.id)?m.get(it.id):it.at>now-86400*14);}
  }catch{}
  d.notified=n;await c.put(ALERT_URL,new Response(JSON.stringify(d),{headers:{'Content-Type':'application/json'}}));
}
