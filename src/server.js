import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const dataFile = path.resolve(root, process.env.DATA_FILE || 'data/store.json');
const port = Number(process.env.PORT || 3000);
const config = {
  name: process.env.RESTAURANT_NAME || 'My Restaurant', tagline: process.env.RESTAURANT_TAGLINE || 'อาหารดี ดนตรีสนุก',
  links: { line: process.env.RESTAURANT_LINE_URL || '', facebook: process.env.RESTAURANT_FACEBOOK_URL || '', instagram: process.env.RESTAURANT_INSTAGRAM_URL || '', map: process.env.RESTAURANT_MAP_URL || '' }
};
const id = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const seeded = () => ({
  tables: [{ id:'t1', name:'A1', seats:2, x:12, y:25, status:'available' }, { id:'t2', name:'A2', seats:4, x:39, y:25, status:'available' }, { id:'t3', name:'B1', seats:6, x:68, y:25, status:'available' }, { id:'t4', name:'VIP', seats:8, x:36, y:62, status:'available' }],
  menu: [{ id:'m1', name:'ผัดกะเพรา', price:89, available:true }, { id:'m2', name:'ปีกไก่ทอด', price:129, available:true }, { id:'m3', name:'น้ำอัดลม', price:35, available:true }],
  events: [{ id:'e1', date:'2026-08-15', name:'Live Music Night', deposit:300 }],
  reservations: [], orders: [], queue: [], posts: [], slides: [{id:'s1', title:'ยินดีต้อนรับ', image:'', active:true}], nextQueue: 1
});
let db = seeded();
if (existsSync(dataFile)) try { db = { ...db, ...JSON.parse(await readFile(dataFile, 'utf8')) }; } catch { console.warn('Using seed data: data file is invalid'); }
async function save() { await mkdir(path.dirname(dataFile), { recursive:true }); await writeFile(dataFile, JSON.stringify(db, null, 2)); }
function json(res, status, body) { res.writeHead(status, {'content-type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); }
async function body(req) { let s=''; for await (const c of req) { s+=c; if(s.length>1_000_000) throw Error('payload too large'); } return s ? JSON.parse(s) : {}; }
function admin(req) { return process.env.ADMIN_TOKEN && req.headers['x-admin-token'] === process.env.ADMIN_TOKEN; }
const broadcast = () => clients.forEach(r => r.write('data: refresh\n\n'));
const clients = new Set();
function mutation(res, status, value) { save().catch(console.error); broadcast(); json(res,status,value); }
function publicState() { return { config, tables:db.tables, menu:db.menu.filter(m=>m.available), events:db.events, queue:db.queue.filter(q=>q.status==='waiting'), slides:db.slides.filter(s=>s.active), posts:db.posts.filter(p=>p.status==='approved') }; }

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host}`); const p = url.pathname;
  try {
    if (p === '/api/health') return json(res,200,{ok:true});
    if (p === '/api/events') { res.writeHead(200, {'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'}); res.write('data: connected\n\n'); clients.add(res); req.on('close',()=>clients.delete(res)); return; }
    if (p === '/api/public' && req.method==='GET') return json(res,200,publicState());
    if (p === '/api/admin' && req.method==='GET') { if(!admin(req)) return json(res,401,{error:'Unauthorized'}); return json(res,200,{...db,config}); }
    if (p === '/api/reservations' && req.method==='POST') { const b=await body(req); const table=db.tables.find(t=>t.id===b.tableId); if(!table || table.status!=='available') return json(res,409,{error:'Table unavailable'}); if(!b.ageConfirmed || !b.name || !b.date) return json(res,400,{error:'Name, date and age confirmation required'}); table.status='reserved'; const r={id:id('res'),code:crypto.randomBytes(3).toString('hex').toUpperCase(),...b,status:'pending_payment',createdAt:new Date().toISOString()}; db.reservations.push(r); return mutation(res,201,{reservation:r,payment:{provider:'demo',amount:b.deposit||0,message:'Configure PromptPay/Stripe server-side before accepting real payments'}}); }
    if (p === '/api/queue' && req.method==='POST') { const b=await body(req); if(!b.name) return json(res,400,{error:'Name required'}); const q={id:id('q'),number:db.nextQueue++,name:b.name,guests:Number(b.guests)||1,status:'waiting'}; db.queue.push(q); return mutation(res,201,q); }
    if (p === '/api/orders' && req.method==='POST') { const b=await body(req); if(!b.tableId || !Array.isArray(b.items)||!b.items.length) return json(res,400,{error:'Table and items required'}); const total=b.items.reduce((n,i)=>n+(db.menu.find(m=>m.id===i.menuId)?.price||0)*Number(i.qty||1),0); const o={id:id('ord'),tableId:b.tableId,items:b.items,status:'pending',total,createdAt:new Date().toISOString()}; db.orders.push(o); return mutation(res,201,o); }
    if (p === '/api/posts' && req.method==='POST') { const b=await body(req); if(!b.text && !b.imageUrl) return json(res,400,{error:'Message or image required'}); const post={id:id('post'),text:String(b.text||'').slice(0,280),imageUrl:String(b.imageUrl||''),tableId:b.tableId||'',status:'pending',createdAt:new Date().toISOString()}; db.posts.push(post); return mutation(res,201,post); }
    if (p === '/api/split-bill' && req.method==='POST') { const b=await body(req); const order=db.orders.find(o=>o.id===b.orderId); const people=Math.max(1,Number(b.people)); if(!order) return json(res,404,{error:'Order not found'}); return json(res,200,{amountEach:Math.ceil(order.total/people),people,paymentLinks:Array.from({length:people},(_,i)=>({person:i+1,token:id('pay')})),note:'Demo links only. Use a payment provider webhook to mark payments settled.'}); }
    if (p.startsWith('/api/admin/') && req.method==='PATCH') { if(!admin(req)) return json(res,401,{error:'Unauthorized'}); const [, , , collection, itemId] = p.split('/'); const b=await body(req); const list=db[collection]; const item=Array.isArray(list)&&list.find(x=>x.id===itemId); if(!item) return json(res,404,{error:'Not found'}); Object.assign(item,b); return mutation(res,200,item); }
    if (p === '/api/admin/menu' && req.method==='POST') { if(!admin(req)) return json(res,401,{error:'Unauthorized'}); const b=await body(req); const m={id:id('m'),name:b.name,price:Number(b.price),available:true}; db.menu.push(m); return mutation(res,201,m); }
    if (p === '/api/admin/queue/next' && req.method==='POST') { if(!admin(req)) return json(res,401,{error:'Unauthorized'}); const q=db.queue.find(x=>x.status==='waiting'); if(!q) return json(res,404,{error:'No waiting queue'}); q.status='called'; return mutation(res,200,q); }
    return staticFile(p,res);
  } catch (e) { json(res,400,{error:e.message||'Bad request'}); }
});
async function staticFile(p,res) { const aliases={'/':'/customer.html','/admin':'/admin.html','/kds':'/kds.html','/tv':'/tv.html'}; const requested=aliases[p]||p; const file=path.normalize(path.join(publicDir,requested)); if(!file.startsWith(publicDir)) return json(res,403,{error:'Forbidden'}); try { const content=await readFile(file); const ext=path.extname(file); res.writeHead(200,{'content-type':ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'application/octet-stream'}); res.end(content); } catch { json(res,404,{error:'Not found'}); } }
server.listen(port,()=>console.log(`my-restaurant-queue on http://localhost:${port}`));
