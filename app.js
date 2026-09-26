(function(){
"use strict";
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); if(parent) parent.appendChild(e); return e; }
function hexToRgb(h){ h=h.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const n=parseInt(h,16); return [n>>16&255,n>>8&255,n&255]; }

/* ---------- theme ---------- */
const root=document.documentElement;
try{ const t=localStorage.getItem('cg-theme'); if(t) root.setAttribute('data-theme',t); }catch(e){}
const redrawers=[];
$('#themeBtn').addEventListener('click',()=>{
  const cur=root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  const next=cur==='dark'?'light':'dark'; root.setAttribute('data-theme',next);
  try{ localStorage.setItem('cg-theme',next); }catch(e){}
  redrawers.forEach(f=>f());
});

/* ---------- the "model" landscape ---------- */
const sig=z=>1/(1+Math.exp(-z));
function model(x,y){ // x: income (0..1), y: debt (0..1)
  let f=sig(5.2*(x-0.42)-4.4*(y-0.45));
  f+=0.30*Math.exp(-((x-0.72)**2+(y-0.66)**2)/(2*0.05**2)); // odd bump: more debt, higher score
  if(x<0.3 && y>0.72) f*=0.22; // hard policy cliff
  return Math.max(0,Math.min(1,f));
}
function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function gradAt(x,y){ const h=0.01; return Math.hypot((model(x+h,y)-model(x-h,y))/(2*h),(model(x,y+h)-model(x,y-h))/(2*h)); }
function makeProbes(n,seed){
  const r=rng(seed), pts=[];
  const inDom=(x,y)=>x+y<1.42;
  const k=6; for(let i=0;i<k;i++) for(let j=0;j<k;j++){ const q=[(i+0.2+0.6*r())/k,(j+0.2+0.6*r())/k]; if(inDom(q[0],q[1])) pts.push(q); }
  while(pts.length<n){
    let best=null,bw=-1;
    for(let c=0;c<60;c++){
      const x=r(),y=r(); if(!inDom(x,y)) { c--; continue; } let d=9; for(const p of pts){ const dd=Math.hypot(p[0]-x,p[1]-y); if(dd<d) d=dd; }
      const w=(0.25+Math.min(gradAt(x,y),3))*d;
      if(w>bw){bw=w;best=[x,y];}
    }
    pts.push(best);
  }
  return pts;
}
const PROBES=makeProbes(170,7);

