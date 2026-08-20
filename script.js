/* PixelVerse — JavaScript recovered from the Kombai preview */

gsap.registerPlugin(ScrollTrigger);

/* ---------- pixel sprite helper ---------- */
function pxSVG(rows, pal, px){
  const w = rows[0].length, h = rows.length; let r = '';
  rows.forEach((row,y)=>[...row].forEach((c,x)=>{ if(pal[c]) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[c]}"/>`; }));
  return `<svg viewBox="0 0 ${w} ${h}" width="${w*px}" height="${h*px}" class="pix">${r}</svg>`;
}
const PAL = {k:'#0d1017',h:'#6b3f22',s:'#f2c79a',e:'#0d1017',c:'#e88d30',l:'#f7b45e',p:'#283a42',b:'#1c282e',g:'#4a6b46',w:'#eef1f5',m:'#d92bb4',n:'#ff6fdc',d:'#3a2a1e',y:'#f0d264',t:'#31454e'};

const CHAR = [
'....kkkk....',
'...khhhhk...',
'...khsshk...',
'...kseesk...',
'...ksssk....',
'..kcccck....',
'.ksccccsk...',
'.ksccccsk...',
'..kcccck....',
'..kppppk....',
'..kppppk....',
'..kpp..ppk..',
'..kpp..ppk..',
'..kbb..bbk..',
'..kkk..kkk..'];
const CHAR2 = ['............'].concat(CHAR.slice(0,14));
const COIN = ['..kkkk..','.kyyyyk.','kylllyk.','kyllwyk.','kyllwyk.','kylllyk.','.kyyyyk.','..kkkk..'];
const GEM  = ['..knnk..','.knmmnk.','knmmmmnk','kmmmmmmk','.kmmmmk.','..kmmk..','...kk...','........'];
const LANT = ['..kkk...','.kbbbk..','kblllbk.','kblylbk.','kblylbk.','kblllbk.','.kbbbk..','..kkk...'];
const SHIP = [
'......kk......',
'.....kwwk.....',
'....kwllwk....',
'...kwlmmlwk...',
'..kwllmmllwk..',
'.kwwllmmllwwk.',
'kwwlwwmmwwlwwk',
'kkwwlwwwwlwwkk',
'..kkwwllwwkk..',
'....kkllkk....',
'.....kllk.....',
'......kk......'];
const HOUSE = [
'.......kk.......',
'......kddk......',
'.....kdddk......',
'....kddddddk....',
'...kdddddddddk..',
'..kddddddddddddk',
'..ktttttttttttk.',
'..ktylytttylytk.',
'..ktylytttylytk.',
'..kttttttdttttk.',
'..kttttttdttttk.',
'..kgggggggggggk.',
'..kkkkkkkkkkkkk.',
'................'];
const sprite = (rows,px)=>pxSVG(rows,PAL,px);

document.getElementById('logoSprite').innerHTML = sprite(GEM,3);
document.getElementById('footSprite').innerHTML = sprite(GEM,3);
document.getElementById('heroChar').innerHTML = sprite(CHAR,6);
document.getElementById('ctaChar').innerHTML = sprite(CHAR,5);
document.getElementById('heroLantern').innerHTML = sprite(LANT,5);
document.getElementById('sprCoin').innerHTML = sprite(COIN,5);
['ghost1','ghost2','ghost3'].forEach((id,i)=>{ const el=document.getElementById(id); if(el) el.innerHTML=sprite(i%2?CHAR2:CHAR,3); });

/* ---------- hero: stars, clouds, motes, treeline ---------- */
let seed = 7;
const rnd = ()=> (seed = (seed*1103515245+12345)&0x7fffffff) / 0x7fffffff;

const stars = document.getElementById('stars');
let sHTML = '';
for(let i=0;i<22;i++){
  const sz = rnd()<0.3?3:2;
  sHTML += `<span class="star absolute bg-white" style="left:${(rnd()*100).toFixed(2)}%;top:${(rnd()*52).toFixed(2)}%;width:${sz}px;height:${sz}px;animation-delay:${(rnd()*2.4).toFixed(2)}s"></span>`;
}
stars.innerHTML = sHTML;

const CLOUD = ['....kkkkk.....','..kkwwwwwkk...','.kwwwwwwwwwk..','kwwwwwwwwwwwk.','.kkkkkkkkkkkk.'];
const clouds = document.getElementById('clouds');
clouds.innerHTML = [0,1,2].map(i=>
  `<div class="absolute opacity-${[70,50,85][i]}" style="top:${i*46}px;animation:pv-drift ${[70,95,120][i]}s steps(60,end) infinite;animation-delay:-${i*22}s">${pxSVG(CLOUD,PAL,[6,4,5][i])}</div>`
).join('');

const motes = document.getElementById('motes');
let mHTML='';
for(let i=0;i<10;i++){
  mHTML += `<span class="mote absolute" style="left:${(5+rnd()*90).toFixed(1)}%;bottom:${(rnd()*60).toFixed(0)}px;width:${rnd()<0.5?3:4}px;height:${rnd()<0.5?3:4}px;background:${rnd()<0.5?'#f7b45e':'#eef1f5'};animation-delay:-${(rnd()*6).toFixed(1)}s"></span>`;
}
motes.innerHTML = mHTML;

/* treeline: repeated pines on integer grid */
(function(){
  const pines = [];
  let x = 0;
  while(x < 340){
    const s = 1 + Math.floor(rnd()*2.2);
    const h = 14 + s*4, base = 60;
    pines.push(`<path fill="#2e4531" d="M${x+3*s} ${base}L${x+3*s} ${base-h}L${x+6*s} ${base}z"/>`);
    pines.push(`<rect fill="#20301f" x="${x+2.6*s}" y="${base-3}" width="${0.9*s}" height="3"/>`);
    x += 5 + rnd()*8;
  }
  document.getElementById('treeline').innerHTML =
    `<svg viewBox="0 0 340 60" preserveAspectRatio="none" class="pix h-[220px] w-full">
      <rect x="0" y="56" width="340" height="4" fill="#20301f"/>${pines.join('')}
     </svg>`;
})();

/* ---------- feature: mini canvas ---------- */
(function(){
  const HEART = [
'................',
'...kkk....kkk...',
'..kmmmk..kmmmk..',
'.kmnnnmkkmnnnmk.',
'.kmnnnnmmnnnnmk.',
'.kmnnnnnnnnnnmk.',
'..kmnnnnnnnnmk..',
'...kmnnnnnnmk...',
'....kmnnnnmk....',
'.....kmnnmk.....',
'......kmmk......',
'.......kk.......',
'................',
'....k...........',
'................',
'................'];
  const el = document.getElementById('miniCanvas');
  el.style.background = 'repeating-conic-gradient(#1a2136 0 25%, #222b45 0 50%) 0 0/16px 16px';
  el.innerHTML = pxSVG(HEART,PAL,9);
  el.firstChild.style.position='relative';
})();

/* ---------- reference before/after scenes ---------- */
function sceneRows(w,h,coarse){
  const rows=[];
  for(let y=0;y<h;y++){
    let row='';
    for(let x=0;x<w;x++){
      const hill = Math.round(h*0.62 + Math.sin(x/(coarse?2.2:6))*(h*0.08) + Math.sin(x/(coarse?4:11))*(h*0.12));
      let c;
      if(y>hill+2) c='g';
      else if(y>hill) c='t';
      else {
      const dSun = Math.hypot((x-w*0.72)/w,(y-h*0.28)/h);
        c = dSun < 0.13 ? 'l' : (y<h*0.35?'p':'b');
      }
      row+=c;
    }
    rows.push(row);
  }
  return rows;
}
(function(){
  const fine = sceneRows(56,28,false), coarse = sceneRows(18,9,true);
  document.getElementById('refFine').innerHTML = `<div style="width:100%;height:100%">${pxSVG(fine,PAL,1).replace('width="56" height="28"','width="100%" height="100%" preserveAspectRatio="none"')}</div>`;
  document.getElementById('refCoarse').innerHTML = `<div style="width:100%;height:100%">${pxSVG(coarse,PAL,1).replace('width="18" height="9"','width="100%" height="100%" preserveAspectRatio="none"')}</div>`;
})();

/* ---------- filmstrip ---------- */
(function(){
  const strip = document.getElementById('filmstrip');
  const frames = [CHAR, CHAR2, CHAR, CHAR2];
  strip.innerHTML = frames.map((f,i)=>
    `<div class="fframe relative border-2 border-[#2a1030] bg-[#150a1b] p-2" data-i="${i}">
       ${pxSVG(f,PAL,4)}
       <span class="pv-hud absolute bottom-0.5 right-1 text-[7px] text-[#6d5a75]">${i+1}</span>
     </div>`).join('');
  const els = strip.querySelectorAll('.fframe');
  let i=0;
  setInterval(()=>{
    els.forEach(e=>{e.style.borderColor='#2a1030'; e.style.background='#150a1b';});
    els[i].style.borderColor = '#ff6fdc'; els[i].style.background='#26112e';
    i=(i+1)%els.length;
  },320);
})();

/* ---------- hotbar slots ---------- */
(function(){
  const slots = [
    {n:'CREATE', s:COIN, d:'Open a blank canvas and place your first pixels.'},
    {n:'EDIT', s:GEM, d:'Refine shapes, shading and palettes pixel by pixel.'},
    {n:'ANIMATE', s:SHIP, d:'Chain frames together until the sprite moves.'},
    {n:'SHARE', s:HOUSE, d:'Publish your work into the PixelVerse square.'}
  ];
  document.getElementById('hotbar').innerHTML = slots.map((s,i)=>`
    <div class="slot relative border-2 border-[var(--pv-ink)] bg-[var(--pv-sky)] p-5 shadow-[6px_6px_0_var(--pv-ink)]" style="box-shadow:inset 0 0 0 2px #35434b, 6px 6px 0 var(--pv-ink)">
      <div class="slotFill pointer-events-none absolute inset-x-0 bottom-0 bg-[var(--pv-sun)]/18" style="height:0%"></div>
      <div class="relative">
        <div class="flex items-center justify-between">
          <span class="pv-hud text-[8px] text-[var(--pv-muted)]">SLOT ${i+1}</span>
          <span class="pv-hud slotBadge text-[8px] text-[var(--pv-muted)]">·</span>
        </div>
        <div class="mt-4 grid h-[68px] place-items-center">${pxSVG(s.s,PAL,s.s===HOUSE||s.s===SHIP?4:7)}</div>
        <h3 class="pv-h mt-4 text-[22px] font-bold">${s.n}</h3>
        <p class="mt-2 text-[14px] leading-relaxed text-[var(--pv-muted)]">${s.d}</p>
      </div>
    </div>`).join('');
})();

/* ---------- showcase polaroids ---------- */
(function(){
  const arts = [
    {rows:sceneRows(40,26,false), px:6, cap:'dusk at ridge camp', by:'moss_knight'},
    {rows:SHIP, px:11, cap:'built this ship in 2h', by:'vector_hare'},
    {rows:HOUSE, px:11, cap:'my little pixel bakery', by:'sunnybit'},
    {rows:CHAR, px:12, cap:'idle cycle, take 14', by:'frame_by_frame'},
    {rows:GEM, px:18, cap:'loot drop study', by:'oreo.px'},
    {rows:sceneRows(34,22,true), px:8, cap:'coarse ref test', by:'lowres_lily'}
  ];
  const rots = [-3,2,-1.5,3,-2.5,1.5];
  const strip = document.getElementById('strip');
  let html = '';
  arts.forEach((a,i)=>{
    html += `<figure class="shrink-0 bg-[#e8e4dc] p-3 pb-14 border-2 border-[var(--pv-ink)] shadow-[8px_8px_0_var(--pv-ink)]" style="transform:rotate(${rots[i]}deg)">
      <div class="relative border-2 border-[var(--pv-ink)] bg-[var(--pv-sky)] grid place-items-center" style="width:270px;height:250px">${pxSVG(a.rows,PAL,a.px)}</div>
      <figcaption class="mt-3 w-[270px]">
        <p class="pv-h text-[17px] italic text-[#20242c]">"${a.cap}"</p>
        <span class="mt-2 inline-flex items-center gap-2 border-2 border-[var(--pv-ink)] bg-[#d6d1c6] px-2 py-1">
          ${pxSVG(GEM,PAL,2)}<span class="pv-hud text-[7px] text-[#20242c]">${a.by}</span>
        </span>
      </figcaption>
    </figure>`;
    if(i===2){
      html += `<div class="shrink-0 px-6" style="width:520px">
        <p class="pv-h text-[54px] font-bold leading-[1.02] text-[var(--pv-text)]" style="text-shadow:5px 5px 0 #0d1017">Your canvas.<br>Your pixels.<br>Your world.</p>
        <span class="pv-hud mt-6 inline-block bg-[var(--pv-sun)] px-3 py-2 text-[9px] tracking-widest text-[var(--pv-ink)]">GALLERY 06 / 06</span>
      </div>`;
    }
  });
  strip.innerHTML = html;
})();

/* ---------- community wall ---------- */
(function(){
  const names=['pixel_otter','bytebard','moss_knight','sunnybit','oreo.px','lowres_lily','vector_hare','tinyforge','glitchgoat','cobaltcub','dither_dan','emberfox','nokia_nel','quartzqueen','runeroot','sprite_sam','umberowl','vividvole','wispwren','zenzebra','8bitbee','crayoncrow','pxl_pilot','mossmimic'];
  const cols=['#e88d30','#4a6b46','#d92bb4','#f7b45e','#31454e','#eef1f5'];
  let html='';
  names.forEach((n,i)=>{
    // sparse symmetric 8x8 creature sprite, 2 colours + outline
    const body = cols[i % cols.length];
    const trim = cols[(i*3+2) % cols.length];
    const g=[];
    for(let y=0;y<8;y++){
      const half=[];
      for(let x=0;x<4;x++){
        const inside = y>0 && y<7 && !(x===0 && (y<2||y>5));
        half.push(inside && rnd()<0.62 ? (rnd()<0.28?trim:body) : null);
      }
      g.push(half.concat(half.slice().reverse()));
    }
    // eyes
    g[2][2]='#0d1017'; g[2][5]='#0d1017';
    let rects='';
    g.forEach((row,y)=>row.forEach((c,x)=>{ if(c) rects+=`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; }));
    const micro=`<svg viewBox="0 0 8 8" class="pix h-full w-full">${rects}</svg>`;
    const accent = (i===3||i===11||i===18);
    const tall = i%5===0;
    html += `<div class="cmc break-inside-avoid border-2 border-[var(--pv-ink)] ${accent?'bg-[var(--pv-sun)]':'bg-[var(--pv-stone)]'} p-2.5 shadow-[4px_4px_0_var(--pv-ink)]">
      <div class="flex items-center gap-2">
        <span class="shrink-0">${pxSVG(rnd()<0.5?COIN:GEM,PAL,2)}</span>
        <span class="pv-hud truncate text-[7px] ${accent?'text-[var(--pv-ink)]':'text-[var(--pv-text)]'}">${n}</span>
      </div>
      <div class="mt-2 aspect-square border-2 border-[var(--pv-ink)] bg-[var(--pv-sky)] p-1.5">${micro}</div>
      ${tall?`<p class="pv-hud mt-2 text-[7px] ${accent?'text-[var(--pv-ink)]':'text-[var(--pv-muted)]'}">${Math.floor(rnd()*90)+10} LIKES</p>`:''}
    </div>`;
  });
  document.getElementById('wall').innerHTML = html;
})();

/* ---------- studio timeline ruler / tracks ---------- */
(function(){
  const ruler=document.getElementById('ruler'); let r='';
  for(let i=0;i<32;i++){ r+=`<div class="flex-1 border-l border-[#2a1030]" style="height:${i%4===0?'100%':'45%'}">${i%4===0?`<span class="pv-hud ml-1 text-[6px] text-[#6d5a75]">${i}</span>`:''}</div>`; }
  ruler.innerHTML=r;
  const tracks=document.getElementById('tracks'); let t='';
  const keys=[[1,5,9,13,21],[2,8,16],[4,12,20,28],[0,16]];
  keys.forEach((row,ri)=>{
    let k='';
    row.forEach(f=>{ k+=`<span class="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2" style="background:${ri===0?'#ff6fdc':'#7c3d7a'};left:${(f/32*100).toFixed(2)}%;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)"></span>`; });
    t+=`<div class="relative h-[42px] border-b border-[#1c0f22] ${ri===0?'bg-[#160a1c]':''}">${k}</div>`;
  });
  tracks.innerHTML=t;
})();

/* ---------- footer jagged terrain ---------- */
(function(){
  let x=0, d='M0 20 ';
  const pts=[];
  while(x<320){ const h = 4 + Math.floor(rnd()*9); pts.push([x,h]); x += 6 + Math.floor(rnd()*10); }
  let path='M0 20 ';
  pts.forEach(([px,h],i)=>{
    const nx = i+1<pts.length ? pts[i+1][0] : 320;
    path += `L${px} ${20-h} L${nx} ${20-h} `;
  });
  path += 'L320 20 Z';
  document.getElementById('footTerrain').innerHTML =
    `<svg viewBox="0 0 320 20" preserveAspectRatio="none" class="pix h-full w-full"><path fill="var(--pv-stone-dk)" d="${path}"/></svg>`;
})();

/* ---------- social row ---------- */
document.getElementById('social').innerHTML = ['ti-brand-x','ti-brand-discord','ti-brand-github','ti-brand-instagram']
  .map(ic=>`<a href="#" class="grid h-10 w-10 place-items-center border-2 border-[var(--pv-ink)] bg-[var(--pv-stone)] text-[18px] text-[var(--pv-text)] shadow-[3px_3px_0_var(--pv-ink)] hover:bg-[var(--pv-sun)] hover:text-[var(--pv-ink)]"><i class="ti ${ic}"></i></a>`).join('');

/* ---------- scroll setup ---------- */
const loco = new LocomotiveScroll();
gsap.ticker.add(()=>ScrollTrigger.update());

/* feature rungs slide-in */
document.querySelectorAll('.rung').forEach(el=>{
  gsap.from(el,{ autoAlpha:0, xPercent: el.dataset.side==='left'? -14 : 14, duration:0.6, ease:'power3.out',
    scrollTrigger:{ trigger:el, start:'top 82%' }});
});

/* hotbar scrub fill */
document.querySelectorAll('#hotbar .slot').forEach((slot,i)=>{
  const fill = slot.querySelector('.slotFill');
  const badge = slot.querySelector('.slotBadge');
  gsap.to(fill,{ height:'100%', ease:'none',
    scrollTrigger:{ trigger:'#hotbar', start:'top 80%', end:'bottom 40%', scrub:true,
      onUpdate:self=>{
        const on = self.progress > (i/4)*0.9 + 0.05;
        slot.style.outline = on ? '3px solid #f7b45e' : 'none';
        slot.style.outlineOffset = '4px';
        if(badge){ badge.textContent = on?'EQUIPPED':'·'; badge.style.color = on?'#f7b45e':'#93a0ad'; }
      }
    }
  });
});

/* showcase horizontal */
const strip = document.getElementById('strip');
gsap.to(strip,{ x: ()=> -(strip.scrollWidth - window.innerWidth + 60), ease:'none',
  scrollTrigger:{ trigger:'#showcase', start:'top top', end:()=>'+='+(strip.scrollWidth), pin:true, scrub:0.6, invalidateOnRefresh:true }});

/* studio crack */
gsap.timeline({ scrollTrigger:{ trigger:'#studio', start:'top bottom', end:'center center', scrub:0.5 }})
  .to('#crackTop',{ yPercent:-58, ease:'none' },0)
  .to('#crackBottom',{ yPercent:62, ease:'none' },0)
  .from('#studioUI',{ yPercent:12, autoAlpha:0.2, ease:'none' },0);

gsap.from('#studioCopy',{ autoAlpha:0, y:30, duration:0.7, ease:'power2.out',
  scrollTrigger:{ trigger:'#studio', start:'top 50%' }});

ScrollTrigger.refresh();
