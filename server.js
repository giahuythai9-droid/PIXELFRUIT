// Server online cho Pixel Fruit Blade v4: relay + vùng chơi chung (đảo / dungeon) + rương chung
// Đặt cùng thư mục với index.html. Chạy:  npm install && npm start
const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const GAME=path.join(__dirname,'index.html');
const server=http.createServer((q,r)=>{if(q.url==='/health'){r.writeHead(200);r.end('OK');return}fs.readFile(GAME,(e,d)=>{if(e){r.writeHead(500);r.end('Thiếu file index.html');return}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});r.end(d)})});
const wss=new WebSocketServer({server}),MAX=60;let nid=1;
// ===== LUẬT DO SERVER QUYẾT ĐỊNH (chỉnh ở đây) =====
const RULE={
 GCD:260,            // ms tối thiểu giữa 2 chiêu (client dùng .3s, chừa độ trễ mạng)
 SLOT_CD:120,        // ms tối thiểu cho cùng 1 ô chiêu (basic = ô 9 thì nhanh hơn)
 BASIC_CD:90,        // ms tối thiểu đòn đánh thường
 SKILL_BURST:6,      // tối đa số chiêu / 1 giây (chống spam macro)
 MAXSPD:520,         // px/giây tối đa (dash, thuấn bộ, bay đều nằm trong ngưỡng này)
 TELE:900,           // lệch quá số px này trong 1 gói = coi là dịch chuyển hợp lệ (đổi đảo/dungeon)
 DPS_BASE:600,DPS_LV:40, // ngân sách sát thương/giây = BASE + LV*mức, cho phép dồn 4 giây
 STALE:15000         // ms không gửi gì => ngắt kết nối
};
const now=()=>Date.now();
const num=v=>Number.isFinite(+v)?Math.max(0,Math.min(20000,+v|0)):0;
const sn=(v,lo,hi)=>{v=Number.isFinite(+v)?+v|0:0;return v<lo?lo:v>hi?hi:v};
const zn=z=>/^[a-z0-9]{1,8}$/.test(z)?z:'w';
const app=m=>({md:sn(m.md,0,2),si:sn(m.si,0,255),fi:sn(m.fi,0,255),mi:sn(m.mi,0,255),eq:sn(m.eq,-1,255),hk:m.hk?1:0,fa:sn(m.fa,0,9),s2:m.s2?1:0,lf:m.lf?1:0,dlf:m.dlf?1:0,vf:m.vf?1:0,bt:m.bt?1:0,iw:m.iw?1:0,fh:sn(m.fh,0,300),jz:sn(m.jz,0,300),lift:sn(m.lift,0,300)});
// Rương chung: server giữ trạng thái để người vào sau vẫn thấy
let CH=null,LVT=0; // {tier,born,open}
const chAge=()=>CH?(Date.now()-CH.born)/1000:0;
setInterval(()=>{if(CH&&Date.now()-CH.born>600000)CH=null},30000);
// ===== QUÁI THƯỜNG TẤT CẢ ĐẢO do server điều khiển (AI, máu, đánh người, hồi sinh) =====
function mst(ty,big,lv){const hb=40+3*lv,db=6+.3*lv;let hm=1,dm=1;if(ty===0&&big){hm=6;dm=1.8}else if(ty===2){hm=4;dm=1.3}else if(ty===5){hm=8;dm=1.2}else if(ty===6){hm=1.3;dm=1.1}else if(ty===7){hm=10;dm=1.3}else if(ty===9){hm=1.4;dm=1.15}else if(ty===10){hm=11;dm=1.35}else if(ty===11){hm=1.6;dm=1.25}else if(ty===12){hm=2.2;dm=1.1}else if(ty===13){hm=14;dm=.95}else if(ty===14){hm=2.6;dm=1.15}else if(ty===17){hm=2.8;dm=1.2}else if(ty===19){hm=2.8;dm=1.2}else if(ty===20){hm=3;dm=1.25}else if(ty===21){hm=3.2;dm=1.3}else if(ty===24){hm=3.6;dm=1.3}else if(ty===27){hm=3.8;dm=1.35}return[Math.round(hb*hm),Math.round(db*dm)]}
const SPECIAL=new Set([3,8,15,16,18,22,23,25,26,28]);
let MB=[];
function setTab(a){if(MB.length||!Array.isArray(a)||a.length>500)return;
 MB=a.map((r,i)=>{const x=num(r[0]),y=num(r[1]),ty=sn(r[2],0,60),big=r[3]?1:0,lv=Math.max(1,sn(r[4],0,5000));if(SPECIAL.has(ty))return null;
  const [hp,dm]=mst(ty,big,lv);return{i,hx:x,hy:y,x,y,ty,big,lv,hp,mx:hp,dm,z:r[5]?'sky':'w',cd:0,al:0,ret:0,wu:0,ld:0,lt:3,dead:0,rs:0,rt:ty===2?90:ty===1?15:big?65:15,by:new Set()}}).filter(Boolean)}