class Terrain{
  constructor(canvas,opt){ this.c=canvas; this.ctx=canvas.getContext('2d'); this.opt=Object.assign({cell:6},opt||{}); this.shown=0; this.mode={}; this.resize(); }
  resize(){
    const r=this.c.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
    this.W=Math.max(200,r.width); this.H=Math.max(160,r.height);
    this.c.width=this.W*dpr; this.c.height=this.H*dpr; this.ctx.setTransform(dpr,0,0,dpr,0,0);
    const s=this.opt.cell; this.cols=Math.ceil(this.W/s); this.rows=Math.ceil(this.H/s);
    const N=this.cols*this.rows; this.F=new Float32Array(N); this.G=new Float32Array(N); this.D=new Float32Array(N);
    let gmax=0;
    for(let j=0;j<this.rows;j++) for(let i=0;i<this.cols;i++){
      const x=(i+.5)/this.cols, y=1-(j+.5)/this.rows, k=j*this.cols+i;
      this.F[k]=model(x,y); const g=gradAt(x,y); this.G[k]=g; if(g>gmax) gmax=g;
    }
    for(let k=0;k<N;k++) this.G[k]=Math.min(1,this.G[k]/(gmax*0.35));
    this.recomputeD();
  }
  recomputeD(){ this.D.fill(9); for(let p=0;p<this.shown;p++) this.stamp(PROBES[p]); }
  stamp(p){
    const cols=this.cols,rows=this.rows;
    for(let j=0;j<rows;j++){ const y=1-(j+.5)/rows, dy=y-p[1];
      for(let i=0;i<cols;i++){ const dx=(i+.5)/cols-p[0], d=Math.sqrt(dx*dx+dy*dy), k=j*cols+i; if(d<this.D[k]) this.D[k]=d; } }
  }
  setShown(n){ n=Math.min(n,PROBES.length); if(n<this.shown){ this.shown=n; this.recomputeD(); } else { for(let p=this.shown;p<n;p++) this.stamp(PROBES[p]); this.shown=n; } }
  draw(){
    const ctx=this.ctx, s=this.opt.cell, cols=this.cols, rows=this.rows, m=this.mode;
    const lo=hexToRgb(css('--t-lo')), hi=hexToRgb(css('--t-hi')), pp=hexToRgb(css('--paper-2')), ink=css('--ink'), hatch=css('--hatch');
    ctx.clearRect(0,0,this.W,this.H);
    const bands=9, R=m.R||0.11;
    const cert=new Float32Array(cols*rows);
    for(let k=0;k<cols*rows;k++){
      const unc=this.D[k]*(0.3+(m.gw||1)*this.G[k]);
      cert[k]=m.showLand? Math.max(0,Math.min(1,1-unc/R)) : 0;
    }
    for(let j=0;j<rows;j++) for(let i=0;i<cols;i++){
      const k=j*cols+i, c=cert[k]; if(c<=0.02) continue;
      const b=Math.min(bands-1,Math.floor(this.F[k]*bands))/(bands-1);
      const t=Math.min(1,c/0.4), tt=t*t*(3-2*t);
      const col=lo.map((v,q)=>Math.round(pp[q]+((v+(hi[q]-v)*b)-pp[q])*tt));
      ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.fillRect(Math.floor(i*s),Math.floor(j*s),Math.ceil(s)+1,Math.ceil(s)+1);
    }
    if(m.showLand){
      ctx.strokeStyle=ink; ctx.globalAlpha=.35; ctx.lineWidth=1; ctx.beginPath();
      for(let j=0;j<rows-1;j++) for(let i=0;i<cols-1;i++){
        const k=j*cols+i; if(cert[k]<0.45) continue;
        const b=Math.floor(this.F[k]*bands);
        if(Math.floor(this.F[k+1]*bands)!==b){ ctx.moveTo((i+1)*s,j*s); ctx.lineTo((i+1)*s,(j+1)*s); }
        if(Math.floor(this.F[k+cols]*bands)!==b){ ctx.moveTo(i*s,(j+1)*s); ctx.lineTo((i+1)*s,(j+1)*s); }
      }
      ctx.stroke(); ctx.globalAlpha=1;
    }
    if(m.hatch){
      ctx.save(); ctx.beginPath();
      for(let j=0;j<rows;j++) for(let i=0;i<cols;i++){
        const k=j*cols+i, x=(i+.5)/cols, y=1-(j+.5)/rows;
        const nearCliff=(m.cliff && ((Math.abs(x-0.3)<0.03 && y>0.7) || (Math.abs(y-0.72)<0.03 && x<0.32)));
        if(cert[k]<0.45 || nearCliff) ctx.rect(i*s,j*s,s,s);
      }
      ctx.clip(); ctx.strokeStyle=hatch; ctx.lineWidth=1.3; ctx.beginPath();
      for(let d=-this.H;d<this.W;d+=7){ ctx.moveTo(d,this.H); ctx.lineTo(d+this.H,0); }
      ctx.stroke(); ctx.restore();
    }
    // probes
    ctx.strokeStyle=ink; ctx.lineWidth=1.4; ctx.beginPath();
    for(let p=0;p<this.shown;p++){ const x=PROBES[p][0]*this.W, y=(1-PROBES[p][1])*this.H, a=3.5; ctx.moveTo(x-a,y); ctx.lineTo(x+a,y); ctx.moveTo(x,y-a); ctx.lineTo(x,y+a); }
    ctx.globalAlpha=m.showLand?.55:.9; ctx.stroke(); ctx.globalAlpha=1;
    if(m.cliff){ this.flag(0.16,0.86,'sudden cliff: a hard rule', css('--flag')); }
    if(m.violation){
      const x=0.72*this.W, y=(1-0.66)*this.H, al=css('--alarm');
      ctx.strokeStyle=al; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x,y,Math.min(this.W,this.H)*0.07,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-10,y+32); ctx.lineTo(x-10,y-32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-16,y-24); ctx.lineTo(x-10,y-32); ctx.lineTo(x-4,y-24); ctx.stroke();
      this.label(x+Math.min(this.W,this.H)*0.08, y-8, 'more debt, higher score?', al);
    }
    if(m.axes){
      this.label(this.W-110,this.H-84,'income →',css('--ink'));
      ctx.save(); ctx.translate(20,110); ctx.rotate(-Math.PI/2); this.label(0,0,'debt →',css('--ink')); ctx.restore();
    }
  }
  flag(fx,fy,text,col){ const ctx=this.ctx,x=fx*this.W,y=(1-fy)*this.H; ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(x,y+14); ctx.lineTo(x,y-18); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y-18); ctx.lineTo(x+16,y-12); ctx.lineTo(x,y-6); ctx.fill(); this.label(x+20,y+6,text,col); }
  label(x,y,t,col){ const ctx=this.ctx; ctx.font='700 13px "Atkinson Hyperlegible", sans-serif'; const w=ctx.measureText(t).width; if(x+w+12>this.W) x=this.W-w-14; ctx.fillStyle=css('--paper'); ctx.globalAlpha=.9; ctx.fillRect(x-4,y-14,w+8,20); ctx.globalAlpha=1; ctx.fillStyle=col; ctx.fillText(t,x,y); }
}

