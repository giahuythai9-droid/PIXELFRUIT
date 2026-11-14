// Server online cho Pixel Fruit Blade (relay vị trí + chat + chiêu thức)
// Đặt cùng thư mục với index.html (file game). Chạy:  npm install && npm start
// Mở link của server là vào game + tự động online.
const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const GAME=path.join(__dirname,'index.html');
const server=http.createServer((q,r)=>{if(q.url==='/health'){r.writeHead(200);r.end('OK');return}fs.readFile(GAME,(e,d)=>{if(e){r.writeHead(500);r.end('Thiếu file index.html');return}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});r.end(d)})});
const wss=new WebSocketServer({server}),MAX=60;let nid=1;
const num=v=>Number.isFinite(+v)?Math.max(0,Math.min(20000,+v|0)):0;
const sn=(v,lo,hi)=>{v=Number.isFinite(+v)?+v|0:0;return v<lo?lo:v>hi?hi:v};
// Dáng vẻ + trạng thái nhân vật (để người khác thấy đúng nhân vật thật)
const app=m=>({md:sn(m.md,0,2),si:sn(m.si,0,255),fi:sn(m.fi,0,255),mi:sn(m.mi,0,255),eq:sn(m.eq,-1,255),hk:m.hk?1:0,fa:sn(m.fa,0,9),s2:m.s2?1:0,lf:m.lf?1:0,dlf:m.dlf?1:0,vf:m.vf?1:0,bt:m.bt?1:0,iw:m.iw?1:0,fh:sn(m.fh,0,300),jz:sn(m.jz,0,300),lift:sn(m.lift,0,300)});
wss.on('connection',ws=>{
  if(wss.clients.size>MAX){ws.close();return}
  ws.id=nid++;ws.send(JSON.stringify({t:'v',v:3}));ws.n='Hải tặc';ws.last=0;ws.lastC=0;
  const out=(o,skip)=>{const m=JSON.stringify(o);wss.clients.forEach(c=>{if(c!==skip&&c.readyState===1)c.send(m)})};
  ws.on('message',d=>{let m;try{m=JSON.parse(d)}catch(e){return}
    if(!m||typeof m!=='object')return;
    if(m.t==='hi'){ws.n=String(m.n||'Hải tặc').slice(0,14)}
    else if(m.t==='p'){const now=Date.now();if(now-ws.last<50)return;ws.last=now;
      out(Object.assign({t:'p',id:ws.id,n:ws.n,x:num(m.x),y:num(m.y),f:m.f<0?-1:1,lv:num(m.lv),hp:Math.min(100,num(m.hp)),sky:m.sky?1:0,lab:m.lab?1:0},app(m)),ws)}
    else if(m.t==='e'&&Array.isArray(m.a)){const now=Date.now();if(now-(ws.lastE||0)<50)return;ws.lastE=now;
      out({t:'e',id:ws.id,px:num(m.px),py:num(m.py),a:m.a.slice(0,14).map(r=>[String(r[0]).slice(0,40),num(r[1]),num(r[2]),Math.max(0,+r[3]||0),Math.max(0,+r[4]||0)])},ws)}
    else if(m.t==='k'){out({t:'k',id:ws.id,k:String(m.k||'').slice(0,40)},ws)}
    else if(m.t==='a'){const now=Date.now();if(now-(ws.lastA||0)<60)return;ws.lastA=now;
      out(Object.assign({t:'a',id:ws.id,i:sn(m.i,0,20),ang:Math.max(-7,Math.min(7,+m.ang||0)),x:num(m.x),y:num(m.y),f:m.f<0?-1:1,rel:m.rel?1:0,pw:Math.max(0,Math.min(3,+m.pw||0))},app(m)),ws)}
    else if(m.t==='c'){const now=Date.now();if(now-ws.lastC<500)return;ws.lastC=now;const s=String(m.s||'').trim().slice(0,80);if(!s)return;out({t:'c',id:ws.id,n:ws.n,s},ws)}});
  ws.on('close',()=>out({t:'bye',id:ws.id}));
});
server.listen(process.env.PORT||8080,()=>console.log('Server chạy cổng',process.env.PORT||8080));
