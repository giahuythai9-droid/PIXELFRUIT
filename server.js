// Server online cho Pixel Fruit Blade v4: relay + vùng chơi chung (đảo / dungeon) + rương chung
// Đặt cùng thư mục với index.html. Chạy:  npm install && npm start
const crypto=require('crypto');
// Mật khẩu admin: đặt trong biến môi trường ADMIN_KEY (KHÔNG ghi thẳng vào code). Không đặt = tắt admin online.
const AK=String(process.env.ADMIN_KEY||'');
const eqKey=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)};
// Giới hạn an toàn cho bản lưu của người chơi thường (admin không bị giới hạn). Chỉnh nếu game của bạn cho phép cao hơn.
const SAVE_MAX={LV:1300,BELI:1e12,GEM:1e12};
function cleanSave(d){let o;try{o=JSON.parse(d)}catch(e){return null}if(!o||typeof o!=='object')return null;let ch=0;
  const cap=(x,mx)=>{const n=Number(x);if(!Number.isFinite(n)||n<0){ch=1;return 0}if(n>mx){ch=1;return mx}return x};
  if('LV' in o)o.LV=cap(o.LV,SAVE_MAX.LV);if('BELI' in o)o.BELI=cap(o.BELI,SAVE_MAX.BELI);
  if(o.MAT&&typeof o.MAT==='object'&&'gem' in o.MAT)o.MAT.gem=cap(o.MAT.gem,SAVE_MAX.GEM);
  return ch?JSON.stringify(o):d}