/* ---------- hero ---------- */
const hero=new Terrain($('#heroCanvas'),{cell:5});
hero.mode={showLand:true,hatch:true,R:0.1,gw:1};
const heroCount=$('#heroCounter');
let heroAnim=null;
function runHero(){
  cancelAnimationFrame(heroAnim); hero.setShown(0);
  if(reduce){ hero.setShown(PROBES.length); hero.draw(); heroCount.textContent=PROBES.length+' questions asked'; return; }
  const t0=performance.now(), dur=5200;
  (function tick(t){ const p=Math.min(1,(t-t0)/dur), n=Math.round(PROBES.length*(1-Math.pow(1-p,1.6)));
    hero.setShown(n); hero.draw(); heroCount.textContent=n+' questions asked';
    if(p<1) heroAnim=requestAnimationFrame(tick); })(t0);
}
$('#heroReplay').addEventListener('click',runHero);
redrawers.push(()=>hero.draw());

/* ---------- scrollytelling ---------- */
const sc=new Terrain($('#sceneCanvas'),{cell:6});
redrawers.push(()=>sc.draw());
const panels={box:$('#p-box'),explain:$('#p-explain'),report:$('#p-report')};
const modes={
  probe:{n:90,m:{showLand:false,axes:true}},
  map:{n:170,m:{showLand:true,R:0.12,axes:true}},
  certify:{n:170,m:{showLand:true,R:0.1,gw:1,hatch:true,cliff:true,axes:true}},
  stress:{n:170,m:{showLand:true,R:0.12,violation:true,axes:true}}
};
let scAnim=null;
function setScene(name,cap){
  $('#sceneCap').textContent=cap||'';
  Object.entries(panels).forEach(([k,p])=>p.classList.toggle('on',k===name));
  const cv=$('#sceneCanvas'), md=modes[name];
  cv.style.opacity=md?1:0;
  if(name==='explain') drawBars(true);
  if(!md) return;
  sc.mode=md.m; cancelAnimationFrame(scAnim);
  const from=sc.shown, to=md.n;
  if(reduce||from>=to){ sc.setShown(to); sc.draw(); return; }
  const t0=performance.now(), dur=1600;
  (function tick(t){ const p=Math.min(1,(t-t0)/dur); sc.setShown(Math.round(from+(to-from)*p)); sc.draw(); if(p<1) scAnim=requestAnimationFrame(tick); })(t0);
}
const steps=[...document.querySelectorAll('.step')];
const stepObs=new IntersectionObserver(es=>{ es.forEach(e=>{ if(e.isIntersecting){ steps.forEach(s=>s.classList.toggle('on',s===e.target)); setScene(e.target.dataset.scene,e.target.dataset.cap); } }); },{rootMargin:'-45% 0px -45% 0px'});
steps.forEach(s=>stepObs.observe(s));

