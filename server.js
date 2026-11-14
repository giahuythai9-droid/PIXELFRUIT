// Server online cho Pixel Fruit Blade (relay vị trí + chat)
// Đặt cùng thư mục với index.html (file game). Chạy:  npm install && npm start
// Mở link của server là vào game + tự động online.
const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const GAME=path.join(__dirname,'index.html');
const server=http.createServer((q,r)=>{if(q.url==='/health'){r.writeHead(200);r.end('OK');return}fs.readFile(GAME,(e,d)=>{if(e){r.writeHead(500);r.end('Thiếu file index.html');return}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});r.end(d)})});
const wss=new WebSocketServer({server}),MAX=60;let nid=1;
const num=v=>Number.isFinite(+v)?Math.max(0,Math.min(20000,+v|0)):0;
wss.on('connection',ws=>{
  if(wss.clients.size>MAX){ws.close();return}
  ws.id=nid++;ws.n='Hải tặc';ws.last=0;ws.lastC=0;
  const out=(o,skip)=>{const m=JSON.stringify(o);wss.clients.forEach(c=>{if(c!==skip&&c.readyState===1)c.send(m)})};
  ws.on('message',d=>{let m;try{m=JSON.parse(d)}catch(e){return}
    if(m.t==='hi'){ws.n=String(m.n||'Hải tặc').slice(0,14)}
    else if(m.t==='p'){const now=Date.now();if(now-ws.last<50)return;ws.last=now;
      out({t:'p',id:ws.id,n:ws.n,x:num(m.x),y:num(m.y),f:m.f<0?-1:1,lv:num(m.lv),sky:m.sky?1:0,lab:m.lab?1:0},ws)}
    else if(m.t==='c'){const now=Date.now();if(now-ws.lastC<1000)return;ws.lastC=now;out({t:'c',n:ws.n,s:String(m.s||'').slice(0,80)},ws)}});
  ws.on('close',()=>out({t:'bye',id:ws.id}));
});
server.listen(process.env.PORT||8080,()=>console.log('Server chạy cổng',process.env.PORT||8080));
