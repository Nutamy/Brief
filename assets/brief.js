(function(){
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

  // Bump SCHEMA whenever existing fields or chip values change: older drafts are then discarded
  // instead of being restored over the new form. Adding new fields does not require a bump.
  const SCHEMA=4;
  const DKEY='altyn_brief_v'+SCHEMA;
  const OLD_KEYS=['altyn_brief_v1','altyn_brief_v2','altyn_brief_v3'];
  const DRAFT_TTL=30*24*3600*1000;
  const MAXLEN=2000; // mirrors per-field cap on the server
  const TS_SITEKEY='0x4AAAAAAFCRN5gWSlHIgCa8';
  const OTHER='__other';
  const TG_URL='https://t.me/altynclick';

  // Interface language comes from <html lang>. /kz/ and /en/ load i18n/<lang>.js first: it sets
  // window.I18N with the client-facing strings below. Chip values (data-val), LABELS and step titles
  // stay Russian on every version: they go to Telegram, drive data-if conditions and survive a language switch.
  const LANG=document.documentElement.lang||'ru';
  const LABELS={
    name:'Имя',contact:'Контакт',contactway:'Как удобнее связаться',niche:'Сфера',hassite:'Сайт сейчас',socials:'Instagram / 2ГИС',siteurl:'Текущий сайт',siteissues:'Не устраивает в сайте',
    bizname:'Название',activity:'Чем занимается',city:'Город',format:'Формат работы',services:'Услуги / товары',top:'Главные услуги',avgcheck:'Чек',
    who:'Кто обращается',decider:'Кто принимает решение',situation:'С чем приходят',why:'За что хвалят',thanks:'Как хвалят (своими словами)',
    doubts:'Что смущает',faq:'Вопросы перед покупкой',refuse:'Почему не покупают',rivals:'Сравнивают с',
    proof:'Доказательства',numbers:'Цифры и условия',has:'Материалы',
    action:'Главная кнопка',pubsame:'Контакт на кнопке',pubphone:'Контакт для кнопок',addr:'Адрес и часы',leadto:'Куда слать заявки',extras:'Ещё на сайте',booking:'Сервис записи',afterlead:'После заявки',responder:'Кто отвечает',speed:'Скорость ответа',sources:'Откуда клиенты',
    lang:'Языки',kztext:'Тексты на казахском',entext:'Тексты на английском',brand:'Фирменный стиль',brandparts:'Что есть из стиля',brandkeep:'Что делаем со стилем',examples:'Нравятся сайты',notneed:'Не нужно на сайте',domain:'Доступ к сайту и домену',updates:'Кто обновляет сайт',budget:'Бюджет',terms:'Сроки'
  };
  const STEPS=[
    {n:1,t:'Знакомство',fields:['name','contact','contactway','niche','hassite','bizname','socials','siteurl','siteissues']},
    {n:2,t:'Бизнес и услуги',fields:['activity','city','format','services','top','avgcheck'],voice:'business'},
    {n:3,t:'Клиенты',fields:['who','decider','situation','why','thanks'],voice:'thanks'},
    {n:4,t:'Сомнения',fields:['doubts','faq','refuse','rivals']},
    {n:5,t:'Доверие',fields:['proof','numbers','has'],files:true},
    {n:6,t:'Заявки',fields:['action','pubsame','pubphone','addr','leadto','extras','booking','afterlead','responder','speed','sources']},
    {n:7,t:'Сайт',fields:['lang','kztext','entext','brand','brandparts','brandkeep','examples','notneed','domain','updates','budget','terms']}
  ];
  const LAST=STEPS.length+1;
  const TRUSTABLE=[3,4,5,6,7];
  // Required answers. Steps 1–2 can never be skipped; steps 3–7 can be handed over via "Доверяю вам".
  const REQ={1:['name','contact'],2:['activity','city','services'],3:['who','why'],4:['doubts'],5:['proof'],6:['action'],7:['lang']};
  // A voice note on a topic (at least VOICE_MIN long) counts as an answer to these fields
  const VOICE_COVERS={business:['activity','services','who','why'],thanks:['thanks']};
  const VOICE_MIN=15000;
  const SOLO=/^(Не знаю|Пока нечем|Ничего)/;   // exclusive chips reset the rest of a multi group

  // Placeholders follow the chosen niche so examples look like the client's own business
  const PH_KEYS=['activity','services','thanks','faq','numbers'];
  const PH={
    '':['Например: студия маникюра в центре Алматы, работаем с 2019 года.','Услуга 1 — от 10 000 ₸; услуга 2 — 25 000 ₸; остальное — по запросу','«Всё объяснили понятно», «сделали быстрее, чем обещали»','«Сколько стоит?», «Сколько длится?», «Есть ли рассрочка?»','Например: с 2018 года, 1 500 клиентов, гарантия 1 год'],
    'Стоматология / клиника':['Например: семейная стоматология в Алматы, лечим взрослых и детей. Работаем с 2016 года.','Лечение кариеса — от 15 000 ₸; чистка — 18 000 ₸; имплант — от 250 000 ₸','«Впервые не страшно было лечить зуб», «всё объяснили до начала лечения»','«Больно ли?», «Есть ли рассрочка?», «Можно с ребёнком?»','Например: с 2016 года, 3 000 пациентов, гарантия 2 года'],
    'Красота':['Например: салон красоты в Бостандыкском районе — волосы, ногти, брови. Работаем с 2019 года.','Стрижка — от 6 000 ₸; окрашивание — от 20 000 ₸; маникюр с покрытием — 8 000 ₸','«Наконец-то нашла своего мастера», «покрытие держится 3 недели»','«Сколько по времени?», «Какие материалы?», «Можно записаться на вечер?»','Например: с 2019 года, 12 мастеров, 4,9 в 2ГИС'],
    'Ремонт и строительство':['Например: ремонт квартир под ключ в Алматы, своя бригада. Работаем с 2015 года.','Косметический ремонт — от 25 000 ₸/м²; капитальный — от 60 000 ₸/м²; дизайн-проект — 5 000 ₸/м²','«Уложились в смету», «после них ничего не пришлось переделывать»','«Сколько стоит под ключ?», «Какие сроки?», «Кто покупает материалы?»','Например: 10 лет на рынке, 300 объектов, гарантия 2 года'],
    'Детский центр / обучение':['Например: развивающий центр для детей 2–7 лет — логопед и подготовка к школе.','Подготовка к школе — 40 000 ₸/мес; логопед — 7 000 ₸/занятие; пробное — бесплатно','«Ребёнок бежит на занятия», «за полгода заговорил предложениями»','«С какого возраста?», «Сколько детей в группе?», «Есть ли пробное?»','Например: с 2017 года, 400 выпускников, педагоги с опытом от 5 лет'],
    'Кафе / еда':['Например: кофейня с завтраками и выпечкой у метро Алатау, всё готовим сами.','Завтраки — от 2 500 ₸; кофе — от 900 ₸; торты на заказ — от 12 000 ₸','«Лучшие сырники в районе», «уютно работать с ноутбуком»','«Есть ли доставка?», «Можно заказать торт?», «Во сколько открываетесь?»','Например: с 2020 года, 300 гостей в день, 4,8 в 2ГИС'],
    'Фитнес / спорт':['Например: фитнес-студия для женщин, групповые и персональные тренировки.','Абонемент на месяц — 25 000 ₸; персональная тренировка — 8 000 ₸; пробное — бесплатно','«Минус 7 кг за 3 месяца», «первый зал, куда хочется ходить»','«Подойдёт ли новичку?», «Можно заморозить абонемент?», «Есть ли душ?»','Например: с 2018 года, 600 клиентов, тренеры с сертификатами'],
    'Юрист / бухгалтер / консалтинг':['Например: бухгалтерское сопровождение ИП и ТОО, сдаём отчётность за клиента.','Сопровождение ИП — от 15 000 ₸/мес; ТОО — от 40 000 ₸/мес; консультация — 10 000 ₸','«Сняли головную боль с налогами», «объясняют простыми словами»','«Сколько стоит для моего ИП?», «Работаете удалённо?», «Что нужно от меня?»','Например: с 2014 года, 120 клиентов на обслуживании'],
    'Авто':['Например: автосервис на Рыскулова — ходовая, диагностика, ТО.','Диагностика — 5 000 ₸; замена масла — от 4 000 ₸; ремонт ходовой — по осмотру','«Не навязали лишнего», «сделали в тот же день»','«Сколько стоит диагностика?», «Можно подождать на месте?», «Можно со своими запчастями?»','Например: с 2012 года, 5 боксов, гарантия 6 месяцев']
  };

  const RU={
    stepWord:(c,l)=>'Шаг '+c+' из '+l,
    multi:'можно несколько', other:'Другое', otherPh:'Ваш вариант', otherAria:'Свой вариант', inVoice:'есть в голосовом',
    resetConfirm:'Стереть все ответы? Нажмите ещё раз',
    fast:'Быстро', full:'Подробно',
    modeAria:m=>'Режим: '+(m==='fast'?'быстро':'подробно')+'. Переключить на '+(m==='fast'?'подробный':'быстрый'),
    errContact:'Проверьте контакт: нужен телефон (например, +7 701 123 45 67) или ник в Telegram (@name) — иначе я не смогу ответить.',
    errOther:l=>'Впишите свой вариант или снимите отметку «Другое»: '+l+'.',
    tipTrust:' Не хочется отвечать — нажмите «Доверяю вам» вверху блока, и я продумаю сама.',
    tipVoice:' Вместо «Чем занимаетесь» и «Услуг» можно записать голосовое.',
    errMissing:(l,tip)=>'Осталось ответить: '+l+'.'+tip,
    send:'Отправить бриф', next:'Дальше', sendingTxt:'Отправляю…',
    allReady:'Всё готово', canSendNow:'Можно отправлять.', canSend:'Можно отправить сейчас.',
    leftOpt:n=>'Остались необязательные вопросы: '+n+'. Если захотите дополнить:',
    edit:'изменить', voices:'Голосовые:', pcs:'шт.', filesLb:'Файлы:',
    trustedSum:'Доверено мне', trustedAlso:' — учту и то, что вы отметили:', emptySum:'— пока пусто',
    copyHead:'Бриф Altyn Click', copyTrusted:' (доверено)', locale:'ru-RU',
    delFile:'Удалить файл', kb:'КБ', mb:'МБ',
    filesSkipped:m=>'Часть файлов не добавлена: подходят фото и PDF, до '+m+' файлов и 25 МБ вместе. Остальное пришлите в Telegram:',
    recStart:'Записать голосовое', recStop:'Остановить запись', recOn:'Записываю… нажмите, чтобы остановить',
    upTo5:'до 5 минут', delRec:'Удалить запись',
    noMicTip:tg=>'Откройте бриф в Safari или Chrome (меню «⋯» → «Открыть в браузере») — или пришлите голосовое в Telegram '+tg+'.',
    stopFirst:'Сначала остановите текущую запись.',
    maxRec:m=>'Максимум '+m+' записи — этого достаточно.',
    noRec:'Здесь запись не работает. ',
    inAppMic:'Этот браузер не даёт доступ к микрофону. ',
    allowMic:tg=>'Разрешите доступ к микрофону (значок замка в адресной строке) — или пришлите голосовое в Telegram '+tg+'.',
    recShort:'Запись короче 15 секунд — она не заменит ответы. Расскажите подробнее или заполните поля.',
    recDone:'Готово! Можно записать ещё.', recDoneLast:'Готово!',
    tsLang:'ru',
    errCaptchaLoad:'Не удалось пройти проверку от спама. Обновите страницу и попробуйте ещё раз — ответы сохранятся. Или напишите напрямую:',
    errCaptcha:'Проверка от спама не прошла. Попробуйте ещё раз — ответы сохранятся. Или напишите напрямую:',
    errLarge:'Файлы слишком большие для отправки. Удалите часть на шаге «Доверие» и пришлите их в Telegram:',
    errSend:'Не получилось отправить. Проверьте интернет и попробуйте ещё раз — ответы сохранятся. Если не выходит, напишите напрямую:',
    doneTo:c=>' — сюда: '+c
  };
  const T=window.I18N||{};
  const I=Object.assign({},RU,T.ui||{});
  // Client-facing field names and step titles; Russian ones are kept for what goes to Telegram
  const SHOWN=Object.assign({},LABELS,T.labels||{});
  const stepTitle=n=>(T.steps&&T.steps[n])||stepOf(n).t;
  if(T.ph) Object.assign(PH,T.ph);

  let cur=1, mode='full', sending=false, returnToSum=false;
  const trusted={}; TRUSTABLE.forEach(n=>trusted[n]=false);
  const chips={}, chipBoxes={}, otherInputs={};
  let voices=[], files=[], vid=0;

  /* ---------- icons & messages ---------- */
  function icon(id,cls){ return '<svg class="'+(cls||'ic')+'"><use href="#i-'+id+'"/></svg>'; }
  function showWarn(t,link){
    const w=$('#warnbar'); w.innerHTML=icon('alert');
    const s=document.createElement('span'); s.textContent=t;
    if(link){ const a=document.createElement('a'); a.href=TG_URL; a.target='_blank'; a.rel='noopener'; a.textContent=' @altynclick'; s.appendChild(a); }
    w.appendChild(s); w.classList.add('show');
  }
  function hideWarn(){ $('#warnbar').classList.remove('show'); }
  function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function fmtSize(b){ return b<1048576?Math.max(1,Math.round(b/1024))+' '+I.kb:(b/1048576).toFixed(1).replace('.',',')+' '+I.mb; }

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
  }

  function applyPlaceholders(){
    const set=PH[(chips.niche||[])[0]]||PH[''];
    PH_KEYS.forEach((k,i)=>{ const el=$('#briefForm [name="'+k+'"]'); if(el) el.placeholder=set[i]; });
  }

  /* ---------- values ---------- */
  // Answers to questions the client can't see right now (condition off or hidden in fast mode) are not sent
  function collectVal(n){
    if(hidden(n)) return '';
    if(chipBoxes[n]){
      const vals=chips[n].filter(v=>v!==OTHER);
      if(chips[n].includes(OTHER)&&otherInputs[n]){ const o=otherInputs[n].value.trim(); if(o) vals.push(o); }
      return vals.join(', ');
    }
    const el=$('#briefForm [name="'+n+'"]');
    return el&&el.value?el.value.trim():'';
  }
  function coveringVoices(){ return voices.filter(v=>v.dur>=VOICE_MIN); }
  function voiceCovered(n){ return coveringVoices().some(v=>(VOICE_COVERS[v.topic]||[]).includes(n)); }
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

  // Contact must be reachable: a phone with 10–15 digits, a Telegram handle / t.me link, or an email
  function contactOk(v){
    v=v.trim();
    if(/(^|\s)@[A-Za-z0-9_]{4,}\b/.test(v)||/t\.me\/[A-Za-z0-9_]{4,}/.test(v)) return true;
    if(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/.test(v)) return true;
    const d=v.replace(/\D/g,'');
    return d.length>=10&&d.length<=15;
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
  let lbId=0;
  $$('[data-chips]').forEach(c=>{
    const g=c.dataset.chips; chipBoxes[g]=c; chips[g]=[];
    // Group semantics: screen readers announce the question for every chip
    const lb=c.parentElement.querySelector('.lb');
    c.setAttribute('role','group');
    if(lb){
      if(!lb.id) lb.id='lb-'+(++lbId);
      c.setAttribute('aria-labelledby',lb.id);
      if(c.dataset.multi!=null&&!lb.querySelector('.lbmulti')) lb.insertAdjacentHTML('beforeend',' <span class="lbhint lbmulti">'+I.multi+'</span>');
    }
    if(c.dataset.other!=null){
      const b=document.createElement('button');
      b.type='button'; b.className='chip other'; b.dataset.val=OTHER;
      b.innerHTML=icon('plus')+'<span>'+I.other+'</span>';
      c.appendChild(b);
      const i=document.createElement('input');
      i.className='inp otherinp'; i.name=g+'_other'; i.maxLength=200; i.hidden=true;
      i.placeholder=c.dataset.other||I.otherPh;
      i.setAttribute('aria-label',I.otherAria);
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
      syncChips(g); c.classList.remove('err'); c.removeAttribute('aria-invalid');
      if(val===OTHER&&chips[g].includes(OTHER)) otherInputs[g].focus();
      if(g==='niche') applyPlaceholders();
      applyConds(); saveDraft(); refresh();
    });
  });

  /* ---------- required markers ---------- */
  // Each required field gets a "есть в голосовом" tag that replaces the star while a voice note covers it
  const reqMarks={};
  Object.values(REQ).flat().forEach(n=>{
    const el=fieldNode(n); if(!el) return;
    const star=el.parentElement.querySelector('.req'); if(!star) return;
    const tag=document.createElement('span'); tag.className='vcov'; tag.hidden=true;
    tag.innerHTML=icon('mic')+I.inVoice;
    star.after(tag); reqMarks[n]={star,tag};
  });
  function syncReqMarks(){
    Object.keys(reqMarks).forEach(n=>{ const c=voiceCovered(n); reqMarks[n].star.hidden=c; reqMarks[n].tag.hidden=!c; });
  }

  /* ---------- draft: text in localStorage, audio and files in IndexedDB ---------- */
  function snapshot(){
    const vals={};
    $$('#briefForm [name]').forEach(el=>{ if(el.type!=='checkbox'&&el.type!=='file'&&el.id!=='hp') vals[el.name]=el.value; });
    return {v:SCHEMA,ts:Date.now(),cur,mode,trusted,chips,vals};
  }
  function saveDraft(){ if(sending)return; try{localStorage.setItem(DKEY,JSON.stringify(snapshot()))}catch(e){} }
  function clearDraft(){ try{localStorage.removeItem(DKEY)}catch(e){} return blobs.clear(); }

  const blobs={
    db:null,
    open(){
      if(this.db) return this.db;
      this.db=new Promise(res=>{
        try{
          const r=indexedDB.open('altyn_brief_blobs',1);
          r.onupgradeneeded=()=>r.result.createObjectStore('b',{keyPath:'id'});
          r.onsuccess=()=>res(r.result); r.onerror=()=>res(null);
        }catch(e){ res(null); }
      });
      return this.db;
    },
    async tx(mode,fn){
      const db=await this.open(); if(!db) return null;
      return new Promise(res=>{
        try{
          const t=db.transaction('b',mode), r=fn(t.objectStore('b'));
          t.oncomplete=()=>res(r&&r.result); t.onerror=t.onabort=()=>res(null);
        }catch(e){ res(null); }
      });
    },
    put(rec){ return this.tx('readwrite',st=>st.put(rec)); },
    del(id){ return this.tx('readwrite',st=>st.delete(id)); },
    all(){ return this.tx('readonly',st=>st.getAll()); },
    clear(){ return this.tx('readwrite',st=>st.clear()); }
  };
  function storeVoice(v){ blobs.put({id:v.id,kind:'voice',topic:v.topic,dur:v.dur,blob:v.blob,ts:Date.now()}); }
  function storeFile(f){ blobs.put({id:f.id,kind:'file',name:f.name,blob:f.blob,ts:Date.now()}); }

  function restore(){
    try{ OLD_KEYS.forEach(k=>localStorage.removeItem(k)); }catch(e){}
    let d=null; try{d=JSON.parse(localStorage.getItem(DKEY))}catch(e){}
    if(!d||typeof d!=='object') return null;
    // Drafts from another form version or too old are dropped, never merged
    if(d.v!==SCHEMA||typeof d.ts!=='number'||Date.now()-d.ts>DRAFT_TTL){ clearDraft(); return null; }
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
    $$('#briefForm [name]').forEach(el=>{ if(el.id!=='hp'&&el.type!=='file'&&typeof v[el.name]==='string') el.value=v[el.name].slice(0,MAXLEN); });
    const hasContent=Object.values(v).some(x=>typeof x==='string'&&x.trim())||Object.values(chips).some(a=>a.length)||TRUSTABLE.some(k=>trusted[k]);
    return hasContent?{cur:Number.isInteger(d.cur)&&d.cur>=1&&d.cur<=LAST?d.cur:1}:null;
  }
  async function restoreBlobs(){
    const all=await blobs.all(); if(!all||!all.length) return false;
    const fresh=all.filter(r=>r&&r.blob&&Date.now()-(r.ts||0)<DRAFT_TTL).sort((a,b)=>a.id-b.id);
    all.filter(r=>!fresh.includes(r)).forEach(r=>blobs.del(r.id));
    fresh.forEach(r=>{
      vid=Math.max(vid,r.id);
      if(r.kind==='voice') voices.push({id:r.id,topic:recs[r.topic]?r.topic:'business',blob:r.blob,url:URL.createObjectURL(r.blob),dur:r.dur||0});
      else if(r.kind==='file') files.push({id:r.id,name:r.name||'file',blob:r.blob});
    });
    return fresh.length>0;
  }

  // Two-tap confirm instead of a blocking confirm() dialog
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-reset]'); if(!b) return;
    if(!b.dataset.armed){
      b.dataset.armed='1'; b.dataset.label=b.innerHTML;
      b.textContent=I.resetConfirm;
      setTimeout(()=>{ if(b.dataset.armed){ delete b.dataset.armed; b.innerHTML=b.dataset.label; } },4000);
      return;
    }
    sending=true; stopRec();
    try{localStorage.removeItem(DKEY)}catch(e){}
    blobs.clear().then(()=>location.reload());
  });

  /* ---------- mode ---------- */
  function setMode(m){
    mode=m;
    document.body.classList.toggle('fast',m==='fast');
    const pill=$('#modePill');
    pill.querySelector('span').textContent=m==='fast'?I.fast:I.full;
    pill.setAttribute('aria-label',I.modeAria(m));
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
    if(n===1){
      const c=$('#f-contact').value;
      if(c.trim()&&!contactOk(c)) return {n,contact:true};
    }
    if(trusted[n]) return null;
    const eo=emptyOthers(n);
    if(eo.length) return {n,other:eo};
    const m=missingIn(n);
    return m.length?{n,miss:m}:null;
  }
  function showIssue(is){
    clearErr();
    if(is.contact){
      showWarn(I.errContact);
      markErr(['contact']); return;
    }
    if(is.other){
      showWarn(I.errOther(labelsOf(is.other)));
      is.other.forEach(g=>otherInputs[g].classList.add('err')); otherInputs[is.other[0]].focus(); return;
    }
    const hasVoice=coveringVoices().some(v=>v.topic==='business');
    const tip=TRUSTABLE.includes(is.n)
      ?I.tipTrust
      :(is.n===2&&!hasVoice&&is.miss.some(x=>VOICE_COVERS.business.includes(x))?I.tipVoice:'');
    showWarn(I.errMissing(labelsOf(is.miss),tip));
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
    const pct=Math.round(sum/LAST*100), narrow=innerWidth<640;
    $('#pBar').style.width=pct+'%';
    $('#pPct').textContent=pct+'%';
    $('#pStep').textContent=narrow?cur+'/'+LAST:I.stepWord(cur,LAST);
    $$('.dot').forEach(d=>{
      const n=+d.dataset.goto, ok=stepProgress(n)>=1;
      d.classList.toggle('cur',n===cur);
      d.classList.toggle('done',ok&&n!==cur);
      if(n===cur) d.setAttribute('aria-current','step'); else d.removeAttribute('aria-current');
      d.querySelector('.dn').innerHTML=(ok&&n!==cur)?icon('check'):String(n);
    });
    syncReqMarks();
    if(cur===LAST){ renderStatus(); renderSummary(); }
  }
  addEventListener('resize',()=>refresh());

  /* ---------- navigation ---------- */
  function clearErr(){
    $$('.err').forEach(el=>el.classList.remove('err'));
    $$('#briefForm [aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
  }
  function markErr(list){
    list.forEach(n=>{ const el=fieldNode(n); if(el){ el.classList.add('err'); el.setAttribute('aria-invalid','true'); } });
    const first=fieldNode(list[0]); if(first&&first.scrollIntoView) first.scrollIntoView({behavior:'smooth',block:'center'});
  }
  // Lower-case the first letter only when it is not an abbreviation or brand ("Instagram / 2ГИС" stays)
  function lc(s){ return /^[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ][a-zа-яёәғқңөұүһі]/.test(s)&&!/^(Instagram|Telegram|WhatsApp)/.test(s)?s[0].toLowerCase()+s.slice(1):s; }
  function labelsOf(list){ const t=list.map(m=>lc(SHOWN[m])).join(', '); return t[0].toUpperCase()+t.slice(1); }
  function go(n,opts){
    // Leaving a step ends an active recording so it is kept and never runs unseen in the background
    if(recTopic) stopRec();
    if(n===LAST) returnToSum=false;
    cur=n;
    $$('.step').forEach(s=>s.classList.toggle('active',+s.dataset.step===n));
    $('#btnBack').style.visibility=n===1?'hidden':'visible';
    $('#btnNextText').textContent=n===LAST?I.send:I.next;
    $('#btnNextIc').innerHTML='<use href="#i-'+(n===LAST?'send':'right')+'"/>';
    $('#btnToSum').hidden=!(returnToSum&&n!==LAST);
    hideWarn(); clearErr();
    if(n===LAST) tsRender();
    saveDraft(); refresh();
    window.scrollTo({top:0,behavior:'smooth'});
    // Move focus to the step heading so keyboard and screen reader users start at the new step
    if(!(opts&&opts.noFocus)){ const h=$('#step'+n+' .h-step'); if(h){ h.tabIndex=-1; h.focus({preventScroll:true}); } }
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
    const n=+g.dataset.goto;
    // Editing from the final screen offers a shortcut back to it
    if(cur===LAST&&n<LAST&&(g.classList.contains('sedit')||g.classList.contains('stlink'))) returnToSum=true;
    n>cur?goForward(n):go(n);
  });
  $('#btnBack').addEventListener('click',()=>{ if(cur>1)go(cur-1); });
  $('#btnNext').addEventListener('click',()=>{ cur===LAST?submitForm():goForward(cur+1); });
  $('#btnToSum').addEventListener('click',()=>goForward(LAST));
  $('#briefForm').addEventListener('input',e=>{
    const t=e.target;
    if(t.classList&&t.classList.contains('inp')){
      t.classList.remove('err'); t.removeAttribute('aria-invalid');
      if(t.classList.contains('otherinp')) t.previousElementSibling.classList.remove('err');
    }
    if(t.classList&&t.classList.contains('otherinp')) applyConds();
    saveDraft(); refresh();
  });
  // Enter in a one-line field moves to the next visible field of the step, or to the next step
  $('#briefForm').addEventListener('keydown',e=>{
    if(e.key!=='Enter'||e.isComposing||e.target.tagName!=='INPUT'||e.target.type==='checkbox'||e.target.type==='file') return;
    e.preventDefault();
    const step=e.target.closest('.step');
    const list=[...step.querySelectorAll('input.inp,textarea.inp')].filter(el=>el.offsetParent!==null);
    const i=list.indexOf(e.target);
    if(i>=0&&i<list.length-1) list[i+1].focus();
    else $('#btnNext').click();
  });

  /* ---------- final screen ---------- */
  function renderStatus(){
    const box=$('#status'), left=optionalLeft();
    const total=left.reduce((a,s)=>a+s.fields.length,0);
    box.classList.toggle('ok',!total);
    if(!total){
      box.innerHTML='<div class="stt">'+icon('check')+' '+I.allReady+'</div><p class="std">'+I.canSendNow+'</p>';
      return;
    }
    const links=left.map(s=>'<button type="button" class="stlink" data-goto="'+s.n+'">'+escHtml(stepTitle(s.n))+' · '+s.fields.length+'</button>').join('');
    box.innerHTML='<div class="stt">'+I.canSend+'</div>'
      +'<p class="std">'+I.leftOpt(total)+'</p>'
      +'<div class="stlinks">'+links+'</div>';
  }
  // What the client sees in the summary and the copy: chips by their visible text, in the page language
  function shownVal(n){
    if(!chipBoxes[n]||!window.I18N) return collectVal(n);
    if(hidden(n)) return '';
    const c=chipBoxes[n], vals=chips[n].filter(v=>v!==OTHER).map(v=>{
      const b=[...c.querySelectorAll('.chip')].find(x=>x.dataset.val===v);
      return b?b.textContent.trim():v;
    });
    if(chips[n].includes(OTHER)&&otherInputs[n]){ const o=otherInputs[n].value.trim(); if(o) vals.push(o); }
    return vals.join(', ');
  }
  function stepRows(st){
    const rows=[];
    st.fields.forEach(f=>{ const v=shownVal(f); if(v) rows.push([SHOWN[f],v]); });
    return rows;
  }
  function renderSummary(){
    const box=$('#summary'); box.innerHTML='';
    STEPS.forEach(st=>{
      const div=document.createElement('div'); div.className='sumstep';
      let inner='<div class="sumt"><span>'+escHtml(stepTitle(st.n))+'</span><button type="button" class="sedit" data-goto="'+st.n+'">'+I.edit+'</button></div>';
      const vc=st.voice?voices.filter(v=>v.topic===st.voice).length:0;
      let extra=vc?'<div class="sumrow"><span>'+I.voices+'</span> '+vc+(I.pcs?' '+I.pcs:'')+'</div>':'';
      if(st.files&&files.length) extra+='<div class="sumrow"><span>'+I.filesLb+'</span> '+files.map(f=>escHtml(f.name)).join(', ')+'</div>';
      const rows=stepRows(st).map(r=>'<div class="sumrow"><span>'+r[0]+':</span> '+escHtml(r[1])+'</div>').join('');
      if(trusted[st.n]){
        inner+='<div class="sumtrust">'+icon('spark')+' '+I.trustedSum+(rows?I.trustedAlso:'')+'</div>'+rows+extra;
      }else{
        inner+=(rows||extra)?rows+extra:'<div class="sumrow empty">'+I.emptySum+'</div>';
      }
      div.innerHTML=inner; box.appendChild(div);
    });
  }

  // Plain-text copy of the answers the client can keep for themselves
  function answersText(){
    const L=[I.copyHead+' · '+new Date().toLocaleString(I.locale),''];
    STEPS.forEach(st=>{
      L.push('— '+stepTitle(st.n)+(trusted[st.n]?I.copyTrusted:'')+' —');
      const rows=stepRows(st);
      rows.forEach(r=>L.push(r[0]+': '+r[1]));
      const vc=st.voice?voices.filter(v=>v.topic===st.voice).length:0;
      if(vc) L.push(I.voices+' '+vc+(I.pcs?' '+I.pcs:''));
      if(st.files&&files.length) L.push(I.filesLb+' '+files.map(f=>f.name).join(', '));
      if(!rows.length&&!vc) L.push('—');
      L.push('');
    });
    return L.join('\n');
  }
  let savedCopy='';
  document.addEventListener('click',e=>{
    if(!e.target.closest('[data-copy]')) return;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([savedCopy||answersText()],{type:'text/plain;charset=utf-8'}));
    a.download='brief-altyn-click.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  });

  /* ---------- attachments ---------- */
  const MAXF=8, MAXF_TOTAL=25*1024*1024;
  const fileOk=f=>/^image\//.test(f.type)||f.type==='application/pdf';
  function renderFiles(){
    const box=$('#fileList'); if(!box) return;
    box.innerHTML='';
    files.forEach(f=>{
      const d=document.createElement('div'); d.className='vitem';
      d.innerHTML='<svg class="ic text-gold"><use href="#i-clip"/></svg><span class="fname"></span><span class="vdur">'+fmtSize(f.blob.size)+'</span><button type="button" class="vdel" data-fid="'+f.id+'" aria-label="'+I.delFile+'">'+icon('x')+'</button>';
      d.querySelector('.fname').textContent=f.name;
      box.appendChild(d);
    });
  }
  const fileInp=$('#fileInp');
  if(fileInp){
    fileInp.addEventListener('change',()=>{
      let total=files.reduce((a,f)=>a+f.blob.size,0), skipped=0;
      [...fileInp.files].forEach(f=>{
        if(!fileOk(f)||files.length>=MAXF||total+f.size>MAXF_TOTAL){ skipped++; return; }
        const rec={id:++vid,name:f.name,blob:f}; files.push(rec); storeFile(rec); total+=f.size;
      });
      fileInp.value='';
      renderFiles(); refresh();
      if(skipped) showWarn(I.filesSkipped(MAXF),true);
      else hideWarn();
    });
    $('#fileList').addEventListener('click',e=>{
      const b=e.target.closest('.vdel'); if(!b) return;
      const id=+b.dataset.fid; files=files.filter(f=>f.id!==id); blobs.del(id); renderFiles(); refresh();
    });
  }

  /* ---------- voice recorder ---------- */
  // Every [data-rec] block is a recorder for its topic; one recording at a time, MAXV notes in total
  const MAXMS=5*60*1000, MAXV=4;
  const recs={};
  let mrec=null, mstream=null, mchunks=[], t0=0, mtick=null, recTopic=null;
  const recDone=[];
  function fmt(ms){ const s=Math.floor(ms/1000); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
  $$('[data-rec]').forEach(root=>{
    const r={root,btn:root.querySelector('.recbtn'),title:root.querySelector('.rtitle'),timer:root.querySelector('.rtimer'),list:root.querySelector('.vlist'),hint:root.querySelector('.rhint')};
    r.idleTitle=r.title.textContent; r.idleTimer=r.timer.textContent;
    recs[root.dataset.rec]=r;
    r.btn.addEventListener('click',()=>toggleRec(root.dataset.rec));
    r.list.addEventListener('click',e=>{
      const b=e.target.closest('.vdel'); if(!b)return;
      const i=voices.findIndex(v=>v.id===+b.dataset.id); if(i<0)return;
      URL.revokeObjectURL(voices[i].url); blobs.del(voices[i].id); voices.splice(i,1); renderVoices(); applyConds(); refresh();
    });
  });
  function vHint(topic,t,html){ const h=recs[topic].hint; if(html) h.innerHTML=t; else h.textContent=t||''; }
  function setRecUI(topic,on){
    const r=recs[topic];
    r.btn.classList.toggle('rec',on);
    r.btn.setAttribute('aria-label',on?I.recStop:I.recStart);
    r.title.textContent=on?I.recOn:r.idleTitle;
    if(!on) r.timer.textContent=r.idleTimer;
  }
  function renderVoices(){
    Object.keys(recs).forEach(t=>{
      const box=recs[t].list; box.innerHTML='';
      voices.filter(v=>v.topic===t).forEach(v=>{
        const d=document.createElement('div'); d.className='vitem';
        d.innerHTML='<audio controls src="'+v.url+'"></audio><span class="vdur">'+fmt(v.dur)+'</span><button type="button" class="vdel" data-id="'+v.id+'" aria-label="'+I.delRec+'">'+icon('x')+'</button>';
        box.appendChild(d);
      });
    });
    const hasBiz=coveringVoices().some(v=>v.topic==='business');
    $$('.voicenote').forEach(p=>p.hidden=!hasBiz);
  }
  // Resolves once the active recording (if any) is stopped and saved
  function stopRec(){
    return new Promise(res=>{
      if(!recTopic||!mrec||mrec.state==='inactive') return res();
      recDone.push(res); mrec.stop();
    });
  }
  // In-app browsers (Instagram, Facebook, TikTok…) usually block the microphone
  const IN_APP=/Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Bytedance/i.test(navigator.userAgent);
  const TG_LINK='<a href="'+TG_URL+'" target="_blank" rel="noopener">@altynclick</a>';
  const NO_MIC_TIP=I.noMicTip(TG_LINK);
  async function toggleRec(topic){
    if(recTopic){
      if(recTopic===topic) stopRec();
      else vHint(topic,I.stopFirst);
      return;
    }
    if(voices.length>=MAXV){ vHint(topic,I.maxRec(MAXV)); return; }
    if(!window.isSecureContext||!window.MediaRecorder||!navigator.mediaDevices){ vHint(topic,I.noRec+NO_MIC_TIP,true); return; }
    try{ mstream=await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch(e){
      vHint(topic,IN_APP?I.inAppMic+NO_MIC_TIP:I.allowMic(TG_LINK),true);
      return;
    }
    let mime=''; ['audio/webm;codecs=opus','audio/webm','audio/mp4'].forEach(m=>{ if(!mime&&MediaRecorder.isTypeSupported(m))mime=m; });
    mchunks=[]; recTopic=topic;
    mrec=new MediaRecorder(mstream,mime?{mimeType:mime}:undefined);
    mrec.ondataavailable=e=>{ if(e.data.size)mchunks.push(e.data); };
    mrec.onstop=()=>{
      clearInterval(mtick);
      if(mstream)mstream.getTracks().forEach(t=>t.stop());
      const dur=Math.min(MAXMS,Date.now()-t0);
      const blob=new Blob(mchunks,{type:mrec.mimeType||mime||'audio/webm'});
      const v={id:++vid,topic,blob,url:URL.createObjectURL(blob),dur};
      voices.push(v); storeVoice(v);
      recTopic=null; setRecUI(topic,false); renderVoices(); clearErr(); hideWarn(); applyConds(); refresh();
      const short=VOICE_COVERS[topic]&&dur<VOICE_MIN;
      vHint(topic,short?I.recShort:(voices.length<MAXV?I.recDone:I.recDoneLast));
      recDone.splice(0).forEach(f=>f());
    };
    mrec.start(); t0=Date.now(); setRecUI(topic,true); vHint(topic,'');
    mtick=setInterval(()=>{ const ms=Date.now()-t0; recs[topic].timer.textContent=fmt(ms)+' · '+I.upTo5; if(ms>=MAXMS&&mrec.state!=='inactive')mrec.stop(); },250);
  }

  /* ---------- Turnstile (bot check) ---------- */
  let tsId=null, tsToken='', tsWaiter=null;
  const tsReady=()=>!!(window.turnstile&&typeof window.turnstile.render==='function');
  function tsDeliver(t){ if(tsWaiter){ const w=tsWaiter; tsWaiter=null; w(t); } }
  function tsRender(){
    if(tsId!==null||!tsReady()) return;
    tsId=window.turnstile.render('#tsBox',{
      sitekey:TS_SITEKEY, appearance:'interaction-only', execution:'execute', language:I.tsLang,
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
    // A recording still running is finished and attached, not silently ignored
    if(recTopic){ sending=true; await stopRec(); sending=false; saveDraft(); }
    clearErr(); hideWarn();
    // Re-check every step: answers may have changed after it was passed (e.g. a voice note deleted)
    for(const st of STEPS){
      const is=stepIssue(st.n);
      if(is){ go(st.n); showIssue(is); return; }
    }
    sending=true;
    const btn=$('#btnNext'), txt=$('#btnNextText');
    txt.textContent=I.sendingTxt; btn.style.opacity=.7; btn.disabled=true;
    const fail=msg=>{ showWarn(msg,true); txt.textContent=I.send; btn.style.opacity=1; btn.disabled=false; sending=false; };
    try{
      const token=await getToken();
      if(!token) return fail(I.errCaptchaLoad);
      const data={};
      Object.keys(LABELS).forEach(k=>{ const v=collectVal(k); if(v)data[k]=v; });
      const skipped=optionalLeft().map(s=>s.t+': '+s.fields.map(f=>lc(LABELS[f])).join(', '));
      const fd=new FormData();
      fd.append('payload',JSON.stringify({lang:LANG,mode,trusted,skipped,voiceTopics:voices.map(v=>v.topic),hp:($('#hp')?$('#hp').value:''),data}));
      fd.append('cf-turnstile-response',token);
      voices.forEach((v,i)=>fd.append('voice',v.blob,'voice_'+(i+1)+(/mp4|aac/.test(v.blob.type)?'.m4a':'.webm')));
      files.forEach(f=>fd.append('file',f.blob,f.name));
      const r=await fetch('/api/submit',{method:'POST',body:fd});
      const j=await r.json().catch(()=>({}));
      tsReset();
      if(!(r.ok&&j.ok)) throw new Error(j.error||'bad');
      savedCopy=answersText();
      const contact=$('#f-contact').value.trim();
      $('#doneTo').textContent=contact?I.doneTo(contact):'';
      clearDraft();
      $('#formWrap').classList.add('hidden');
      $('#done').classList.remove('hidden');
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(e){
      tsReset();
      fail(e.message==='captcha'?I.errCaptcha:e.message==='too_large'?I.errLarge:I.errSend);
    }
  }

  $('#btnAgain').addEventListener('click',()=>location.reload());

  /* ---------- start ---------- */
  const restored=restore();
  Object.keys(chipBoxes).forEach(syncChips);
  TRUSTABLE.forEach(n=>setTrusted(n,trusted[n]));
  applyPlaceholders();
  renderVoices(); renderFiles();
  setMode(mode);
  go(1,{noFocus:true});
  restoreBlobs().then(had=>{
    if(had){ renderVoices(); renderFiles(); applyConds(); refresh(); }
    if(!restored&&!had) return;
    $('#restoreBar').hidden=false;
    // Resume where the client left off, but never past a step that still needs answers
    let t=restored?restored.cur:1;
    for(let i=1;i<t;i++){ if(stepIssue(i)){ t=i; break; } }
    if(t!==1) go(t,{noFocus:true});
  });
})();