/* bars */
const reasons=[['Debt is 58% of income',-0.21],['Missed a repayment in 2025',-0.12],['8 months in current job',-0.05],['Income ₹52,000 a month',0.07],['Clean credit history before 2025',0.04]];
function drawBars(animate){
  const g=$('#barsG'); g.innerHTML=''; const cx=230, sc2=700;
  el('line',{x1:cx,y1:-4,x2:cx,y2:reasons.length*44,stroke:css('--ink'),'stroke-width':1.5},g);
  reasons.forEach((r,i)=>{
    const y=i*44, w=Math.abs(r[1])*sc2, neg=r[1]<0;
    el('text',{x:0,y:y+12,'font-size':13,fill:css('--ink')},g).textContent=r[0];
    const rect=el('rect',{class:'fill',x:neg?cx-w:cx,y:y+18,height:16,width:animate&&!reduce?0:w,fill:neg?css('--alarm'):css('--moss'),rx:2},g);
    if(neg&&animate&&!reduce){ rect.setAttribute('x',cx); }
    const t=el('text',{x:neg?cx-w-6:cx+w+6,y:y+31,'font-size':12,'text-anchor':neg?'end':'start',fill:css('--ink-2')},g); t.textContent=(r[1]>0?'+':'')+r[1].toFixed(2);
    if(animate&&!reduce) requestAnimationFrame(()=>requestAnimationFrame(()=>{ rect.style.transition='width .9s cubic-bezier(.2,.8,.2,1), x .9s cubic-bezier(.2,.8,.2,1)'; rect.setAttribute('width',w); if(neg) rect.setAttribute('x',cx-w); }));
  });
}
drawBars(false); redrawers.push(()=>drawBars(false));

/* ---------- combinatorics ---------- */
function fmtTime(ms){
  const s=ms/1000; if(s<1) return Math.round(ms)+' milliseconds'; if(s<60) return s.toFixed(1)+' seconds';
  const m=s/60; if(m<60) return m.toFixed(1)+' minutes'; const h=m/60; if(h<48) return h.toFixed(1)+' hours';
  const d=h/24; if(d<730) return Math.round(d)+' days'; const y=d/365.25;
  if(y<1e3) return Math.round(y).toLocaleString('en')+' years'; if(y<1e6) return (y/1e3).toFixed(1)+' thousand years';
  if(y<1e9) return (y/1e6).toFixed(1)+' million years'; return (y/1e9).toFixed(1)+' billion years';
}
function fmtN(q){ if(q<1e6) return Math.round(q).toLocaleString('en'); const u=[[1e18,'quintillion'],[1e15,'quadrillion'],[1e12,'trillion'],[1e9,'billion'],[1e6,'million']]; for(const [v,n] of u) if(q>=v) return (q/v).toFixed(1)+' '+n; }
function calc(){
  const n=+$('#nFeat').value; $('#nOut').value=n;
  const brute=Math.pow(2,n), ours=n*400, max=19;
  $('#barBrute').style.width=(Math.log10(brute)/max*100)+'%';
  $('#barOurs').style.width=(Math.log10(ours)/max*100)+'%';
  $('#txtBrute').textContent=fmtN(brute)+' model questions, about '+fmtTime(brute);
  $('#txtOurs').textContent='about '+fmtN(ours)+' questions, about '+fmtTime(ours);
  $('#bigTime').textContent='With '+n+' inputs, the textbook method needs '+fmtTime(brute)+' per decision. Our map needs about '+fmtTime(ours)+' once, then answers instantly.';
}
$('#nFeat').addEventListener('input',calc); calc();

