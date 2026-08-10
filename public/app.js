export async function api(path, options={}) { const r=await fetch(path,{headers:{'content-type':'application/json',...(options.headers||{})},...options}); const data=await r.json(); if(!r.ok) throw Error(data.error||'Request failed'); return data; }
export function watch(render){ const es=new EventSource('/api/events'); es.onmessage=render; return es; }
export const money=n=>new Intl.NumberFormat('th-TH',{style:'currency',currency:'THB'}).format(n);
