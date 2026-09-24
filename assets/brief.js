(function(){
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const DKEY='altyn_brief_v1';
  const MAXLEN=2000; // mirrors per-field cap on the server

  const LABELS={name:'Имя',contact:'Контакт',bizname:'Бизнес',socials:'Instagram / 2ГИС',activity:'Чем занимается',city:'Город',clients:'Клиенты',avgcheck:'Средний чек',diff:'Особенности',services:'Услуги / товары',top:'Продвигаем в первую очередь',faq:'Частые вопросы',sources:'Откуда клиенты',goals:'Цель сайта',examples:'Нравятся примеры',notneed:'Не нужно на сайте',has:'Есть из материалов',domain:'Домен',opts:'Доп. опции',terms:'Сроки'};
  const STEPS=[
    {n:1,t:'Знакомство',fields:['name','contact','bizname','socials']},
    {n:2,t:'О бизнесе',fields:['activity','city','clients','avgcheck','diff'],trust:true},
    {n:3,t:'Услуги',fields:['services','top','faq','sources'],trust:true},
    {n:4,t:'Пожелания к сайту',fields:['goals','examples','notneed','has','domain'],trust:true},
    {n:5,t:'Опции и голос',fields:['opts','terms'],trust:true,voice:true}
  ];
  const REQ={1:['name','contact'],2:['activity','city'],3:['services'],4:['goals'],5:[],6:[]};

  let cur=1, mode='full', trustAll=false, sending=false;
  let trusted={2:false,3:false,4:false,5:false};
  let chips={};
  let voices=[];

  /* ---------- значения ---------- */
  function collectVal(n){
    if(chips[n]&&chips[n].length) return chips[n].join(', ');
    const el=$('#briefForm [name="'+n+'"]');
    return el&&el.value?el.value.trim():'';
  }
  function missingIn(n){ return (REQ[n]||[]).filter(x=>!collectVal(x)); }
  function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  /* ---------- черновик ---------- */
  function snapshot(){
    const vals={};
    $$('#briefForm [name]').forEach(el=>{ if(el.type!=='checkbox') vals[el.name]=el.value; });
    return {mode,trustAll,trusted,chips,vals,ts:Date.now()};
  }
  function saveDraft(){ if(sending)return; try{localStorage.setItem(DKEY,JSON.stringify(snapshot()))}catch(e){} }
  function restore(){
    let d=null; try{d=JSON.parse(localStorage.getItem(DKEY))}catch(e){}
    if(!d) return;
    // Draft comes from storage: accept only known keys and primitive types
    mode=d.mode==='fast'?'fast':'full'; trustAll=d.trustAll===true;
    const t=d.trusted&&typeof d.trusted==='object'?d.trusted:{};
    Object.keys(trusted).forEach(k=>{ trusted[k]=t[k]===true; });
    const c=d.chips&&typeof d.chips==='object'?d.chips:{};
    Object.keys(chipBoxes).forEach(g=>{
      const allowed=[...chipBoxes[g].querySelectorAll('.chip')].map(b=>b.dataset.val);
      chips[g]=Array.isArray(c[g])?c[g].filter(x=>allowed.includes(x)):[];
      syncChips(g);
    });
    const v=d.vals&&typeof d.vals==='object'?d.vals:{};
    $$('#briefForm [name]').forEach(el=>{ if(typeof v[el.name]==='string') el.value=v[el.name].slice(0,MAXLEN); });
    $('#trustAll').checked=trustAll;
  }

  /* ---------- чипы ---------- */
  const chipBoxes={};
  function syncChips(g){
    const c=chipBoxes[g]; if(!c)return;
    c.querySelectorAll('.chip').forEach(b=>b.classList.toggle('on',chips[g].includes(b.dataset.val)));
  }
  $$('[data-chips]').forEach(c=>{
    const g=c.dataset.chips; chipBoxes[g]=c; chips[g]=chips[g]||[];
    c.addEventListener('click',e=>{
      const b=e.target.closest('.chip'); if(!b)return;
      const val=b.dataset.val;
      if(c.dataset.multi!=null){
        const i=chips[g].indexOf(val);
        i>=0?chips[g].splice(i,1):chips[g].push(val);
      }else{
        chips[g]=(chips[g][0]===val)?[]:[val];
      }
      syncChips(g); c.classList.remove('err'); saveDraft(); updateProgress();
    });
    syncChips(g);
  });

  /* ---------- режим ---------- */
  function setMode(m){
    mode=m;
    document.body.classList.toggle('fast',m==='fast');
    $('#modePill').textContent=m==='fast'?'⚡️ Быстро':'📋 Подробно';
    $$('.modecard').forEach(c=>c.classList.toggle('on',c.dataset.mode===m));
    saveDraft(); updateProgress();
  }
  $('#modePill').addEventListener('click',()=>setMode(mode==='fast'?'full':'fast'));
  $$('.modecard').forEach(c=>c.addEventListener('click',()=>setMode(c.dataset.mode)));

  /* ---------- доверие ---------- */
  $$('.tcbx').forEach(cb=>cb.addEventListener('change',()=>{
    const n=+cb.dataset.trust;
    if(trustAll&&!cb.checked){ cb.checked=true; return; }
    trusted[n]=cb.checked;
    cb.closest('.trustbtn').classList.toggle('on',cb.checked);
    $('#step'+n).classList.toggle('trusted',cb.checked);
    saveDraft(); updateProgress();
  }));
  $('#trustAll').addEventListener('change',e=>{
    trustAll=e.target.checked;
    $$('.tcbx').forEach(cb=>{
      const n=+cb.dataset.trust;
      cb.checked=trustAll;
      cb.closest('.trustbtn').classList.toggle('on',trustAll);
      trusted[n]=trustAll;
      $('#step'+n).classList.toggle('trusted',trustAll);
    });
    saveDraft(); updateProgress(); if(cur===6) renderSummary();
  });

  /* ---------- прогресс ---------- */
  function stepProgress(n){
    if(n===6) return cur>=6?1:0;
    if(trusted[n]) return 1;
    const r=REQ[n]||[]; if(!r.length) return cur>n?1:0; // optional-only step counts once passed
    return r.filter(x=>collectVal(x)).length/r.length;
  }
  function updateProgress(){
    let sum=0; for(let i=1;i<=6;i++) sum+=stepProgress(i);
    const pct=Math.round(sum/6*100);
    $('#pBar').style.width=pct+'%';
    $('#pPct').textContent=pct+'%';
    $('#pStep').textContent='Шаг '+cur+' из 6';
    $$('.dot').forEach(d=>{
      const n=+d.dataset.goto, ok=stepProgress(n)>=1;
      d.classList.toggle('cur',n===cur);
      d.classList.toggle('done',ok&&n!==cur);
      d.querySelector('.dn').textContent=(ok&&n!==cur)?'✓':String(n);
    });
  }

  /* ---------- навигация ---------- */
  function showWarn(t){const w=$('#warnbar');w.textContent=t;w.classList.add('show');}
  function hideWarn(){$('#warnbar').classList.remove('show');}
  function clearErr(){$$('.err').forEach(el=>el.classList.remove('err'));}
  function markErr(list){
    list.forEach(n=>{
      const c=chipBoxes[n];
      if(c){c.classList.add('err');return;}
      const i=$('#briefForm [name="'+n+'"]'); if(i)i.classList.add('err');
    });
  }
  function go(n){
    cur=n;
    $$('.step').forEach(s=>s.classList.toggle('active',+s.dataset.step===n));
    $('#btnBack').style.visibility=n===1?'hidden':'visible';
    $('#btnNext').textContent=n===6?'Отправить бриф 🚀':'Дальше →';
    hideWarn(); clearErr();
    if(n===6) renderSummary();
    updateProgress();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  document.addEventListener('click',e=>{ const g=e.target.closest('[data-goto]'); if(g)go(+g.dataset.goto); });
  $('#btnBack').addEventListener('click',()=>{ if(cur>1)go(cur-1); });
  $('#btnNext').addEventListener('click',()=>{
    if(cur<6){
      if(trusted[cur]){ go(cur+1); return; }
      const miss=missingIn(cur);
      if(miss.length){
        showWarn('Не заполнено: '+miss.map(m=>LABELS[m]).join(', ')+'. 🙂 Если не хочется — поставьте ✨ «Доверяю вам» в этом блоке, и я заполню сама.');
        markErr(miss); return;
      }
      go(cur+1);
    } else submitForm();
  });
  $('#briefForm').addEventListener('input',e=>{
    if(e.target.classList&&e.target.classList.contains('inp'))e.target.classList.remove('err');
    saveDraft(); updateProgress();
  });

  /* ---------- итог ---------- */
  function renderSummary(){
    const box=$('#summary'); box.innerHTML='';
    STEPS.forEach(st=>{
      const div=document.createElement('div'); div.className='sumstep';
      let inner='<div class="sumt"><span>'+st.t+'</span><button type="button" class="sedit" data-goto="'+st.n+'">изменить</button></div>';
      if(trusted[st.n]){
        inner+='<div class="sumtrust">✨ Доверено Альтын</div>';
        if(st.voice&&voices.length) inner+='<div class="sumrow"><span>Голосовые:</span> '+voices.length+' шт.</div>';
      }else{
        const rows=[];
        st.fields.forEach(f=>{ const v=collectVal(f); if(v) rows.push('<div class="sumrow"><span>'+LABELS[f]+':</span> '+escHtml(v)+'</div>'); });
        if(st.voice&&voices.length) rows.push('<div class="sumrow"><span>Голосовые:</span> '+voices.length+' шт.</div>');
        inner+=rows.length?rows.join(''):'<div class="sumrow empty">— пока пусто · можно доверить мне ✨</div>';
      }
      div.innerHTML=inner; box.appendChild(div);
    });
  }

  /* ---------- диктофон ---------- */
  const MAXMS=5*60*1000, MAXV=3;
  let mrec=null, mstream=null, mchunks=[], t0=0, mtick=null, isRec=false;
  function fmt(ms){ const s=Math.floor(ms/1000); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
  function vHint(t){ $('#voiceHint').textContent=t||''; }
  function setRecUI(on){
    isRec=on;
    $('#recBtn').classList.toggle('rec',on);
    $('#recIcMic').style.display=on?'none':'block';
    $('#recIcStop').style.display=on?'block':'none';
    $('#recTitle').textContent=on?'Записываю… нажмите кнопку, чтобы остановить':'Нажмите и расскажите о бизнесе';
    if(!on) $('#recTimer').textContent='0:00 · до 5 минут';
  }
  function renderVoices(){
    const box=$('#voices'); box.innerHTML='';
    voices.forEach((v,i)=>{
      const d=document.createElement('div'); d.className='vitem';
      d.innerHTML='<audio controls src="'+v.url+'"></audio><span class="vdur">'+fmt(v.dur)+'</span><button type="button" class="vdel" data-i="'+i+'" aria-label="Удалить">✕</button>';
      box.appendChild(d);
    });
  }
  $('#recBtn').addEventListener('click',async()=>{
    if(isRec){ if(mrec&&mrec.state!=='inactive')mrec.stop(); return; }
    if(voices.length>=MAXV){ vHint('Максимум '+MAXV+' записи — этого достаточно 🙂'); return; }
    if(!window.MediaRecorder||!navigator.mediaDevices){ vHint('Браузер не поддерживает запись — просто напишите текстом 🙂'); return; }
    try{ mstream=await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch(e){ vHint('Разрешите доступ к микрофону (значок замка в адресной строке) 🔒'); return; }
    let mime=''; ['audio/webm;codecs=opus','audio/webm','audio/mp4'].forEach(m=>{ if(!mime&&MediaRecorder.isTypeSupported(m))mime=m; });
    mchunks=[];
    mrec=new MediaRecorder(mstream,mime?{mimeType:mime}:undefined);
    mrec.ondataavailable=e=>{ if(e.data.size)mchunks.push(e.data); };
    mrec.onstop=()=>{
      clearInterval(mtick);
      if(mstream)mstream.getTracks().forEach(t=>t.stop());
      const dur=Math.min(MAXMS,Date.now()-t0);
      const blob=new Blob(mchunks,{type:mime||'audio/webm'});
      voices.push({blob,url:URL.createObjectURL(blob),dur});
      renderVoices(); setRecUI(false);
      vHint('Готово! Можно записать ещё (до '+MAXV+') — или отправляйте 🙂');
    };
    mrec.start(); t0=Date.now(); setRecUI(true);
    mtick=setInterval(()=>{ const ms=Date.now()-t0; $('#recTimer').textContent=fmt(ms)+' · до 5 минут'; if(ms>=MAXMS&&mrec.state!=='inactive')mrec.stop(); },250);
  });
  $('#voices').addEventListener('click',e=>{
    const b=e.target.closest('.vdel'); if(!b)return;
    const i=+b.dataset.i; URL.revokeObjectURL(voices[i].url); voices.splice(i,1); renderVoices();
  });

  /* ---------- отправка ---------- */
  async function submitForm(){
    if(sending)return;
    clearErr(); hideWarn();
    let missing=[];
    for(let n=1;n<=5;n++){ if(!trusted[n]) missing=missing.concat(missingIn(n)); }
    // Contact data can't be "trusted" to the studio — without it there is no lead
    const noContact=missingIn(1);
    if(noContact.length){ go(1); showWarn('Оставьте, пожалуйста, имя и контакт — иначе я не смогу ответить 🙂'); markErr(noContact); return; }
    if(missing.length&&!trustAll){
      showWarn('Не заполнено: '+missing.map(m=>LABELS[m]).join(', ')+'. 🙂 Поставьте галочку ✨ «Доверяю решение вам» — отправим как есть, остальное я решу сама. Либо вернитесь и допишите.');
      markErr(missing); return;
    }
    sending=true;
    const btn=$('#btnNext'); const old=btn.textContent; btn.textContent='Отправляю…'; btn.style.opacity=.7;
    try{
      const data={};
      Object.keys(LABELS).forEach(k=>{ const v=collectVal(k); if(v)data[k]=v; });
      const fd=new FormData();
      fd.append('payload',JSON.stringify({mode,trustAll,trusted,voicesCount:voices.length,hp:($('#hp')?$('#hp').value:''),data}));
      voices.forEach((v,i)=>fd.append('voice',v.blob,'voice_'+(i+1)+'.webm'));
      const r=await fetch('/api/submit',{method:'POST',body:fd});
      const j=await r.json().catch(()=>({}));
      if(!(r.ok&&j.ok)) throw new Error('bad');
      try{localStorage.removeItem(DKEY)}catch(e){}
      $('#formWrap').classList.add('hidden');
      $('#done').classList.remove('hidden');
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(e){
      showWarn('Не получилось отправить 😔 Проверьте интернет и попробуйте ещё раз. Если не выходит — напишите напрямую: @altynclick');
      btn.textContent=old; btn.style.opacity=1; sending=false;
    }
  }

  $('#btnAgain').addEventListener('click',()=>location.reload());

  /* ---------- старт ---------- */
  restore();
  $$('.tcbx').forEach(cb=>{
    const n=+cb.dataset.trust;
    cb.checked=!!trusted[n];
    cb.closest('.trustbtn').classList.toggle('on',!!trusted[n]);
    $('#step'+n).classList.toggle('trusted',!!trusted[n]);
  });
  setMode(mode);
  go(1);
})();