/* ---------- timeline ---------- */
function drawTimeline(){
  const s=$('#tlSvg'); s.innerHTML='';
  const x0=60,x1=1060,y=165, t0=2023.0,t1=2028.2, X=t=>x0+(t-t0)/(t1-t0)*(x1-x0);
  el('line',{x1:x0,y1:y,x2:x1,y2:y,stroke:css('--ink'),'stroke-width':2},s);
  for(let yr=2023;yr<=2028;yr++){ el('line',{x1:X(yr),y1:y-6,x2:X(yr),y2:y+6,stroke:css('--ink')},s); const t=el('text',{x:X(yr),y:y+24,'text-anchor':'middle','font-size':13,'font-weight':700,fill:css('--ink'),'font-family':'Bricolage Grotesque, sans-serif'},s); t.textContent=yr; }
  const nowX=X(2026.73); el('line',{x1:nowX,y1:y-20,x2:nowX,y2:y+20,stroke:css('--signal'),'stroke-width':2,'stroke-dasharray':'3 3'},s);
  el('text',{x:nowX,y:y+40,'text-anchor':'middle','font-size':12,'font-weight':700,fill:css('--signal')},s).textContent='today';
  const items=[
    [2023.72,'guide','US, Sept 2023','Lenders must give specific,','accurate reasons, even with AI',-1],
    [2024.38,'force','UK, May 2024','PRA SS1/23 model rules','take effect; cover AI/ML',1],
    [2026.29,'guide','US, Apr 2026','SR 26-2: machine-learning models','in scope; chatbots excluded',-1],
    [2026.48,'draft','India, Jun 2026','RBI draft: banks must check','vendor models, explain decisions',1],
    [2027.37,'draft','UK, May 2027','SS1/23 full compliance','expected for larger firms',-1],
    [2027.92,'draft','EU, Dec 2027','AI Act: credit scoring','is high-risk from this date',1]
  ];
  const col={force:css('--moss'),draft:css('--flag'),guide:css('--ink-2')};
  items.forEach(([t,k,h,a,b,side],i)=>{
    const x=X(t), ly=side<0? y-58-(i%2)*0 : y+62;
    el('line',{x1:x,y1:y,x2:x,y2:side<0?ly+30:ly-16,stroke:col[k],'stroke-width':2},s);
    el('circle',{cx:x,cy:y,r:8,fill:col[k],stroke:css('--paper'),'stroke-width':3},s);
    const tx=Math.min(Math.max(x,120),x1-100);
    const g=el('g',{'text-anchor':'middle'},s);
    const t1e=el('text',{x:tx,y:ly-(side<0?30:0),'font-size':13.5,'font-weight':800,fill:col[k],'font-family':'Bricolage Grotesque, sans-serif'},g); t1e.textContent=h;
    el('text',{x:tx,y:ly-(side<0?12:-18),'font-size':12.5,fill:css('--ink')},g).textContent=a;
    el('text',{x:tx,y:ly-(side<0?-4:-34),'font-size':12.5,fill:css('--ink')},g).textContent=b;
  });
}
drawTimeline(); redrawers.push(drawTimeline);

/* ---------- positioning ---------- */
const pos=[
  ['Model-risk workflow tools',0.30,0.42,'Organise validation work and paperwork. Rely on the explanation methods the customer brings.'],
  ['AI monitoring platforms',0.5,0.24,'Watch models in production and show explanations. No measured error on those explanations.'],
  ['Lending AI vendors',0.1,0.58,'Explain the models they built themselves. Not independent.'],
  ['Consultancies',0.58,0.62,'Careful manual validation. Slow and expensive; quality depends on people.'],
  ['Open-source SHAP tools',0.8,0.34,'Work from outside the model, but sample combinations; results vary with settings.'],
  ['Multiverse (compression)',0.08,0.1,'Changes the model to make it smaller. Different problem, needs the model weights.'],
  ['Us (target)',0.9,0.88,'Work from outside the model and attach a measured error to every answer. Must be proven by our benchmark.']
];
function drawPos(){
  const s=$('#posSvg'); s.innerHTML=''; const L=46,T=16,W=400,H=310;
  el('rect',{x:L+W/2,y:T,width:W/2,height:H/2,fill:css('--moss'),opacity:.1},s);
  el('line',{x1:L,y1:T+H,x2:L+W,y2:T+H,stroke:css('--ink'),'stroke-width':1.5},s);
  el('line',{x1:L,y1:T,x2:L,y2:T+H,stroke:css('--ink'),'stroke-width':1.5},s);
  el('text',{x:L+W,y:T+H+22,'text-anchor':'end','font-size':12,fill:css('--ink-2')},s).textContent='works from outside the model →';
  const yl=el('text',{x:-(T+H),y:L-14,'font-size':12,fill:css('--ink-2'),transform:'rotate(-90)'},s); yl.textContent='measured error bound →';
  const tip=$('#posTip');
  pos.forEach(p=>{
    const us=p[0].startsWith('Us');
    const g=el('g',{class:'pt',tabindex:0,role:'button','aria-label':p[0]+': '+p[3]},s);
    const cx=L+p[1]*W, cy=T+(1-p[2])*H;
    el('circle',{cx,cy,r:us?13:9,fill:us?css('--moss'):css('--paper'),stroke:us?css('--moss'):css('--ink'),'stroke-width':2},g);
    const lbl=el('text',{x:cx+(p[1]>0.7?-14:14),y:cy+4,'font-size':14,'text-anchor':p[1]>0.7?'end':'start',fill:css('--ink'),'font-weight':us?700:400},g); lbl.textContent=p[0];
    const show=()=>{ tip.textContent=p[3]; const fr=s.getBoundingClientRect(), pr=s.parentNode.getBoundingClientRect(); const sx=fr.width/460; tip.style.left=Math.min(pr.width-250,Math.max(6,cx*sx-100))+'px'; tip.style.top=(cy*sx+(p[2]>0.6?30:-70))+'px'; tip.style.opacity=1; };
    const hide=()=>tip.style.opacity=0;
    g.addEventListener('mouseenter',show); g.addEventListener('focus',show); g.addEventListener('mouseleave',hide); g.addEventListener('blur',hide);
  });
}
drawPos(); redrawers.push(drawPos);