let tk=0;
setInterval(()=>{if(!MB.length)return;const dt=.05,ps=[];wss.clients.forEach(c=>{if(c.readyState===1&&(c.z==='w'||c.z==='sky')&&c.px!=null)ps.push(c)});
 for(const m of MB){
  if(m.dead){m.rs-=dt;if(m.rs<=0){m.dead=0;m.hp=m.mx;m.x=m.hx;m.y=m.hy;m.by.clear();m.al=0;m.ret=0;m.wu=0;m.ld=0}continue}
  let T=null,td=1e9;for(const c of ps){if(c.z!==m.z)continue;const d=Math.hypot(c.px-m.x,c.py-m.y);if(d<td){td=d;T=c}}
  if(td>900){m.x=m.hx;m.y=m.hy;m.hp=m.mx;m.al=0;m.ret=0;continue}
  m.al-=dt;m.cd-=dt;
  const hd=Math.hypot(m.x-m.hx,m.y-m.hy);if(hd>=(m.big?230:170)){m.ret=1;m.al=0}else if(hd<6)m.ret=0;
  const ag=!m.ret&&(td<(m.big?150:120)||m.al>0);
  if(!ag){m.wu=0;m.ld=0;if(m.ret)m.hp=Math.min(m.mx,m.hp+m.mx*.15*dt);if(hd>5){const sp=m.ret?90:30;m.x+=(m.hx-m.x)/hd*sp*dt;m.y+=(m.hy-m.y)/hd*sp*dt}continue}
  const dx=T.px-m.x,dy=T.py-m.y,d=td||1;
  if(m.big){m.lt-=dt;if(m.wu>0){m.wu-=dt;if(m.wu<=0){m.ld=.35;m.lx=dx/d;m.ly=dy/d}}else if(m.ld>0){m.ld-=dt;m.x+=m.lx*230*dt;m.y+=m.ly*230*dt}else{m.x+=dx/d*26*dt;m.y+=dy/d*26*dt;if(m.lt<=0&&d<200){m.lt=4+Math.random()*2;m.wu=.6}}}
  else{m.x+=dx/d*30*dt;m.y+=dy/d*30*dt}
  if(d<(m.big?22:14)&&m.cd<=0){m.cd=m.big?1:.8;T.send(JSON.stringify({t:'mh',i:m.i,d:m.big&&m.ld>0?m.dm*1.5:m.dm}))}}
 if(ps.length&&(++tk%2===0))for(const c of ps){const a=[];for(const m of MB)if(!m.dead&&m.z===c.z&&Math.abs(m.x-c.px)<700&&Math.abs(m.y-c.py)<700)a.push([m.i,m.x|0,m.y|0,Math.ceil(m.hp),m.mx]);c.send(JSON.stringify({t:'ms',a}))}
},50);
// ===== Trạng thái người chơi do SERVER giữ =====
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
function ply(){const a=[];wss.clients.forEach(c=>{if(c.readyState===1&&c.st)a.push(c)});return a}
function pub(c){const s=c.st;return Object.assign({t:'p',id:c.id,n:c.n,z:c.z,x:s.x,y:s.y,f:s.f,lv:s.lv,hp:s.hp,sky:s.sky,lab:s.lab,ts:now()},s.app)}
function bcast(o,skip,zone){const m=JSON.stringify(o);wss.clients.forEach(c=>{if(c!==skip&&c.readyState===1&&(!zone||c.z===zone))c.send(m)})}
// Server kiểm soát chiêu: trả về true nếu cho phép phát chiêu này
function canCast(ws,i,t){const s=ws.st;
 if(s.hp<=0)return false;                                  // người đã chết không dùng chiêu
 const basic=i===9;
 if(basic){if(t-s.lastBasic<RULE.BASIC_CD)return false;s.lastBasic=t;return true}
 if(t-s.lastSkill<RULE.GCD)return false;                    // cooldown chung
 if(t-(s.slot[i]||0)<RULE.SLOT_CD)return false;             // cooldown từng ô
 s.win=s.win.filter(x=>t-x<1000);if(s.win.length>=RULE.SKILL_BURST)return false; // chống spam
 s.win.push(t);s.lastSkill=t;s.slot[i]=t;return true}