// ===== Trái ác quỷ rơi dưới đất, đồng bộ giữa mọi người chơi =====
const GF=new Map(),GFLIFE=300000,GFMAX=300,GFPER=3;let gfid=1;
const gfPub=(f,t)=>({id:f.id,i:f.i,x:f.x,y:f.y,z:f.z,left:Math.max(0,f.exp-t)});
setInterval(()=>{const t=Date.now();for(const[id,f]of GF)if(f.exp<=t)GF.delete(id)},5000);
const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const GAME=path.join(__dirname,'index.html');
const server=http.createServer((q,r)=>{if(q.url==='/health'){r.writeHead(200);r.end('OK');return}fs.readFile(GAME,(e,d)=>{if(e){r.writeHead(500);r.end('Thiếu file index.html');return}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});r.end(d)})});
const wss=new WebSocketServer({server,maxPayload:524288}),MAX=60;let nid=1;
// ===== LƯU TIẾN ĐỘ LÊN SERVER (đổi máy nhập mã là có lại nhân vật) =====
// Đặt biến môi trường SAVE_FILE trỏ vào ổ đĩa bền (Render: Disk) thì restart server không mất save
const SAVEF=process.env.SAVE_FILE||path.join(__dirname,'saves.json');
let SAVES={};try{SAVES=JSON.parse(fs.readFileSync(SAVEF,'utf8'))||{}}catch(e){}
let svDirty=0;const flushSaves=()=>{if(!svDirty)return;svDirty=0;try{fs.writeFileSync(SAVEF,JSON.stringify(SAVES))}catch(e){}};
setInterval(flushSaves,8000);
['SIGTERM','SIGINT'].forEach(sg=>process.on(sg,()=>{flushSaves();process.exit(0)}));
const okKey=k=>typeof k==='string'&&/^[A-Za-z0-9]{12,32}$/.test(k);
// ===== LUẬT DO SERVER QUYẾT ĐỊNH (chỉnh ở đây) =====
const RULE={
 GCD:260,            // ms tối thiểu giữa 2 chiêu (client dùng .3s, chừa độ trễ mạng)
 SLOT_CD:120,        // ms tối thiểu cho cùng 1 ô chiêu (basic = ô 9 thì nhanh hơn)
 BASIC_CD:90,        // ms tối thiểu đòn đánh thường
 SKILL_BURST:6,      // tối đa số chiêu / 1 giây (chống spam macro)
 MAXSPD:520,         // px/giây tối đa (dash, thuấn bộ, bay đều nằm trong ngưỡng này)
 TELE:900,           // lệch quá số px này trong 1 gói = coi là dịch chuyển hợp lệ (đổi đảo/dungeon)
 DPS_BASE:3000,DPS_LV:300,DPS_WIN:10, // ngân sách sát thương/giây = BASE + LV*mức, cho phép dồn DPS_WIN giây (đã nâng để Gojo đánh diện rộng không bị cắt dame)
 STALE:15000         // ms không gửi gì => ngắt kết nối
};
const now=()=>Date.now();
const num=v=>Number.isFinite(+v)?Math.max(0,Math.min(20000,+v|0)):0;
const sn=(v,lo,hi)=>{v=Number.isFinite(+v)?+v|0:0;return v<lo?lo:v>hi?hi:v};
const zn=z=>/^[a-z0-9]{1,12}$/.test(z)?z:'w';
const app=m=>({ff:m.ff?1:0,mg:m.mg?1:0,md:sn(m.md,0,2),si:sn(m.si,0,255),fi:sn(m.fi,0,255),mi:sn(m.mi,0,255),eq:sn(m.eq,-1,255),hk:m.hk?1:0,fa:sn(m.fa,0,9),s2:m.s2?1:0,lf:m.lf?1:0,dlf:m.dlf?1:0,vf:m.vf?1:0,bt:m.bt?1:0,iw:m.iw?1:0,fh:sn(m.fh,0,300),jz:sn(m.jz,0,300),lift:sn(m.lift,0,300)});
// Rương chung: server giữ trạng thái để người vào sau vẫn thấy
let CH=null,LVT=0,LVDIED=0; // CH={tier,born,opened:Set(mã nhân vật đã mở)}: rương Leviathan cho TẤT CẢ người chơi, mỗi người mở 1 lần
const chAge=()=>CH?(Date.now()-CH.born)/1000:0;
setInterval(()=>{if(CH&&Date.now()-CH.born>900000){CH=null;bcast({t:'cx'})}},30000);
// ===== BOSS TRIỆU HỒI DÙNG CHUNG (Leviathan, Shank, Crocodile): server giữ máu / cái chết, AI chạy ở client =====
// Leviathan máu trâu mặc định 2.000.000 (kể cả 1 người)
const DYN={8:{id:9999,mx:2000000,x:2780,y:1010,th:.01},3:{id:9990,mx:3000,x:2790,y:185,th:.05},16:{id:9991,mx:mst(16,1,600)[0],x:1545,y:935,th:.03},29:{id:9992,mx:2000000,x:6450,y:534,th:.01},34:{id:9993,mx:1e15,x:9850,y:830,th:1},35:{id:9994,mx:5000000,x:9850,y:1400,th:.01}};   // 35 = NOBARA (Đảo Boss · Đấu Trường): 5 triệu máu, đánh chung, ≥1% sát thương mới có thưởng
const DID={};for(const k in DYN)DID[DYN[k].id]=+k;
const DB={}; // ty -> {hp,mx,dd,born}
function dynStart(ty){if(DB[ty]||!DYN[ty])return false;DB[ty]={hp:DYN[ty].mx,mx:DYN[ty].mx,dd:new Map(),born:Date.now()};return true}
setInterval(()=>{const t=Date.now();for(const ty in DB)if(t-DB[ty].born>(ty==8?3600000:1800000)){delete DB[ty];bcast({t:'md',i:DYN[ty].id,by:[]})}},30000);
// ===== SỰ KIỆN RÂU TRẮNG (Tổng Bộ Hải Quân) do SERVER tính giờ: xuất hiện, hạ xong (hoặc hết giờ) thì 3p30 HOẶC 5p sau mới xuất hiện lại =====
const WBCFG={DUR:900000,GAPS:[210000,300000],MELT_WIN:25000,MELT_LOSE:8000}; // ms (chỉnh ở đây)
const wbGap=()=>WBCFG.GAPS[Math.random()<.5?0:1];
const WB={on:0,end:0,next:Date.now()+wbGap(),melt:0};
const wbMsg=()=>({t:'wb',on:WB.on,left:WB.on?Math.max(0,WB.end-Date.now()):0,melt:!WB.on&&WB.melt>Date.now()?WB.melt-Date.now():0});
function wbStop(win){if(!WB.on)return;WB.on=0;WB.melt=Date.now()+(win?WBCFG.MELT_WIN:WBCFG.MELT_LOSE);WB.next=Date.now()+wbGap();bcast(wbMsg())}
setInterval(()=>{const t=Date.now();
 if(!WB.on){if(t>=WB.next){if(!wss.clients.size)WB.next=t+wbGap();else if(dynStart(29)){WB.on=1;WB.end=t+WBCFG.DUR;WB.melt=0;bcast(wbMsg())}}}
 else if(t>=WB.end||!DB[29]){if(DB[29]){delete DB[29];bcast({t:'md',i:DYN[29].id,by:[]})}wbStop(false)}},1000);
// ===== BOSS ICHIGO (Đảo Ichigo): mỗi 10 phút xuất hiện, ở lại 5 phút, máu bất tử (200k dame = 1%) =====
const IGC={CYC:600000,DUR:300000},IG={on:0,end:0,blk:-1,next:Date.now()+600000}; // next: lần xuất hiện kế tiếp = 10 phút SAU KHI boss biến mất (lần đầu: 10 phút sau khi bật server)
function igEnd(){if(!IG.on)return;const b=DB[34];if(!IG.adm)IG.next=Date.now()+IGC.CYC;IG.on=0;IG.adm=0;wss.clients.forEach(c=>{if(c.readyState===1)snd(c,{t:'ig',on:0,d:b?(b.dd.get(c.id)||0):0})});delete DB[34]}
setInterval(()=>{const t=Date.now();
 // Chỉ tính giờ khi CÓ người chơi trong game: server trống thì đồng hồ 10 phút bị reset lại từ đầu
 if(!wss.clients.size){if(IG.on)igEnd();IG.next=t+IGC.CYC;return}
 if(IG.on){if(t>=IG.end||!DB[34])igEnd();return}
 if(t>=IG.next&&dynStart(34)){IG.on=1;IG.adm=0;IG.end=t+IGC.DUR;bcast({t:'ig',on:1,left:IGC.DUR})}},1000);