/* ---------- revenue ---------- */
const scen={c:[0.03,0.15,0.35,0.6,0.9],b:[0.05,0.3,0.8,1.5,2.5],u:[0.08,0.45,1.4,3.0,5.5]};
const heads={c:[2,4,6,8,10],b:[3,6,10,14,18],u:[3,7,13,20,28]};
const names={c:'Conservative',b:'Base',u:'Upside'};
let curS='b';
function drawRev(anim){
  const s=$('#revSvg'); s.innerHTML=''; const L=48,T=22,W=360,H=226, ymax=6;
  const X=i=>L+i*(W/4), Y=v=>T+H-v/ymax*H;
  for(let v=0;v<=6;v+=2){ el('line',{x1:L,y1:Y(v),x2:L+W,y2:Y(v),stroke:css('--line')},s); el('text',{x:L-8,y:Y(v)+4,'text-anchor':'end','font-size':13,fill:css('--ink-2')},s).textContent='$'+v+'m'; }
  for(let i=0;i<5;i++) el('text',{x:X(i),y:T+H+20,'text-anchor':'middle','font-size':13,fill:css('--ink-2')},s).textContent='Year '+(i+1);
  ['c','b','u'].forEach(k=>{ if(k===curS) return; el('polyline',{points:scen[k].map((v,i)=>X(i)+','+Y(v)).join(' '),fill:'none',stroke:css('--ink-2'),'stroke-width':1.5,'stroke-dasharray':'4 4',opacity:.6},s); });
  const d=scen[curS];
  el('path',{d:'M'+X(0)+','+Y(0)+' '+d.map((v,i)=>'L'+X(i)+','+Y(v)).join(' ')+' L'+X(4)+','+Y(0)+'Z',fill:css('--moss'),opacity:.15},s);
  const line=el('polyline',{points:d.map((v,i)=>X(i)+','+Y(v)).join(' '),fill:'none',stroke:css('--moss'),'stroke-width':3.5,'stroke-linejoin':'round'},s);
  if(anim&&!reduce){ const len=line.getTotalLength(); line.style.strokeDasharray=len; line.style.strokeDashoffset=len; line.getBoundingClientRect(); line.style.transition='stroke-dashoffset 1s ease'; line.style.strokeDashoffset=0; }
  d.forEach((v,i)=>{ el('circle',{cx:X(i),cy:Y(v),r:4.5,fill:css('--moss')},s); el('text',{x:X(i),y:Y(v)-10,'text-anchor':'middle','font-size':13.5,'font-weight':700,fill:css('--ink')},s).textContent='$'+v+'m'; });
  $('#revCap').textContent=names[curS]+' case. Year-5 revenue about US$'+d[4]+'m with about '+heads[curS][4]+' people.';
}
document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>{ curS=b.dataset.s; document.querySelectorAll('.seg button').forEach(x=>x.setAttribute('aria-pressed',x===b)); drawRev(true); }));
drawRev(false); redrawers.push(()=>drawRev(false));