// Kiểm tra tốc độ di chuyển: nếu quá nhanh thì kéo về vị trí hợp lệ gần nhất
function moveOK(ws,nx,ny,t){const s=ws.st;if(!s.has){s.has=1;return{x:nx,y:ny}}
 const dt=Math.max(.05,(t-s.lastP)/1000),d=Math.hypot(nx-s.x,ny-s.y);
 if(d>RULE.TELE)return{x:nx,y:ny,tp:1};                      // dịch chuyển giữa vùng
 const mx=RULE.MAXSPD*dt+24;
 if(d>mx){const k=mx/d;return{x:Math.round(s.x+(nx-s.x)*k),y:Math.round(s.y+(ny-s.y)*k),fix:1}}
 return{x:nx,y:ny}}
// Ngân sách sát thương (token bucket) theo cấp: chặn one-shot / hack damage
function dmgBudget(ws,t){const s=ws.st,rate=RULE.DPS_BASE+RULE.DPS_LV*s.lv,cap=rate*4;
 s.dtok=Math.min(cap,s.dtok+rate*(t-s.dlast)/1000);s.dlast=t;return s.dtok}

// ===== Vòng đồng bộ chung: dọn kết nối chết + gửi ping để đo độ trễ =====
setInterval(()=>{const t=now();wss.clients.forEach(c=>{if(c.readyState!==1)return;
 if(c.st&&t-c.st.seen>RULE.STALE){c.terminate();return}
 try{c.send(JSON.stringify({t:'ping',ts:t}))}catch(e){}})},5000);