// Lệnh admin /*Summon Ichigo: triệu hồi Ichigo ngay (ở lại 5 phút, không ảnh hưởng chu kỳ 10 phút)
function igSummon(t){if(IG.on||!dynStart(34))return false;IG.on=1;IG.adm=1;IG.blk=Math.floor(t/IGC.CYC);IG.end=t+IGC.DUR;bcast({t:'ig',on:1,left:IGC.DUR});return true}
// ===== QUÁI THƯỜNG TẤT CẢ ĐẢO do server điều khiển (AI, máu, đánh người, hồi sinh) =====
function mst(ty,big,lv){const hb=40+3*lv,db=6+.3*lv;let hm=1,dm=1;if(ty===0&&big){hm=6;dm=1.8}else if(ty===2){hm=4;dm=1.3}else if(ty===5){hm=8;dm=1.2}else if(ty===6){hm=1.3;dm=1.1}else if(ty===7){hm=10;dm=1.3}else if(ty===9){hm=1.4;dm=1.15}else if(ty===10){hm=11;dm=1.35}else if(ty===11){hm=1.6;dm=1.25}else if(ty===12){hm=2.2;dm=1.1}else if(ty===13){hm=14;dm=.95}else if(ty===14){hm=2.6;dm=1.15}else if(ty===15){hm=18;dm=.8}else if(ty===16){hm=20;dm=.85}else if(ty===17){hm=2.8;dm=1.2}else if(ty===18){hm=22;dm=.85}else if(ty===19){hm=2.8;dm=1.2}else if(ty===20){hm=3;dm=1.25}else if(ty===21){hm=3.2;dm=1.3}else if(ty===22){hm=22;dm=.9}else if(ty===23){hm=26;dm=.95}else if(ty===24){hm=3.6;dm=1.3}else if(ty===25){hm=30;dm=1}else if(ty===26){hm=34;dm=1.15}else if(ty===27){hm=3.8;dm=1.35}else if(ty===28){hm=38;dm=1.2}else if(ty===30){hm=4;dm=1.35}else if(ty===31){hm=42;dm=1.25}else if(ty===33){return[1000000,Math.round(db*1.4)]}return[Math.round(hb*hm),Math.round(db*dm)]}
// SPECIAL = quái chỉ chạy ở client (Shank, Leviathan, cá sấu, Law...). CLAI = boss AI chạy ở client nhưng MÁU + CHẾT + HỒI SINH do server giữ chung
const SPECIAL=new Set([3,8,16,25,26]),CLAI=new Set([15,18,22,23,28,31]);
let MB=[];
function setTab(a){if(MB.length||!Array.isArray(a)||a.length>500)return;
 MB=a.map((r,i)=>{const x=num(r[0]),y=num(r[1]),ty=sn(r[2],0,60),big=r[3]?1:0,lv=Math.max(1,sn(r[4],0,5000));if(SPECIAL.has(ty))return null;
  const [hp,dm]=mst(ty,big,lv);return{i,hx:x,hy:y,x,y,ty,big,lv,hp,mx:hp,dm,z:r[5]?'sky':'w',cl:CLAI.has(ty)?1:0,far:0,cd:0,al:0,ret:0,wu:0,ld:0,lt:3,dead:0,rs:0,rt:CLAI.has(ty)?120:ty===2?90:ty===1?15:big?65:15,dd:new Map()}}).filter(Boolean)}