/* ---------- gantt ---------- */
(function(){
  const g=$('#gantt'); const rows=[
    ['Prove the pain is real',1,2,'--flag'],['Build engine and test suite',1,4,'--moss'],['Public benchmark',3,4,'--moss'],
    ['Paid pilots in India',4,12,'--signal'],['Funding: angels, RDI loan',6,18,'--ink-2'],['Turn jobs into software',12,24,'--moss'],
    ['Partner deals',15,24,'--signal'],['UK and EU via partners',24,36,'--signal']];
  const add=(cls,html,col,row)=>{ const d=document.createElement('div'); d.className=cls; if(html) d.innerHTML=html; d.style.gridColumn=col; d.style.gridRow=row; g.appendChild(d); return d; };
  add('g-lbl','<b>Month</b>','1','1');
  [1,6,12,18,24,30,36].forEach(m=>add('g-head',String(m),String(m+1),'1'));
  rows.forEach((r,i)=>{
    add('g-lbl','',"1",String(i+2)).textContent=r[0];
    const b=add('g-bar','',(r[1]+1)+' / '+(r[2]+2),String(i+2)); b.style.background='var('+r[3]+')'; b.setAttribute('role','img'); b.setAttribute('aria-label',r[0]+': month '+r[1]+' to '+r[2]);
  });
  const gr=String(rows.length+2);
  add('g-lbl','<b>Gates</b>','1',gr);
  [[2,'Gate 0'],[4,'Gate 1'],[12,'Gate 2'],[24,'Gate 3']].forEach(([m,t])=>{ const c=add('g-gate','<span>'+t+'</span>',String(m+1),gr); c.style.height='26px'; });
})();

/* ---------- checklist ---------- */
const needs={
  'People':['A credit-risk model validator as co-founder or equity advisor','A numerics engineer who owns the tensor-train engine','An ML engineer for connectors, from month 7','A chartered accountant and a cross-border lawyer on call'],
  'Technology':['Test suite that checks every number against a known answer','Connectors: XGBoost, LightGBM, PyTorch, scoring APIs, batch files','Certification: error maps and "refuse to answer" zones','Explanations: reasons and input combinations','Stress search for policy breaks','Report generator for RBI, PRA, SR 26-2 and EU AI Act','Package that runs inside the customer, no outside network'],
  'Evidence':['25–30 interviews logged in one spreadsheet','Data on which model types customers really use','Public benchmark with code, including where we lose','One customer confirming in writing they used our report'],
  'Company and legal':['Indian private limited company','DPIIT startup recognition','Non-disclosure and data-handling templates','Answers ready for bank security questionnaires','Contract template with audit rights and exit terms'],
  'Money':['6–12 months of founder runway','Check if the Startup India Seed Fund is open','RDI fund application once the prototype works','Angel round after benchmark and one letter of intent','Hiring rule: 12 months of salary covered before each hire'],
  'Customers':['List of 60 target people with an introduction path','3 design partners signed for paid pilots','Prices tested in at least 10 conversations','One conversation with a model-risk platform about partnering']
};
(function(){
  const box=$('#checks'); let saved={}; try{ saved=JSON.parse(localStorage.getItem('cg-checks')||'{}'); }catch(e){}
  let total=0;
  Object.entries(needs).forEach(([grp,items])=>{
    const d=document.createElement('div'); const h=document.createElement('h3'); h.textContent=grp; d.appendChild(h);
    items.forEach((t,i)=>{ total++; const id=grp+'-'+i; const lab=document.createElement('label'); const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!saved[id];
      cb.addEventListener('change',()=>{ saved[id]=cb.checked; try{ localStorage.setItem('cg-checks',JSON.stringify(saved)); }catch(e){} upd(); });
      const sp=document.createElement('span'); sp.textContent=t; lab.appendChild(cb); lab.appendChild(sp); d.appendChild(lab); });
    box.appendChild(d);
  });
  function upd(){ const done=box.querySelectorAll('input:checked').length; $('#meterFill').style.width=(done/total*100)+'%'; $('#meterTxt').textContent=done+' of '+total+' done'; }
  upd();
})();