wss.on('connection',ws=>{
  if(wss.clients.size>MAX){ws.close();return}
  ws.id=nid++;ws.z='w';ws.n='Hải tặc';ws.last=0;ws.lastC=0;
  ws.st={x:0,y:0,f:1,lv:1,hp:100,sky:0,lab:0,app:app({}),has:0,lastP:now(),seen:now(),lastSkill:0,lastBasic:0,slot:{},win:[],dtok:RULE.DPS_BASE*4,dlast:now(),rtt:0};
  ws.send(JSON.stringify({t:'v',v:5,id:ws.id,ts:now()}));
  // Gửi ngay ảnh chụp tất cả người đang online để người mới thấy đủ, không phải đợi gói 'p'
  ply().forEach(c=>{if(c!==ws&&c.st.has)ws.send(JSON.stringify(pub(c)))});
  if(CH&&!CH.open)ws.send(JSON.stringify({t:'cs',tier:CH.tier,age:chAge()}));
  const out=(o,skip,zone)=>bcast(o,skip,zone);
  ws.on('pong',()=>{ws.st.seen=now()});
  ws.on('message',d=>{let m;try{m=JSON.parse(d)}catch(e){return}
    if(!m||typeof m!=='object')return;const t=now();ws.st.seen=t;
    if(m.t==='pong'){ws.st.rtt=clamp(t-(+m.ts||t),0,5000);return}
    if(m.t==='hi'){ws.n=String(m.n||'Hải tặc').slice(0,14)}
    else if(m.t==='p'){if(t-ws.last<50)return;ws.last=t;const s=ws.st;
      const oz=ws.z;ws.z=zn(String(m.z||'w'));
      const r=moveOK(ws,num(m.x),num(m.y),t);if(ws.z!==oz)r.tp=1;
      s.x=r.x;s.y=r.y;s.lastP=t;s.f=m.f<0?-1:1;s.lv=Math.max(1,num(m.lv));s.hp=Math.min(100,num(m.hp));s.sky=m.sky?1:0;s.lab=m.lab?1:0;s.app=app(m);
      ws.px=s.x;ws.py=s.y;ws.sky=s.sky;
      out(pub(ws),ws);
      if(r.fix)ws.send(JSON.stringify({t:'fix',x:r.x,y:r.y,ts:t}))}   // báo client về vị trí server chấp nhận
    else if(m.t==='e'&&Array.isArray(m.a)){if(t-(ws.lastE||0)<50)return;ws.lastE=t;
      out({t:'e',id:ws.id,px:ws.px|0,py:ws.py|0,a:m.a.slice(0,14).map(r=>[String(r[0]).slice(0,48),num(r[1]),num(r[2]),Math.max(0,+r[3]||0),Math.max(0,+r[4]||0)])},ws,ws.z)}
    else if(m.t==='k'){out({t:'k',id:ws.id,k:String(m.k||'').slice(0,48)},ws,ws.z)}
    else if(m.t==='a'){if(t-(ws.lastA||0)<30)return;ws.lastA=t;
      const i=sn(m.i,0,20);
      if(!m.rel&&!canCast(ws,i,t)){ws.send(JSON.stringify({t:'deny',i,ts:t}));return} // server từ chối chiêu vi phạm cooldown
      if(m.rel&&!ws.st.slot[i]&&t-ws.st.lastSkill>RULE.GCD*8)return;                  // nhả chiêu phải có lần bấm trước
      if(m.rel){ws.st.lastSkill=t;ws.st.slot[i]=t}
      // vị trí phát chiêu = vị trí server đang giữ (không tin x,y client gửi kèm)
      out(Object.assign({t:'a',id:ws.id,i,ang:clamp(+m.ang||0,-7,7),x:ws.st.x,y:ws.st.y,f:m.f<0?-1:1,rel:m.rel?1:0,pw:clamp(+m.pw||0,0,3),ts:t},app(m)),ws,ws.z)}
    else if(m.t==='mtab'){setTab(m.a);ws.send(JSON.stringify({t:'mn',n:MB.length}))}
    else if(m.t==='dmg'){const mb=MB[m.i|0];if(!mb||mb.dead||ws.z!==mb.z)return;
      if(Math.hypot((ws.px||0)-mb.x,(ws.py||0)-mb.y)>700)return;
      const bud=dmgBudget(ws,t);let d=Math.min(Math.max(0,+m.d||0),mb.mx,bud);if(!d)return;
      ws.st.dtok-=d;mb.hp-=d;mb.al=6;mb.by.add(ws.id);
      if(mb.hp<=0){mb.hp=0;mb.dead=1;mb.rs=mb.rt;out({t:'md',i:mb.i,by:[...mb.by]},null,mb.z);mb.by.clear()}}
    else if(m.t==='lv'){if(t-(LVT||0)<10000)return;LVT=t;out({t:'lv',id:ws.id},ws,ws.z)}
    else if(m.t==='cs'){if(CH&&!CH.open){if(chAge()<10)ws.send(JSON.stringify({t:'cs',tier:CH.tier,age:chAge()}));return}CH={tier:sn(m.tier,0,2),born:t,open:0};out({t:'cs',tier:CH.tier,age:0},ws)}
    else if(m.t==='co'){if(!CH||CH.open)return;CH.open=1;out({t:'co',id:ws.id},ws)}
    else if(m.t==='c'){if(t-ws.lastC<500)return;ws.lastC=t;const s=String(m.s||'').trim().slice(0,80);if(!s)return;out({t:'c',id:ws.id,n:ws.n,s},ws)}});
  ws.on('close',()=>out({t:'bye',id:ws.id}));
});
server.listen(process.env.PORT||8080,()=>console.log('Server chạy cổng',process.env.PORT||8080));