let tk=0;
setInterval(()=>{if(!MB.length&&!Object.keys(DB).length)return;const dt=.05,ps=[];wss.clients.forEach(c=>{if(c.readyState===1&&(c.z==='w'||c.z==='sky')&&c.px!=null)ps.push(c)});
 for(const ty in DB){const b=DB[ty],D=DYN[ty];if(b.x==null){b.x=D.x;b.y=D.y}
  let H=b.host&&ps.includes(b.host)&&Math.hypot(b.host.px-b.x,b.host.py-b.y)<1800?b.host:null;
  if(!H){let bd=1800;for(const c of ps){const d=Math.hypot(c.px-b.x,c.py-b.y);if(d<bd){bd=d;H=c}}}b.host=H}
 for(const m of MB){
  if(m.dead){m.rs-=dt;if(m.rs<=0){m.dead=0;m.hp=m.mx;m.x=m.hx;m.y=m.hy;m.dd.clear();m.al=0;m.ret=0;m.wu=0;m.ld=0;m.far=0;m.host=null}continue}
  let T=null,td=1e9;for(const c of ps){if(c.z!==m.z)continue;const d=Math.hypot(c.px-m.x,c.py-m.y);if(d<td){td=d;T=c}}
  if(m.cl){ // boss AI chạy ở client: server chỉ giữ máu. Không ai ở gần 10 giây thì hồi đầy
   let H=m.host&&ps.includes(m.host)&&m.host.z===m.z&&Math.hypot(m.host.px-m.x,m.host.py-m.y)<1600?m.host:null;if(!H&&T&&td<1600)H=T;m.host=H;
   if(td>1600){m.far+=dt;if(m.far>10){m.hp=m.mx;m.dd.clear();m.far=0;m.x=m.hx;m.y=m.hy;m.host=null}}else m.far=0;continue}
  if(td>900){m.x=m.hx;m.y=m.hy;m.hp=m.mx;m.al=0;m.ret=0;m.dd.clear();continue}
  m.al-=dt;m.cd-=dt;
  const hd=Math.hypot(m.x-m.hx,m.y-m.hy);if(hd>=(m.big?230:170)){m.ret=1;m.al=0}else if(hd<6)m.ret=0;
  const ag=!m.ret&&(td<(m.big?150:120)||m.al>0);
  if(!ag){m.wu=0;m.ld=0;if(m.ret)m.hp=Math.min(m.mx,m.hp+m.mx*.15*dt);if(hd>5){const sp=m.ret?90:30;m.x+=(m.hx-m.x)/hd*sp*dt;m.y+=(m.hy-m.y)/hd*sp*dt}continue}
  const dx=T.px-m.x,dy=T.py-m.y,d=td||1;
  if(m.big){m.lt-=dt;if(m.wu>0){m.wu-=dt;if(m.wu<=0){m.ld=.35;m.lx=dx/d;m.ly=dy/d}}else if(m.ld>0){m.ld-=dt;m.x+=m.lx*230*dt;m.y+=m.ly*230*dt}else{m.x+=dx/d*26*dt;m.y+=dy/d*26*dt;if(m.lt<=0&&d<200){m.lt=4+Math.random()*2;m.wu=.6}}}
  else{m.x+=dx/d*30*dt;m.y+=dy/d*30*dt}
  if(d<(m.big?22:14)&&m.cd<=0){m.cd=m.big?1:.8;T.send(JSON.stringify({t:'mh',i:m.i,d:m.big&&m.ld>0?m.dm*1.5:m.dm}))}}
 if(ps.length&&(++tk%2===0))for(const c of ps){const a=[];for(const m of MB)if(!m.dead&&m.z===c.z&&Math.abs(m.x-c.px)<(m.cl?1600:700)&&Math.abs(m.y-c.py)<(m.cl?1600:700))a.push([m.i,m.x|0,m.y|0,Math.ceil(m.hp),m.mx,m.cl&&m.host?m.host.id:0,m.cl&&m.host!==c?m.s||0:0]);const bd={};for(const ty in DB)bd[ty]=[Math.ceil(DB[ty].hp),DB[ty].mx,DB[ty].host?DB[ty].host.id:0,DB[ty].x|0,DB[ty].y|0,DB[ty].host!==c?DB[ty].s||0:0];c.send(JSON.stringify({t:'ms',a,bd}))}
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
function dmgBudget(ws,t){return Infinity} // đã tắt anti-cheat sát thương

// ===== Vòng đồng bộ chung: dọn kết nối chết + gửi ping để đo độ trễ =====
setInterval(()=>{const t=now();wss.clients.forEach(c=>{if(c.readyState!==1)return;
 if(c.st&&t-c.st.seen>RULE.STALE){c.terminate();return}
 try{c.send(JSON.stringify({t:'ping',ts:t}))}catch(e){}})},5000);


// ===== TRADE + GIVE =====
const byName=n=>{n=String(n||'').trim().toLowerCase();let r=null;wss.clients.forEach(c=>{if(c.readyState===1&&!r&&String(c.n).toLowerCase()===n)r=c});return r};
const byId=id=>{id=id|0;let r=null;wss.clients.forEach(c=>{if(c.readyState===1&&c.id===id)r=c});return r};
const snd=(c,o)=>{try{if(c&&c.readyState===1)c.send(JSON.stringify(o))}catch(e){}};
const ilist=(a,mx)=>Array.isArray(a)?[...new Set(a.map(v=>sn(v,0,255)))].slice(0,mx):[];
const cleanOff=o=>{o=o&&typeof o==='object'?o:{};return{b:clamp(Math.floor(+o.b||0),0,1e12),g:clamp(Math.floor(+o.g||0),0,1e9),sw:ilist(o.sw,30),me:ilist(o.me,10).filter(i=>i>0),fr:Number.isInteger(o.fr)&&o.fr>=0&&o.fr<256?o.fr:-1}};
const trPeer=ws=>ws.trade?(ws.trade.a===ws?ws.trade.b:ws.trade.a):null;
function endTrade(ws,notify){const T=ws.trade;if(!T)return;const p=trPeer(ws);ws.trade=null;if(p){p.trade=null;if(notify)snd(p,{t:'tc'})}}

// ===== PHÒNG DUNGEON / RAID NHIỀU NGƯỜI: tạo phòng -> người khác vào -> đủ 2 người thì đếm ngược 10 giây -> cùng vào (vùng riêng d<k>r<id>) =====
const ROOMS=new Map(),RMAX=4,RCD=10000;let rid=1;
const rmCd=r=>r.go?Math.max(0,Math.ceil((r.go-now())/1000)):0;
const rmPub=r=>({id:r.id,k:r.k,hn:r.host.n,n:r.mem.size,mx:RMAX,cd:rmCd(r)});
const rmList=()=>bcast({t:'rl',a:[...ROOMS.values()].map(rmPub)});
const rmMem=r=>{const o={t:'rm',id:r.id,k:r.k,m:[...r.mem].map(c=>c.n),h:r.host.n,cd:rmCd(r)};r.mem.forEach(c=>snd(c,o))};
function rmLeave(ws){const r=ws.room;if(!r)return;ws.room=null;r.mem.delete(ws);snd(ws,{t:'rx',id:r.id});
 if(!r.mem.size)ROOMS.delete(r.id);else{if(r.host===ws)r.host=[...r.mem][0];if(r.mem.size<2)r.go=0;rmMem(r)}rmList()}
setInterval(()=>{const t=now();for(const r of [...ROOMS.values()]){if(!r.go)continue;
 if(t>=r.go){ROOMS.delete(r.id);r.mem.forEach(c=>{c.room=null;snd(c,{t:'rg',id:r.id,k:r.k})});rmList()}else rmMem(r)}},1000);

// ===== CỔNG HẦM NGỤC VÔ TẬN: cứ 5 phút xuất hiện 1 cổng ở 1 đảo bất kỳ, biến mất sau 50 giây; vào cổng -> sảnh chờ 20 giây -> cùng vào (vùng riêng d5r<id>) =====
// Chỉnh ở đây (có thể đặt biến môi trường PT_GAP=giây để thử nhanh, ví dụ PT_GAP=30)
const PTC={GAP:(+process.env.PT_GAP||300)*1000,LIFE:120000,LOBBY:30000,MAXP:4,ISL:[0,1,2,3,4,5,6,7,8,9,10,12],RK:[35,22,15,10,8,6,4]}; // RK = % xuất hiện cổng E,D,C,B,A,S,Đỏ (cộng đủ 100)
const ptRank=()=>{let x=Math.random()*100;for(let i=0;i<PTC.RK.length;i++){x-=PTC.RK[i];if(x<0)return i}return 0}; // ISL = số thứ tự bến trong DOCKS của client
const PT={on:0,end:0,next:Date.now()+PTC.GAP,i:0,rk:0},PLS=new Set();
const ptMsg=()=>({t:'pt',on:PT.on,i:PT.i,rk:PT.rk,left:PT.on?Math.max(0,PT.end-now()):0});
const plPub=l=>({t:'pl',rk:l.rk,m:[...l.mem].map(c=>c.n),cd:Math.max(0,Math.ceil((l.go-now())/1000))});
const plSend=l=>{const o=plPub(l);l.mem.forEach(c=>snd(c,o))};
function plLeave(ws,quiet){const l=ws.lob;if(!l)return;ws.lob=null;l.mem.delete(ws);if(!quiet)snd(ws,{t:'px'});if(!l.mem.size)PLS.delete(l);else plSend(l)}
function plJoin(ws){if(ws.lob)return;if(!PT.on||(ws.z!=='w'&&ws.z!=='sky')){snd(ws,{t:'px'});return}
 rmLeave(ws);let l=[...PLS].find(q=>q.go-now()>1000&&q.mem.size<PTC.MAXP);
 if(!l){l={mem:new Set(),go:now()+PTC.LOBBY,rk:PT.rk};PLS.add(l)}
 l.mem.add(ws);ws.lob=l;plSend(l)}
function plGo(l){PLS.delete(l);const id=rid++;l.mem.forEach(c=>{c.lob=null;snd(c,{t:'rg',id,k:5,rk:l.rk,pt:1})})}
setInterval(()=>{const t=now();
 if(!PT.on){if(t>=PT.next){PT.next=t+PTC.GAP;if(wss.clients.size){PT.on=1;PT.end=t+PTC.LIFE;PT.i=PTC.ISL[Math.random()*PTC.ISL.length|0];PT.rk=ptRank();bcast(ptMsg())}}}
 else if(t>=PT.end){PT.on=0;bcast(ptMsg())}
 for(const l of [...PLS]){if(t>=l.go)plGo(l);else plSend(l)}},1000);

const CHAT=[];   // lịch sử chat chung (100 tin gần nhất), gửi cho người mới vào
const cs=a=>Array.isArray(a)?a.slice(0,20).map(v=>v==null||!Number.isFinite(+v)?null:Math.round(+v*100)/100):0;   // trạng thái AI boss: chỉ nhận mảng số
wss.on('connection',ws=>{
  if(wss.clients.size>MAX){ws.close();return}
  ws.id=nid++;ws.z='w';ws.n='Hải tặc';ws.last=0;ws.lastC=0;
  ws.st={x:0,y:0,f:1,lv:1,hp:100,sky:0,lab:0,app:app({}),has:0,lastP:now(),seen:now(),lastSkill:0,lastBasic:0,slot:{},win:[],dtok:RULE.DPS_BASE*RULE.DPS_WIN,dlast:now(),rtt:0};
  ws.send(JSON.stringify({t:'v',v:10,id:ws.id,ts:now()}));snd(ws,{t:'rl',a:[...ROOMS.values()].map(rmPub)});if(CHAT.length)snd(ws,{t:'ch',a:CHAT});snd(ws,{t:'fl',a:[...GF.values()].map(f=>gfPub(f,now()))});
  // Gửi ngay ảnh chụp tất cả người đang online để người mới thấy đủ, không phải đợi gói 'p'
  ply().forEach(c=>{if(c!==ws&&c.st.has)ws.send(JSON.stringify(pub(c)))});
  for(const ty in DB){if(+ty===29||+ty===34)continue;ws.send(JSON.stringify(+ty===8?{t:'lv',id:0}:{t:'bo',ty:+ty}))}
  snd(ws,wbMsg());if(IG.on)snd(ws,{t:'ig',on:1,left:Math.max(0,IG.end-now())});if(PT.on)snd(ws,ptMsg());   // boss đang sống: người mới vào cũng thấy
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
    else if(m.t==='tp'){if(t-(ws.lastTP||0)<1500)return;ws.lastTP=t;ws.st.has=0}   // chiêu dịch chuyển (Door C/V): bỏ qua kiểm tra tốc độ cho gói vị trí kế tiếp, tối đa 1 lần/1,5 giây
    else if(m.t==='k'){out({t:'k',id:ws.id,k:String(m.k||'').slice(0,48)},ws,ws.z)}
    else if(m.t==='a'){if(t-(ws.lastA||0)<30)return;ws.lastA=t;
      const i=sn(m.i,0,20);
      if(!m.rel&&!canCast(ws,i,t)){ws.send(JSON.stringify({t:'deny',i,ts:t}));return} // server từ chối chiêu vi phạm cooldown
      if(m.rel&&!ws.st.slot[i]&&t-ws.st.lastSkill>RULE.GCD*8)return;                  // nhả chiêu phải có lần bấm trước
      if(m.rel){ws.st.lastSkill=t;ws.st.slot[i]=t}
      // vị trí phát chiêu = vị trí server đang giữ (không tin x,y client gửi kèm)
      out(Object.assign({t:'a',id:ws.id,i,ang:clamp(+m.ang||0,-7,7),x:ws.st.x,y:ws.st.y,f:m.f<0?-1:1,rel:m.rel?1:0,pw:clamp(+m.pw||0,0,3),ts:t},app(m)),ws,ws.z)}
    else if(m.t==='bp'){if(t-(ws.lastBP||0)<50)return;ws.lastBP=t;
      if(Array.isArray(m.a))for(const r of m.a.slice(0,8)){const mb=MB[r[0]|0];if(!mb||!mb.cl||mb.dead||mb.host!==ws)continue;const x=num(r[1]),y=num(r[2]);if(Math.hypot(x-mb.hx,y-mb.hy)>2500)continue;mb.x=x;mb.y=y;mb.s=cs(r[3])}
      if(Array.isArray(m.d))for(const r of m.d.slice(0,3)){const ty=r[0]|0,b=DB[ty];if(!b||b.host!==ws)continue;const x=num(r[1]),y=num(r[2]);if(Math.hypot(x-DYN[ty].x,y-DYN[ty].y)>4000)continue;b.x=x;b.y=y;b.s=cs(r[3])}}
    else if(m.t==='rc'){if(t-(ws.lastR||0)<1000||ROOMS.size>=200)return;ws.lastR=t;const k=sn(m.k,0,6);if(!k||k===5)return;rmLeave(ws);
      const r={id:rid++,k,host:ws,mem:new Set([ws]),go:0};ROOMS.set(r.id,r);ws.room=r;rmMem(r);rmList()}
    else if(m.t==='rj'){if(t-(ws.lastR||0)<500)return;ws.lastR=t;const r=ROOMS.get(m.id|0);if(!r||ws.room===r||r.mem.size>=RMAX||(r.go&&r.go-t<2000))return;
      rmLeave(ws);r.mem.add(ws);ws.room=r;if(!r.go&&r.mem.size>=2)r.go=t+RCD;rmMem(r);rmList()}
    else if(m.t==='rq'){rmLeave(ws)}
    else if(m.t==='pj'){if(t-(ws.lastPJ||0)<500)return;ws.lastPJ=t;plJoin(ws)}
    else if(m.t==='pq'){plLeave(ws,1)}
    else if(m.t==='ps'){const l=ws.lob;if(l&&l.mem.size>=2&&t-(ws.lastPS||0)>1000){ws.lastPS=t;plGo(l)}}   // từ 2 người trở lên: bấm Bắt đầu là cùng vào ngay
    else if(m.t==='dp'){if(t-(ws.lastD||0)<50||!Array.isArray(m.a)||!/^d[0-9]r/.test(ws.z))return;ws.lastD=t;   // host phòng dungeon gửi vị trí quái, server chuyển cho cả phòng
      out({t:'dp',id:ws.id,w:sn(m.w,0,60),f:m.f==null||!Number.isFinite(+m.f)?null:+m.f,a:m.a.slice(0,40).map(r=>[String(r[0]).slice(0,48),num(r[1]),num(r[2]),cs(r[3]),r[4]==null?null:sn(r[4],0,20000000)]),k:Array.isArray(m.k)?m.k.slice(0,60).map(q=>String(q).slice(0,48)):[]},ws,ws.z)}
    else if(m.t==='dh'){if(t-(ws.lastDH||0)<30||!Array.isArray(m.a)||!/^d[0-9]r/.test(ws.z))return;ws.lastDH=t;   // người không phải host báo sát thương (% máu) lên host
      out({t:'dh',id:ws.id,a:m.a.slice(0,20).map(r=>[String(r[0]).slice(0,48),sn(r[1],0,5000000)])},ws,ws.z)}
    else if(m.t==='mtab'){setTab(m.a);ws.send(JSON.stringify({t:'mn',n:MB.length}))}
    else if(m.t==='dmg'&&DID[m.i|0]){const ty=DID[m.i|0],b=DB[ty],D=DYN[ty];if(!b||(ws.z!=='w'&&ws.z!=='sky'))return;
      if(Math.hypot((ws.px||0)-D.x,(ws.py||0)-D.y)>1600)return;
      const bud=dmgBudget(ws,t);let d=Math.min(Math.max(0,+m.d||0),b.mx,bud);if(!d)return;
      ws.st.dtok-=d;b.hp-=d;b.dd.set(ws.id,(b.dd.get(ws.id)||0)+d);
      if(b.hp<=0){const by=[...b.dd].filter(([id,v])=>v>=b.mx*D.th).map(x=>x[0]);delete DB[ty];if(ty===8){LVDIED=t;LVT=t}out({t:'md',i:D.id,by},null);if(ty===29)wbStop(true)}}
    else if(m.t==='dmg'){const mb=MB[m.i|0];if(!mb||mb.dead||ws.z!==mb.z)return;
      if(Math.hypot((ws.px||0)-mb.x,(ws.py||0)-mb.y)>(mb.cl?1600:700))return;
      const bud=dmgBudget(ws,t);let d=Math.min(Math.max(0,+m.d||0),mb.mx,bud);if(!d)return;
      ws.st.dtok-=d;mb.hp-=d;mb.al=6;mb.dd.set(ws.id,(mb.dd.get(ws.id)||0)+d);
      if(mb.hp<=0){mb.hp=0;mb.dead=1;mb.rs=mb.rt;
       // boss: phải gây ≥3% máu mới có thưởng (chống ăn ké); quái thường: đánh trúng là có phần
       const by=[...mb.dd].filter(([id,v])=>!mb.cl||v>=mb.mx*.03).map(x=>x[0]);
       out({t:'md',i:mb.i,by},null,mb.z);mb.dd.clear()}}
    else if(m.t==='fd'){const i=sn(m.i,0,255),left=clamp(Math.floor(+m.left||0),0,GFLIFE),x=num(m.x),y=num(m.y);   // vứt trái xuống đất: server giữ, báo cho mọi người
      let mine=0;for(const f of GF.values())if(f.o===ws.id)mine++;
      if(t-(ws.lastFD||0)<1000||left<3000||GF.size>=GFMAX||mine>=GFPER||Math.hypot((ws.px||0)-x,(ws.py||0)-y)>250){snd(ws,{t:'fdn',i,left});return}
      ws.lastFD=t;const f={id:gfid++,i,x,y,z:ws.z,exp:t+left,o:ws.id};GF.set(f.id,f);bcast({t:'fa',f:gfPub(f,t)})}
    else if(m.t==='fp'){if(t-(ws.lastFP||0)<300)return;ws.lastFP=t;const id=m.id|0,f=GF.get(id);   // nhặt trái: ai tới trước được
      if(!f||f.exp<=t){if(f)GF.delete(id);snd(ws,{t:'fx',id});return}
      if(f.z!==ws.z||Math.hypot((ws.px||0)-f.x,(ws.py||0)-f.y)>140)return;
      GF.delete(id);snd(ws,{t:'fg',id,i:f.i,left:f.exp-t});bcast({t:'fx',id},ws)}
    else if(m.t==='adm'){if((ws.fails|0)>=5||t-(ws.lastAdm||0)<1000)return;ws.lastAdm=t;
      if(AK&&eqKey(String(m.k||'').slice(0,64),AK)){ws.admin=1;snd(ws,{t:'adm',ok:1})}else{ws.fails=(ws.fails|0)+1;snd(ws,{t:'adm',ok:0})}}
    else if(m.t==='igs'){if(!ws.admin)return;if(t-(ws.lastIG||0)<2000)return;ws.lastIG=t;snd(ws,{t:'igr',ok:igSummon(t)?1:0})}   // admin: triệu hồi Ichigo
    else if(m.t==='lv'){if(DB[8]||CH||t-(LVT||0)<10000)return;LVT=t;dynStart(8);out({t:'lv',id:ws.id},ws)}
    else if(m.t==='bo'){const ty=m.ty|0;if(ty!==3&&ty!==16&&ty!==35)return;if(ty===35&&((ws.z!=='w'&&ws.z!=='sky')||Math.hypot((ws.px||0)-DYN[35].x,(ws.py||0)-DYN[35].y)>1600))return;if(dynStart(ty))out({t:'bo',ty},ws)}
    else if(m.t==='cs'){if(CH){if(chAge()<10&&!(ws.key&&CH.opened.has(ws.key)))ws.send(JSON.stringify({t:'cs',tier:CH.tier,age:chAge()}));return}
      if(t-LVDIED>30000)return;CH={tier:sn(m.tier,0,2),born:t,opened:new Set()};out({t:'cs',tier:CH.tier,age:0},ws)}
    else if(m.t==='co'){if(!CH)return;CH.opened.add(ws.key||('id'+ws.id));out({t:'co',id:ws.id},ws)}
    else if(m.t==='sk'){if(!okKey(m.k))return;ws.key=m.k;const r=SAVES[m.k];ws.send(JSON.stringify({t:'sg',ver:r?r.ver:0,d:r?r.d:null}));if(CH&&!CH.opened.has(m.k))ws.send(JSON.stringify({t:'cs',tier:CH.tier,age:chAge()}))}
    else if(m.t==='sp'){if(!ws.key||t-(ws.lastSP||0)<2000)return;ws.lastSP=t;
      let d=typeof m.d==='string'?m.d:'';if(!d||d.length>200000)return;if(ws.admin){try{JSON.parse(d)}catch(e){return}}else{d=cleanSave(d);if(!d)return}
      const r=SAVES[ws.key];
      if(!r&&Object.keys(SAVES).length>=20000)return;
      if(r&&!m.force&&(m.base|0)!==r.ver){ws.send(JSON.stringify({t:'sg',ver:r.ver,d:r.d}));return}   // máy khác đã lưu bản mới hơn → để client tự quyết
      const ver=(r?r.ver:0)+1;SAVES[ws.key]={ver,d,at:t};svDirty=1;ws.send(JSON.stringify({t:'sa',ver}))}
    else if(m.t==='gv'){if(!ws.admin)return;if(t-(ws.lastG||0)<500)return;ws.lastG=t;const p=byName(m.to),k=String(m.k||'');
      if(!p||!['beli','gem','fruit','melee','sword'].includes(k)){snd(ws,{t:'gr',ok:0,to:String(m.to||'').slice(0,14)});return}
      const v=(k==='beli'||k==='gem')?clamp(Math.floor(+m.v||0),1,1e9):sn(m.v,0,255);
      snd(p,{t:'gv',from:ws.n,k,v});snd(ws,{t:'gr',ok:1,to:p.n,k,v})}
    else if(m.t==='tr'){if(t-(ws.lastT||0)<800)return;ws.lastT=t;const p=byId(m.to);
      if(!p||p===ws||ws.trade||p.trade){snd(ws,{t:'tn',from:m.to|0});return}
      p.treq=ws.id;snd(p,{t:'tr',from:ws.id,n:ws.n})}
    else if(m.t==='ty'){const p=byId(m.to);if(!p||p===ws||ws.treq!==p.id||ws.trade||p.trade){snd(ws,{t:'tn',from:m.to|0});return}
      ws.treq=0;const T={a:p,b:ws,o:{[p.id]:cleanOff(),[ws.id]:cleanOff()},l:{}};p.trade=T;ws.trade=T;
      snd(p,{t:'ts',with:ws.id,n:ws.n});snd(ws,{t:'ts',with:p.id,n:p.n})}
    else if(m.t==='tn'){const p=byId(m.to);if(ws.treq===(m.to|0))ws.treq=0;snd(p,{t:'tn',from:ws.id})}
    else if(m.t==='to'){const T=ws.trade;if(!T)return;T.o[ws.id]=cleanOff(m.o);T.l={};snd(trPeer(ws),{t:'to',o:T.o[ws.id]})}
    else if(m.t==='tk'){const T=ws.trade;if(!T)return;T.l[ws.id]=1;snd(trPeer(ws),{t:'tk'});
      if(T.l[T.a.id]&&T.l[T.b.id]){const a=T.a,b=T.b;a.trade=null;b.trade=null;
        snd(a,{t:'td',mine:T.o[a.id],theirs:T.o[b.id]});snd(b,{t:'td',mine:T.o[b.id],theirs:T.o[a.id]})}}
    else if(m.t==='tc'){endTrade(ws,1)}
    else if(m.t==='c'){if(t-ws.lastC<500)return;ws.lastC=t;const s=String(m.s||'').trim().slice(0,80);if(!s)return;CHAT.push([t,ws.n,s]);if(CHAT.length>100)CHAT.shift();out({t:'c',id:ws.id,n:ws.n,s},ws)}});
  ws.on('close',()=>{rmLeave(ws);plLeave(ws,1);endTrade(ws,1);out({t:'bye',id:ws.id})});
});
server.listen(process.env.PORT||8080,()=>console.log('Server chạy cổng',process.env.PORT||8080));