/* ---------- risks ---------- */
const risks=[
  [1,3,3,'Most customer models are tree-based','For those, a fast exact explanation method already exists, so our explanation edge shrinks.','Check the model-type mix at Gate 0. Lead with outside-only checks, stress tests and reports.'],
  [2,3,3,'No credible validator on the team','Banks trust named people with validation track records, not new tools.','Recruit a credit-risk validator co-founder or equity advisor before Gate 1.'],
  [3,3,2,'We get stuck as a consultancy','Service revenue grows only with headcount.','From month 12, 30% of new sales must be licences or certificates.'],
  [4,3,2,'Indian contract values are small','Budgets at NBFCs are tight.','Sell vendor certificates; reach UK and EU through partners by year 2–3.'],
  [5,2,3,'Explanations wrong when inputs are linked','Income and debt move together; some methods assume they don\'t.','Research priority number one; state limits in every report.'],
  [6,2,3,'Silent maths errors in AI-written code','Wrong numbers can look plausible.','Every number checked against a known answer before it is merged.'],
  [7,2,2,'RBI rules delayed or softened','Drafts change and dates slip.','Sell on commercial reasons too: faster bank deals for vendors, co-lending risk.'],
  [8,2,2,'A bigger platform builds the same feature','Well-funded tools could add error bounds.','Publish first, partner early, compete on certificates.']
];
(function(){
  const m=$('#matrix'), det=$('#rdetail'), list=$('#rlist'); const cells={};
  for(let I=3;I>=1;I--){ const ax=document.createElement('div'); ax.className='axis y'; ax.textContent=I===3?'high impact':I===1?'low':''; m.appendChild(ax);
    for(let L=1;L<=3;L++){ const c=document.createElement('div'); c.className='cell'+(L+I>=6?' hot':L+I>=5?' warm':''); cells[L+'-'+I]=c; m.appendChild(c); } }
  m.appendChild(document.createElement('div'));
  ['unlikely','possible','likely'].forEach(t=>{ const a=document.createElement('div'); a.className='axis'; a.textContent=t; m.appendChild(a); });
  const btns=[];
  function show(r){ det.innerHTML='<h3>'+r[3]+'</h3><p>'+r[4]+'</p><p><b>Our response:</b> '+r[5]+'</p>'; btns.forEach(b=>b.setAttribute('aria-pressed',b.dataset.id==r[0])); }
  risks.forEach(r=>{ const b=document.createElement('button'); b.className='rbtn'; b.type='button'; b.textContent=r[0]; b.dataset.id=r[0]; b.setAttribute('aria-label','Risk '+r[0]+': '+r[3]); b.setAttribute('aria-pressed','false'); b.addEventListener('click',()=>show(r)); cells[r[1]+'-'+r[2]].appendChild(b); btns.push(b);
    const li=document.createElement('li'); li.innerHTML='<b>'+r[0]+'.</b> '+r[3]; list.appendChild(li); });
  show(risks[0]);
})();

/* ---------- nav + progress ---------- */
const links=[...document.querySelectorAll('.chapters a')];
const secObs=new IntersectionObserver(es=>{ es.forEach(e=>{ if(e.isIntersecting){ links.forEach(a=>{ const on=a.getAttribute('href')==='#'+e.target.id; a.classList.toggle('on',on); if(on){ const nav=a.parentNode; nav.scrollLeft=a.offsetLeft-nav.clientWidth/2+a.clientWidth/2; } }); } }); },{rootMargin:'-40% 0px -55% 0px'});
document.querySelectorAll('main section[id]').forEach(s=>secObs.observe(s));
const prog=$('#progress');
addEventListener('scroll',()=>{ const h=document.documentElement; prog.style.width=(h.scrollTop/(h.scrollHeight-h.clientHeight)*100)+'%'; },{passive:true});

/* ---------- start ---------- */
let rt; addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(()=>{ const n1=hero.shown,n2=sc.shown; hero.resize(); hero.setShown(n1); hero.draw(); sc.resize(); sc.setShown(n2); sc.draw(); },150); });
const start=()=>{ runHero(); setScene('box','A model we can only talk to from outside.'); };
if(document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
