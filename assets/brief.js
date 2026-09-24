(function(){
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

  // Bump SCHEMA whenever fields or chip values change: older drafts are then discarded
  // instead of being restored over the new form.
  const SCHEMA=2;
  const DKEY='altyn_brief_v'+SCHEMA;
  const OLD_KEYS=['altyn_brief_v1'];
  const DRAFT_TTL=30*24*3600*1000;
  const MAXLEN=2000; // mirrors per-field cap on the server
  const TS_SITEKEY='0x4AAAAAAFCRN5gWSlHIgCa8';
  const OTHER='__other';

  const LABELS={
    name:'Имя',contact:'Контакт',niche:'Сфера',hassite:'Сайт сейчас',socials:'Instagram / 2ГИС',siteurl:'Текущий сайт',siteissues:'Не устраивает в сайте',
    activity:'Чем занимается',city:'Город',format:'Формат работы',services:'Услуги / товары',top:'Главные услуги',avgcheck:'Чек',
    who:'Кто обращается',situation:'С чем приходят',why:'Почему выбирают',thanks:'За что благодарят',doubts:'Что смущает',faq:'Вопросы перед покупкой',rivals:'Сравнивают с',
    proof:'Доказательства',numbers:'Цифры и условия',has:'Материалы',
    action:'Главное действие',booking:'Сервис записи',leadto:'Куда слать заявки',lang:'Языки',kztext:'Тексты на казахском',sources:'Откуда клиенты',examples:'Нравятся сайты',notneed:'Не нужно на сайте',extras:'Может понадобиться',terms:'Сроки'
  };
  const STEPS=[
    {n:1,t:'Знакомство',fields:['name','contact','niche','hassite','socials','siteurl','siteissues']},
    {n:2,t:'Бизнес и услуги',fields:['activity','city','format','services','top','avgcheck'],voice:true},
    {n:3,t:'Клиенты',fields:['who','situation','why','thanks','doubts','faq','rivals'],trust:true},
    {n:4,t:'Доверие',fields:['proof','numbers','has'],trust:true},
    {n:5,t:'Сайт и заявки',fields:['action','booking','leadto','lang','kztext','sources','examples','notneed','extras','terms'],trust:true}
  ];
  const REQ={1:['name','contact'],2:['activity','city','services'],3:['who','why'],4:['proof'],5:['action','lang'],6:[]};
  const VOICE_COVERS=['activity','services']; // a voice note may replace these answers
  const SOLO=/^(Не знаю|Пока нечем|Ничего)/;   // exclusive chips reset the rest of a multi group

  let cur=1, mode='full', trustAll=false, sending=false;
  const trusted={3:false,4:false,5:false};
  const chips={}, chipBoxes={}, otherInputs={};
  let voices=[];

  /* ---------- icons & messages ---------- */
  function icon(id,cls){ return '<svg class="'+(cls||'ic')+'"><use href="#i-'+id+'"/></svg>'; }
  function showWarn(t){ const w=$('#warnbar'); w.innerHTML=icon('alert'); const s=document.createElement('span'); s.textContent=t; w.appendChild(s); w.classList.add('show'); }
  function hideWarn(){ $('#warnbar').classList.remove('show'); }
  function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  /* ---------- visibility ---------- */
  function fieldNode(n){ return chipBoxes[n]||$('#briefForm [name="'+n+'"]'); }
  function condOff(n){ const el=fieldNode(n); return !!(el&&el.closest('[data-cond-off]')); }
  function fastHidden(n){ const el=fieldNode(n); return mode==='fast'&&!!(el&&el.closest('.dhide')); }

  function applyConds(){
    $$('[data-if]').forEach(el=>{
      const [g,vals]=el.dataset.if.split('=');
      const on=(chips[g]||[]).some(v=>vals.split('|').includes(v));
      el.toggleAttribute('data-cond-off',!on);
    });
  }

  /* ---------- values ---------- */
  function collectVal(n){
    if(condOff(n)) return '';
    if(chipBoxes[n]){
      const vals=chips[n].filter(v=>v!==OTHER);
      if(chips[n].includes(OTHER)&&otherInputs[n]){ const o=otherInputs[n].value.trim(); if(o) vals.push(o); }
      return vals.join(', ');
    }
    const el=$('#briefForm [name="'+n+'"]');
    return el&&el.value?el.value.trim():'';
  }
  function activeReq(n){
    return (REQ[n]||[]).filter(x=>!condOff(x)&&!fastHidden(x)&&!(voices.length&&VOICE_COVERS.includes(x)));
  }
  function missingIn(n){ return activeReq(n).filter(x=>!collectVal(x)); }

  /* ---------- chips ---------- */
  function syncChips(g){
    const c=chipBoxes[g];
    c.querySelectorAll('.chip').forEach(b=>{
      const on=chips[g].includes(b.dataset.val);
      b.classList.toggle('on',on); b.setAttribute('aria-pressed',on?'true':'false');
    });
    if(otherInputs[g]) otherInputs[g].hidden=!chips[g].includes(OTHER);
  }
  $$('[data-chips]').forEach(c=>{
    const g=c.dataset.chips; chipBoxes[g]=c; chips[g]=[];
    // "Own option" chip + text input are generated for groups with data-other
    if(c.dataset.other!=null){
      const b=document.createElement('button');
      b.type='button'; b.className='chip other'; b.dataset.val=OTHER;
      b.innerHTML=icon('plus')+'<span>Свой вариант</span>';
      c.appendChild(b);
      const i=document.createElement('input');
      i.className='inp otherinp'; i.name=g+'_other'; i.maxLength=200; i.hidden=true;
      i.placeholder=c.dataset.other||'Ваш вариант';
      i.setAttribute('aria-label','Свой вариант');
      c.after(i); otherInputs[g]=i;
    }
    c.addEventListener('click',e=>{
      const b=e.target.closest('.chip'); if(!b)return;
      const val=b.dataset.val, list=chips[g];
      if(c.dataset.multi!=null){
        const i=list.indexOf(val);
        if(i>=0) list.splice(i,1);
        else if(SOLO.test(val)) list.splice(0,list.length,val);
        else { const s=list.findIndex(v=>SOLO.test(v)); if(s>=0)list.splice(s,1); list.push(val); }
      }else{
        chips[g]=(list[0]===val)?[]:[val];
      }
      syncChips(g); c.classList.remove('err');
      if(val===OTHER&&chips[g].includes(OTHER)) otherInputs[g].focus();
      applyConds(); saveDraft(); updateProgress();
    });
  });

  /* ---------- draft ---------- */
  function snapshot(){
    const vals={};
    $$('#briefForm [name]').forEach(el=>{ if(el.type!=='checkbox'&&el.name!=='website') vals[el.name]=el.value; });
    return {v:SCHEMA,ts:Date.now(),mode,trustAll,trusted,chips,vals};
  }
  function saveDraft(){ if(sending)return; try{localStorage.setItem(DKEY,JSON.stringify(snapshot()))}catch(e){} }
  function clearDraft(){ try{localStorage.removeItem(DKEY)}catch(e){} }
  function restore(){
    try{ OLD_KEYS.forEach(k=>localStorage.removeItem(k)); }catch(e){}
    let d=null; try{d=JSON.parse(localStorage.getItem(DKEY))}catch(e){}
    if(!d||typeof d!=='object') return;
    // Drafts from another form version or too old are dropped, never merged
    if(d.v!==SCHEMA||typeof d.ts!=='number'||Date.now()-d.ts>DRAFT_TTL){ clearDraft(); return; }
    mode=d.mode==='fast'?'fast':'full'; trustAll=d.trustAll===true;
    const t=d.trusted&&typeof d.trusted==='object'?d.trusted:{};
    Object.keys(trusted).forEach(k=>{ trusted[k]=t[k]===true; });
    const c=d.chips&&typeof d.chips==='object'?d.chips:{};
    Object.keys(chipBoxes).forEach(g=>{
      const allowed=[...chipBoxes[g].querySelectorAll('.chip')].map(b=>b.dataset.val);
      chips[g]=Array.isArray(c[g])?c[g].filter(x=>allowed.includes(x)):[];
      if(!chipBoxes[g].hasAttribute('data-multi')) chips[g]=chips[g].slice(0,1);
    });
    const v=d.vals&&typeof d.vals==='object'?d.vals:{};
    $$('#briefForm [name]').forEach(el=>{ if(el.name!=='website'&&typeof v[el.name]==='string') el.value=v[el.name].slice(0,MAXLEN); });
    $('#trustAll').checked=trustAll;
  }

  /* ---------- mode ---------- */
  function setMode(m){
    mode=m;
    document.body.classList.toggle('fast',m==='fast');
    $('#modePill').innerHTML=icon(m==='fast'?'bolt':'list')+'<span>'+(m==='fast'?'Быстро':'Подробно')+'</span>';
    $$('.modecard').forEach(c=>c.classList.toggle('on',c.dataset.mode===m));
    saveDraft(); updateProgress();
  }
  $('#modePill').addEventListener('click',()=>setMode(mode==='fast'?'full':'fast'));
  $$('.modecard').forEach(c=>c.addEventListener('click',()=>setMode(c.dataset.mode)));

  /* ---------- trust ---------- */
  function setTrusted(n,on){
    trusted[n]=on;
    const cb=$('.tcbx[data-trust="'+n+'"]'); cb.checked=on;
    cb.closest('.trustbtn').classList.toggle('on',on);
    $('#step'+n).classList.toggle('trusted',on);
  }
  $$('.tcbx').forEach(cb=>cb.addEventListener('change',()=>{
    const n=+cb.dataset.trust;
    if(trustAll&&!cb.checked){ cb.checked=true; return; }
    setTrusted(n,cb.checked); saveDraft(); updateProgress();
  }));
  $('#trustAll').addEventListener('change',e=>{
    trustAll=e.target.checked;
    Object.keys(trusted).forEach(n=>setTrusted(+n,trustAll));
    saveDraft(); updateProgress(); if(cur===6) renderSummary();
  });

  /* ---------- progress ---------- */
  function stepProgress(n){
    if(n===6) return cur>=6?1:0;
    if(trusted[n]) return 1;
    const r=activeReq(n); if(!r.length) return cur>n?1:0;
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
      d.querySelector('.dn').innerHTML=(ok&&n!==cur)?icon('check'):String(n);
    });
  }

  /* ---------- navigation ---------- */
  function clearErr(){ $$('.err').forEach(el=>el.classList.remove('err')); }
  function markErr(list){
    list.forEach(n=>{ const el=fieldNode(n); if(el) el.classList.add('err'); });
    const first=fieldNode(list[0]); if(first&&first.scrollIntoView) first.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function labelsOf(list){ return list.map(m=>LABELS[m]).join(', '); }
  function go(n){
    cur=n;
    $$('.step').forEach(s=>s.classList.toggle('active',+s.dataset.step===n));
    $('#btnBack').style.visibility=n===1?'hidden':'visible';
    $('#btnNextText').textContent=n===6?'Отправить бриф':'Дальше';
    $('#btnNextIc').innerHTML='<use href="#i-'+(n===6?'send':'right')+'"/>';
    hideWarn(); clearErr();
    if(n===6){ renderSummary(); tsRender(); }
    updateProgress();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  document.addEventListener('click',e=>{ const g=e.target.closest('[data-goto]'); if(g)go(+g.dataset.goto); });
  $('#btnBack').addEventListener('click',()=>{ if(cur>1)go(cur-1); });
  $('#btnNext').addEventListener('click',()=>{
    if(cur===6) return submitForm();
    if(trusted[cur]) return go(cur+1);
    const miss=missingIn(cur);
    if(miss.length){
      const tip=REQ[cur]&&[3,4,5].includes(cur)
        ?' Если не хочется — нажмите «Доверяю вам» вверху блока, и я продумаю сама.'
        :(cur===2?' Можно вместо этого записать голосовое.':'');
      showWarn('Не заполнено: '+labelsOf(miss)+'.'+tip);
      markErr(miss); return;
    }
    go(cur+1);
  });
  $('#briefForm').addEventListener('input',e=>{
    const t=e.target;
    if(t.classList&&t.classList.contains('inp')){
      t.classList.remove('err');
      if(t.classList.contains('otherinp')) t.previousElementSibling.classList.remove('err');
    }
    saveDraft(); updateProgress();
  });

  /* ---------- summary ---------- */
  function renderSummary(){
    const box=$('#summary'); box.innerHTML='';
    STEPS.forEach(st=>{
      const div=document.createElement('div'); div.className='sumstep';
      let inner='<div class="sumt"><span>'+st.t+'</span><button type="button" class="sedit" data-goto="'+st.n+'">изменить</button></div>';
      const vRow=(st.voice&&voices.length)?'<div class="sumrow"><span>Голосовые:</span> '+voices.length+' шт.</div>':'';
      if(trusted[st.n]){
        inner+='<div class="sumtrust">'+icon('spark')+' Доверено Altyn Click</div>'+vRow;
      }else{
        const rows=[];
        st.fields.forEach(f=>{ const v=collectVal(f); if(v) rows.push('<div class="sumrow"><span>'+LABELS[f]+':</span> '+escHtml(v)+'</div>'); });
        inner+=(rows.length||vRow)?rows.join('')+vRow:'<div class="sumrow empty">— пока пусто</div>';
      }
      div.innerHTML=inner; box.appendChild(div);
    });
  }

  /* ---------- voice recorder ---------- */
  const MAXMS=5*60*1000, MAXV=3;
  let mrec=null, mstream=null, mchunks=[], t0=0, mtick=null, isRec=false;
  function fmt(ms){ const s=Math.floor(ms/1000); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
  function vHint(t){ $('#voiceHint').textContent=t||''; }
  function setRecUI(on){
    isRec=on;
    $('#recBtn').classList.toggle('rec',on);
    $('#recIcMic').style.display=on?'none':'block';
    $('#recIcStop').style.display=on?'block':'none';
    $('#recTitle').textContent=on?'Записываю… нажмите, чтобы остановить':'Удобнее голосом? Нажмите и расскажите';
    if(!on) $('#recTimer').textContent='0:00 · до 5 минут';
  }
  function renderVoices(){
    const box=$('#voices'); box.innerHTML='';
    voices.forEach((v,i)=>{
      const d=document.createElement('div'); d.className='vitem';
      d.innerHTML='<audio controls src="'+v.url+'"></audio><span class="vdur">'+fmt(v.dur)+'</span><button type="button" class="vdel" data-i="'+i+'" aria-label="Удалить запись">'+icon('x')+'</button>';
      box.appendChild(d);
    });
    updateProgress();
  }
  $('#recBtn').addEventListener('click',async()=>{
    if(isRec){ if(mrec&&mrec.state!=='inactive')mrec.stop(); return; }
    if(voices.length>=MAXV){ vHint('Максимум '+MAXV+' записи — этого достаточно.'); return; }
    if(!window.MediaRecorder||!navigator.mediaDevices){ vHint('Браузер не поддерживает запись — напишите текстом.'); return; }
    try{ mstream=await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch(e){ vHint('Разрешите доступ к микрофону (значок замка в адресной строке).'); return; }
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
      renderVoices(); setRecUI(false); clearErr(); hideWarn();
      vHint('Готово! Можно записать ещё (до '+MAXV+').');
    };
    mrec.start(); t0=Date.now(); setRecUI(true);
    mtick=setInterval(()=>{ const ms=Date.now()-t0; $('#recTimer').textContent=fmt(ms)+' · до 5 минут'; if(ms>=MAXMS&&mrec.state!=='inactive')mrec.stop(); },250);
  });
  $('#voices').addEventListener('click',e=>{
    const b=e.target.closest('.vdel'); if(!b)return;
    const i=+b.dataset.i; URL.revokeObjectURL(voices[i].url); voices.splice(i,1); renderVoices();
  });

  /* ---------- Turnstile (bot check) ---------- */
  let tsId=null, tsToken='', tsWaiter=null;
  const tsReady=()=>!!(window.turnstile&&typeof window.turnstile.render==='function');
  function tsDeliver(t){ if(tsWaiter){ const w=tsWaiter; tsWaiter=null; w(t); } }
  function tsRender(){
    if(tsId!==null||!tsReady()) return;
    tsId=window.turnstile.render('#tsBox',{
      sitekey:TS_SITEKEY, appearance:'interaction-only', execution:'execute', language:'ru',
      callback:t=>{ tsToken=t; tsDeliver(t); },
      'expired-callback':()=>{ tsToken=''; },
      'error-callback':()=>{ tsToken=''; tsDeliver(''); return true; }
    });
  }
  // Resolves with a fresh token, or '' if the widget can't load or the check fails
  function getToken(){
    return new Promise(res=>{
      const start=Date.now();
      (function wait(){
        if(!tsReady()){ return Date.now()-start>10000?res(''):setTimeout(wait,200); }
        tsRender();
        if(tsToken) return res(tsToken);
        tsWaiter=res;
        try{ window.turnstile.execute(tsId); }catch(e){}
        setTimeout(()=>{ if(tsWaiter===res) tsDeliver(''); },45000);
      })();
    });
  }
  function tsReset(){ tsToken=''; try{ if(tsId!==null) window.turnstile.reset(tsId); }catch(e){} }

  /* ---------- submit ---------- */
  async function submitForm(){
    if(sending)return;
    clearErr(); hideWarn();
    // Name, contact and the business itself can never be "trusted" away
    for(const n of [1,2]){
      const m=missingIn(n);
      if(m.length){ go(n); showWarn('Не заполнено: '+labelsOf(m)+'. Без этого я не смогу подготовить предложение.'); markErr(m); return; }
    }
    let missing=[];
    [3,4,5].forEach(n=>{ if(!trusted[n]) missing=missing.concat(missingIn(n)); });
    if(missing.length&&!trustAll){
      showWarn('Не заполнено: '+labelsOf(missing)+'. Отметьте «Доверяю остальное вам» — отправим как есть, или вернитесь и допишите.');
      return;
    }
    sending=true;
    const btn=$('#btnNext'), txt=$('#btnNextText');
    txt.textContent='Отправляю…'; btn.style.opacity=.7; btn.disabled=true;
    const fail=msg=>{ showWarn(msg); txt.textContent='Отправить бриф'; btn.style.opacity=1; btn.disabled=false; sending=false; };
    try{
      const token=await getToken();
      if(!token) return fail('Не удалось пройти проверку от спама. Обновите страницу и попробуйте ещё раз — или напишите напрямую: @altynclick');
      const data={};
      Object.keys(LABELS).forEach(k=>{ const v=collectVal(k); if(v)data[k]=v; });
      const fd=new FormData();
      fd.append('payload',JSON.stringify({mode,trustAll,trusted,hp:($('#hp')?$('#hp').value:''),data}));
      fd.append('cf-turnstile-response',token);
      voices.forEach((v,i)=>fd.append('voice',v.blob,'voice_'+(i+1)+'.webm'));
      const r=await fetch('/api/submit',{method:'POST',body:fd});
      const j=await r.json().catch(()=>({}));
      tsReset();
      if(!(r.ok&&j.ok)) throw new Error(j.error||'bad');
      clearDraft();
      $('#formWrap').classList.add('hidden');
      $('#done').classList.remove('hidden');
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(e){
      tsReset();
      fail(e.message==='captcha'
        ?'Проверка от спама не прошла. Попробуйте ещё раз или напишите напрямую: @altynclick'
        :'Не получилось отправить. Проверьте интернет и попробуйте ещё раз. Если не выходит — напишите напрямую: @altynclick');
    }
  }

  $('#btnAgain').addEventListener('click',()=>location.reload());

  /* ---------- start ---------- */
  restore();
  Object.keys(chipBoxes).forEach(syncChips);
  Object.keys(trusted).forEach(n=>setTrusted(+n,trusted[n]));
  applyConds();
  setMode(mode);
  go(1);
})();
