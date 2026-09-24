(function(){
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

  // Bump SCHEMA whenever fields or chip values change: older drafts are then discarded
  // instead of being restored over the new form.
  const SCHEMA=3;
  const DKEY='altyn_brief_v'+SCHEMA;
  const OLD_KEYS=['altyn_brief_v1','altyn_brief_v2'];
  const DRAFT_TTL=30*24*3600*1000;
  const MAXLEN=2000; // mirrors per-field cap on the server
  const TS_SITEKEY='0x4AAAAAAFCRN5gWSlHIgCa8';
  const OTHER='__other';

  const LABELS={
    name:'Имя',contact:'Контакт',niche:'Сфера',hassite:'Сайт сейчас',socials:'Instagram / 2ГИС',siteurl:'Текущий сайт',siteissues:'Не устраивает в сайте',
    activity:'Чем занимается',city:'Город',format:'Формат работы',services:'Услуги / товары',top:'Главные услуги',avgcheck:'Чек',
    who:'Кто обращается',decider:'Кто принимает решение',situation:'С чем приходят',important:'Важно при выборе',why:'Почему выбирают',whyfact:'Конкретный пример',thanks:'За что благодарят и рекомендуют',
    doubts:'Что смущает',faq:'Вопросы перед покупкой',refuse:'Почему не покупают',rivals:'Сравнивают с',
    proof:'Доказательства',numbers:'Цифры и условия',has:'Материалы',
    action:'Главное действие',leadto:'Куда слать заявки',extras:'Ещё на сайте',booking:'Сервис записи',afterlead:'После заявки',responder:'Кто отвечает',speed:'Скорость ответа',sources:'Откуда клиенты',
    lang:'Языки',kztext:'Тексты на казахском',entext:'Тексты на английском',brand:'Фирменный стиль',brandparts:'Что есть из стиля',brandkeep:'Что делаем со стилем',examples:'Нравятся сайты',notneed:'Не нужно на сайте',terms:'Сроки'
  };
  const STEPS=[
    {n:1,t:'Знакомство',fields:['name','contact','niche','hassite','socials','siteurl','siteissues']},
    {n:2,t:'Бизнес и услуги',fields:['activity','city','format','services','top','avgcheck'],voice:'business'},
    {n:3,t:'Клиенты',fields:['who','decider','situation','important','why','whyfact','thanks'],voice:'thanks'},
    {n:4,t:'Сомнения',fields:['doubts','faq','refuse','rivals']},
    {n:5,t:'Доверие',fields:['proof','numbers','has']},
    {n:6,t:'Заявки',fields:['action','leadto','extras','booking','afterlead','responder','speed','sources']},
    {n:7,t:'Сайт',fields:['lang','kztext','entext','brand','brandparts','brandkeep','examples','notneed','terms']}
  ];
  const LAST=STEPS.length+1;
  const TRUSTABLE=[3,4,5,6,7];
  // Required answers. Steps 1–2 can never be skipped; steps 3–7 can be handed over via "Доверяю вам".
  const REQ={1:['name','contact'],2:['activity','city','services'],3:['who','why'],4:['doubts'],5:['proof'],6:['action'],7:['lang']};
  // A voice note on a topic counts as an answer to these fields
  const VOICE_COVERS={business:['activity','services','who','why','doubts'],thanks:['thanks']};
  const SOLO=/^(Не знаю|Пока нечем|Ничего)/;   // exclusive chips reset the rest of a multi group
  // Chips that tend to produce clichés; picking them asks for a concrete example
  const GENERIC=['Качество результата','Опыт и квалификация','Внимательное отношение','Честные цены'];

  let cur=1, mode='full', sending=false;
  const trusted={}; TRUSTABLE.forEach(n=>trusted[n]=false);
  const chips={}, chipBoxes={}, otherInputs={};
  let voices=[];

  /* ---------- icons & messages ---------- */
  function icon(id,cls){ return '<svg class="'+(cls||'ic')+'"><use href="#i-'+id+'"/></svg>'; }
  function showWarn(t){ const w=$('#warnbar'); w.innerHTML=icon('alert'); const s=document.createElement('span'); s.textContent=t; w.appendChild(s); w.classList.add('show'); }
  function hideWarn(){ $('#warnbar').classList.remove('show'); }
  function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function plural(n,one,few,many){ const a=n%10,b=n%100; return a===1&&b!==11?one:(a>=2&&a<=4&&(b<12||b>14)?few:many); }

  /* ---------- visibility ---------- */
  function fieldNode(n){ return chipBoxes[n]||$('#briefForm [name="'+n+'"]'); }
  function condOff(n){ const el=fieldNode(n); return !!(el&&el.closest('[data-cond-off]')); }
  function fastHidden(n){ const el=fieldNode(n); return mode==='fast'&&!!(el&&el.closest('.dhide')); }
  function hidden(n){ return condOff(n)||fastHidden(n); }

  // data-if syntax: "group=a|b" (any of values), "group=*" (anything chosen), "c1;c2" (either condition).
  // A source group that is itself hidden never switches anything on.
  function applyConds(){
    $$('[data-if]').forEach(el=>{
      const on=el.dataset.if.split(';').some(cond=>{
        const [g,vals]=cond.split('='), list=(chips[g]||[]).filter(v=>v!==OTHER||(otherInputs[g]&&otherInputs[g].value.trim()));
        if(!chipBoxes[g]||hidden(g)) return false;
        return vals==='*'?list.length>0:list.some(v=>vals.split('|').includes(v));
      });
      el.toggleAttribute('data-cond-off',!on);
    });
    whyHint();
  }

  function whyHint(){
    const h=$('#whyHint'); if(!h) return;
    const g=(chips.why||[]).filter(v=>GENERIC.includes(v));
    h.textContent=g.length
      ?'Вы отметили «'+g.join('», «')+'». Если хотите, расскажите подробнее: например, не «качество», а «используем оборудование X и даём гарантию 2 года».'
      :'Конкретный факт убеждает сильнее, чем общие слова.';
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
  function voiceCovered(n){ return voices.some(v=>(VOICE_COVERS[v.topic]||[]).includes(n)); }
  function answered(n){ return !!collectVal(n)||voiceCovered(n); }
  function activeReq(n){ return (REQ[n]||[]).filter(x=>!hidden(x)&&!voiceCovered(x)); }
  function missingIn(n){ return activeReq(n).filter(x=>!collectVal(x)); }
  function stepOf(n){ return STEPS.find(st=>st.n===n); }
  // Visible optional questions left blank, grouped by step; trusted steps are not counted
  function optionalLeft(){
    const out=[];
    STEPS.forEach(st=>{
      if(trusted[st.n]) return;
      const f=st.fields.filter(x=>!(REQ[st.n]||[]).includes(x)&&!hidden(x)&&!answered(x));
      if(f.length) out.push({n:st.n,t:st.t,fields:f});
    });
    return out;
  }

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
      b.innerHTML=icon('plus')+'<span>Другое</span>';
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
      applyConds(); saveDraft(); refresh();
    });
  });

  /* ---------- draft ---------- */
  function snapshot(){
    const vals={};
    $$('#briefForm [name]').forEach(el=>{ if(el.type!=='checkbox'&&el.name!=='website') vals[el.name]=el.value; });
    return {v:SCHEMA,ts:Date.now(),mode,trusted,chips,vals};
  }
  function saveDraft(){ if(sending)return; try{localStorage.setItem(DKEY,JSON.stringify(snapshot()))}catch(e){} }
  function clearDraft(){ try{localStorage.removeItem(DKEY)}catch(e){} }
  function restore(){
    try{ OLD_KEYS.forEach(k=>localStorage.removeItem(k)); }catch(e){}
    let d=null; try{d=JSON.parse(localStorage.getItem(DKEY))}catch(e){}
    if(!d||typeof d!=='object') return;
    // Drafts from another form version or too old are dropped, never merged
    if(d.v!==SCHEMA||typeof d.ts!=='number'||Date.now()-d.ts>DRAFT_TTL){ clearDraft(); return; }
    mode=d.mode==='fast'?'fast':'full';
    const t=d.trusted&&typeof d.trusted==='object'?d.trusted:{};
    TRUSTABLE.forEach(k=>{ trusted[k]=t[k]===true; });
    const c=d.chips&&typeof d.chips==='object'?d.chips:{};
    Object.keys(chipBoxes).forEach(g=>{
      const allowed=[...chipBoxes[g].querySelectorAll('.chip')].map(b=>b.dataset.val);
      chips[g]=Array.isArray(c[g])?c[g].filter(x=>allowed.includes(x)):[];
      if(!chipBoxes[g].hasAttribute('data-multi')) chips[g]=chips[g].slice(0,1);
    });
    const v=d.vals&&typeof d.vals==='object'?d.vals:{};
    $$('#briefForm [name]').forEach(el=>{ if(el.name!=='website'&&typeof v[el.name]==='string') el.value=v[el.name].slice(0,MAXLEN); });
  }

  /* ---------- mode ---------- */
  function setMode(m){
    mode=m;
    document.body.classList.toggle('fast',m==='fast');
    $('#modePill').innerHTML=icon(m==='fast'?'bolt':'list')+'<span>'+(m==='fast'?'Быстро':'Подробно')+'</span>';
    $$('.modecard').forEach(c=>{ const on=c.dataset.mode===m; c.classList.toggle('on',on); c.setAttribute('aria-pressed',on?'true':'false'); });
    applyConds(); saveDraft(); refresh();
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
    setTrusted(+cb.dataset.trust,cb.checked); hideWarn(); clearErr(); saveDraft(); refresh();
  }));

  // A chosen "own option" with an empty text box is an unfinished answer
  function emptyOthers(n){
    const st=stepOf(n); if(!st) return [];
    return st.fields.filter(g=>chipBoxes[g]&&chips[g].includes(OTHER)&&!hidden(g)&&!otherInputs[g].value.trim());
  }
  // First reason step n cannot be left, or null
  function stepIssue(n){
    if(trusted[n]) return null;
    const eo=emptyOthers(n);
    if(eo.length) return {n,other:eo};
    const m=missingIn(n);
    return m.length?{n,miss:m}:null;
  }
  function showIssue(is){
    clearErr();
    if(is.other){
      showWarn('Впишите свой вариант или снимите отметку «Другое»: '+labelsOf(is.other)+'.');
      is.other.forEach(g=>otherInputs[g].classList.add('err')); otherInputs[is.other[0]].focus(); return;
    }
    const tip=TRUSTABLE.includes(is.n)
      ?' Не хочется отвечать — нажмите «Доверяю вам» вверху блока, и я продумаю сама.'
      :(is.n===2?' Можно вместо этого записать голосовое.':'');
    showWarn('Осталось ответить: '+labelsOf(is.miss)+'.'+tip);
    markErr(is.miss);
  }

  /* ---------- progress ---------- */
  function stepProgress(n){
    if(n===LAST) return cur>=LAST?1:0;
    if(trusted[n]) return 1;
    const r=activeReq(n); if(!r.length) return cur>n?1:0;
    return r.filter(x=>collectVal(x)).length/r.length;
  }
  function refresh(){
    let sum=0; for(let i=1;i<=LAST;i++) sum+=stepProgress(i);
    const pct=Math.round(sum/LAST*100);
    $('#pBar').style.width=pct+'%';
    $('#pPct').textContent=pct+'%';
    $('#pStep').textContent='Шаг '+cur+' из '+LAST;
    $$('.dot').forEach(d=>{
      const n=+d.dataset.goto, ok=stepProgress(n)>=1;
      d.classList.toggle('cur',n===cur);
      d.classList.toggle('done',ok&&n!==cur);
      if(n===cur) d.setAttribute('aria-current','step'); else d.removeAttribute('aria-current');
      d.querySelector('.dn').innerHTML=(ok&&n!==cur)?icon('check'):String(n);
    });
    if(cur===LAST){ renderStatus(); renderSummary(); }
  }

  /* ---------- navigation ---------- */
  function clearErr(){ $$('.err').forEach(el=>el.classList.remove('err')); }
  function markErr(list){
    list.forEach(n=>{ const el=fieldNode(n); if(el) el.classList.add('err'); });
    const first=fieldNode(list[0]); if(first&&first.scrollIntoView) first.scrollIntoView({behavior:'smooth',block:'center'});
  }
  // Lower-case the first letter only when it is not an abbreviation or brand ("Instagram / 2ГИС" stays)
  function lc(s){ return /^[А-ЯЁ][а-яё]/.test(s)?s[0].toLowerCase()+s.slice(1):s; }
  function labelsOf(list){ const t=list.map(m=>lc(LABELS[m])).join(', '); return t[0].toUpperCase()+t.slice(1); }
  function go(n){
    cur=n;
    $$('.step').forEach(s=>s.classList.toggle('active',+s.dataset.step===n));
    $('#btnBack').style.visibility=n===1?'hidden':'visible';
    $('#btnNextText').textContent=n===LAST?'Отправить бриф':'Дальше';
    $('#btnNextIc').innerHTML='<use href="#i-'+(n===LAST?'send':'right')+'"/>';
    hideWarn(); clearErr();
    if(n===LAST) tsRender();
    refresh();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  // Moving forward (button or step dots) never skips a step with unanswered required questions
  function goForward(target){
    for(let i=cur;i<target;i++){
      const is=stepIssue(i);
      if(is){ if(i!==cur) go(i); showIssue(is); return; }
    }
    go(target);
  }
  document.addEventListener('click',e=>{
    const g=e.target.closest('[data-goto]'); if(!g) return;
    const n=+g.dataset.goto; n>cur?goForward(n):go(n);
  });
  $('#btnBack').addEventListener('click',()=>{ if(cur>1)go(cur-1); });
  $('#btnNext').addEventListener('click',()=>{ cur===LAST?submitForm():goForward(cur+1); });
  $('#briefForm').addEventListener('input',e=>{
    const t=e.target;
    if(t.classList&&t.classList.contains('inp')){
      t.classList.remove('err');
      if(t.classList.contains('otherinp')) t.previousElementSibling.classList.remove('err');
    }
    if(t.classList&&t.classList.contains('otherinp')) applyConds();
    saveDraft(); refresh();
  });

  /* ---------- final screen ---------- */
  function renderStatus(){
    const box=$('#status'), left=optionalLeft();
    const total=left.reduce((a,s)=>a+s.fields.length,0);
    box.classList.toggle('ok',!total);
    if(!total){
      box.innerHTML='<div class="stt">'+icon('check')+' Всё готово</div><p class="std">Можно отправлять.</p>';
      return;
    }
    const links=left.map(s=>'<button type="button" class="stlink" data-goto="'+s.n+'">'+escHtml(s.t)+' · '+s.fields.length+'</button>').join('');
    box.innerHTML='<div class="stt">Можно отправить сейчас.</div>'
      +'<p class="std">Остались необязательные вопросы: '+total+'. Если захотите дополнить:</p>'
      +'<div class="stlinks">'+links+'</div>';
  }
  function renderSummary(){
    const box=$('#summary'); box.innerHTML='';
    STEPS.forEach(st=>{
      const div=document.createElement('div'); div.className='sumstep';
      let inner='<div class="sumt"><span>'+st.t+'</span><button type="button" class="sedit" data-goto="'+st.n+'">изменить</button></div>';
      const vc=st.voice?voices.filter(v=>v.topic===st.voice).length:0;
      const vRow=vc?'<div class="sumrow"><span>Голосовые:</span> '+vc+' шт.</div>':'';
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
  // Every [data-rec] block is a recorder for its topic; one recording at a time, MAXV notes in total
  const MAXMS=5*60*1000, MAXV=4;
  const recs={};
  let mrec=null, mstream=null, mchunks=[], t0=0, mtick=null, recTopic=null;
  function fmt(ms){ const s=Math.floor(ms/1000); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
  $$('[data-rec]').forEach(root=>{
    const r={root,btn:root.querySelector('.recbtn'),title:root.querySelector('.rtitle'),timer:root.querySelector('.rtimer'),list:root.querySelector('.vlist'),hint:root.querySelector('.rhint')};
    r.idleTitle=r.title.textContent; r.idleTimer=r.timer.textContent;
    recs[root.dataset.rec]=r;
    r.btn.addEventListener('click',()=>toggleRec(root.dataset.rec));
    r.list.addEventListener('click',e=>{
      const b=e.target.closest('.vdel'); if(!b)return;
      const i=voices.indexOf(voices.find(v=>v.id===+b.dataset.id)); if(i<0)return;
      URL.revokeObjectURL(voices[i].url); voices.splice(i,1); renderVoices(); applyConds(); refresh();
    });
  });
  function vHint(topic,t){ recs[topic].hint.textContent=t||''; }
  function setRecUI(topic,on){
    const r=recs[topic];
    r.btn.classList.toggle('rec',on);
    r.btn.setAttribute('aria-label',on?'Остановить запись':'Записать голосовое');
    r.title.textContent=on?'Записываю… нажмите, чтобы остановить':r.idleTitle;
    if(!on) r.timer.textContent=r.idleTimer;
  }
  let vid=0;
  function renderVoices(){
    Object.keys(recs).forEach(t=>{
      const box=recs[t].list; box.innerHTML='';
      voices.filter(v=>v.topic===t).forEach(v=>{
        const d=document.createElement('div'); d.className='vitem';
        d.innerHTML='<audio controls src="'+v.url+'"></audio><span class="vdur">'+fmt(v.dur)+'</span><button type="button" class="vdel" data-id="'+v.id+'" aria-label="Удалить запись">'+icon('x')+'</button>';
        box.appendChild(d);
      });
    });
    const hasBiz=voices.some(v=>v.topic==='business');
    $$('.voicenote').forEach(p=>p.hidden=!hasBiz);
  }
  async function toggleRec(topic){
    if(recTopic){
      if(recTopic===topic&&mrec&&mrec.state!=='inactive') mrec.stop();
      else vHint(topic,'Сначала остановите текущую запись.');
      return;
    }
    if(voices.length>=MAXV){ vHint(topic,'Максимум '+MAXV+' записи — этого достаточно.'); return; }
    if(!window.MediaRecorder||!navigator.mediaDevices){ vHint(topic,'Браузер не поддерживает запись — напишите текстом.'); return; }
    try{ mstream=await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch(e){ vHint(topic,'Разрешите доступ к микрофону (значок замка в адресной строке).'); return; }
    let mime=''; ['audio/webm;codecs=opus','audio/webm','audio/mp4'].forEach(m=>{ if(!mime&&MediaRecorder.isTypeSupported(m))mime=m; });
    mchunks=[]; recTopic=topic;
    mrec=new MediaRecorder(mstream,mime?{mimeType:mime}:undefined);
    mrec.ondataavailable=e=>{ if(e.data.size)mchunks.push(e.data); };
    mrec.onstop=()=>{
      clearInterval(mtick);
      if(mstream)mstream.getTracks().forEach(t=>t.stop());
      const dur=Math.min(MAXMS,Date.now()-t0);
      const blob=new Blob(mchunks,{type:mime||'audio/webm'});
      voices.push({id:++vid,topic,blob,url:URL.createObjectURL(blob),dur});
      recTopic=null; setRecUI(topic,false); renderVoices(); clearErr(); hideWarn(); applyConds(); refresh();
      vHint(topic,voices.length<MAXV?'Готово! Можно записать ещё.':'Готово!');
    };
    mrec.start(); t0=Date.now(); setRecUI(topic,true); vHint(topic,'');
    mtick=setInterval(()=>{ const ms=Date.now()-t0; recs[topic].timer.textContent=fmt(ms)+' · до 5 минут'; if(ms>=MAXMS&&mrec.state!=='inactive')mrec.stop(); },250);
  }

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
    if(sending||recTopic)return;
    clearErr(); hideWarn();
    // Re-check every step: answers may have changed after it was passed (e.g. a voice note deleted)
    for(const st of STEPS){
      const is=stepIssue(st.n);
      if(is){ go(st.n); showIssue(is); return; }
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
      const skipped=optionalLeft().map(s=>s.t+': '+s.fields.map(f=>lc(LABELS[f])).join(', '));
      const fd=new FormData();
      fd.append('payload',JSON.stringify({mode,trusted,skipped,voiceTopics:voices.map(v=>v.topic),hp:($('#hp')?$('#hp').value:''),data}));
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
  TRUSTABLE.forEach(n=>setTrusted(n,trusted[n]));
  renderVoices();
  setMode(mode);
  go(1);
})();
