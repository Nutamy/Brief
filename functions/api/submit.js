// functions/api/submit.js — пересылка брифа в Telegram
const LABELS = {
  name:'Имя', contact:'Контакт', bizname:'Бизнес', socials:'Instagram / 2ГИС',
  activity:'Чем занимается', city:'Город', clients:'Клиенты', avgcheck:'Средний чек',
  diff:'Особенности', services:'Услуги / товары', top:'Продвигаем в первую очередь',
  faq:'Частые вопросы', sources:'Откуда клиенты', goals:'Цель сайта',
  examples:'Нравятся примеры', notneed:'Не нужно на сайте', has:'Есть из материалов',
  domain:'Домен', opts:'Доп. опции', terms:'Сроки'
};
const SECTIONS = [
  { n:2, t:'О бизнесе',           keys:['activity','city','clients','avgcheck','diff'] },
  { n:3, t:'Услуги и продажи',    keys:['services','top','faq','sources'] },
  { n:4, t:'Пожелания к сайту',   keys:['goals','examples','notneed','has','domain'] },
  { n:5, t:'Опции',               keys:['opts','terms'] }
];

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const json = (o, s=200) => new Response(JSON.stringify(o), { status:s, headers:{'content-type':'application/json'} });

export async function onRequestPost({ request, env }) {
  const TOKEN = env.TELEGRAM_BOT_TOKEN;
  const CHAT  = env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT) return json({ ok:false, error:'no_config' }, 500);

  let form;
  try { form = await request.formData(); }
  catch(e){ return json({ ok:false, error:'form' }, 400); }

  let p;
  try { p = JSON.parse(form.get('payload') || '{}'); }
  catch(e){ return json({ ok:false, error:'payload' }, 400); }

  // honeypot: боты заполняют скрытое поле — молча «успешно» выходим
  if (p.hp) return json({ ok:true });

  const files = [...form.getAll('voice')].filter(f => f && f.size > 0);
  const d = p.data || {};
  const trustedN = new Set(Object.entries(p.trusted || {}).filter(([,v]) => v).map(([k]) => +k));

  const L = [];
  L.push('🟡 <b>Новый бриф — altyn·click</b>');
  L.push('');
  L.push('👤 <b>Имя:</b> ' + (esc(d.name) || '—'));
  L.push('📞 <b>Контакт:</b> ' + (esc(d.contact) || '—'));
  if (d.bizname) L.push('🏪 <b>Бизнес:</b> ' + esc(d.bizname));
  if (d.socials) L.push('🔗 <b>Соцсети:</b> ' + esc(d.socials));
  L.push('⚙️ <b>Режим:</b> ' + (p.mode === 'fast' ? 'быстрый ⚡️' : 'подробный 📋'));
  if (p.trustAll) L.push('✨ <b>Доверяет решения: да</b>');

  for (const s of SECTIONS) {
    L.push('');
    if (trustedN.has(s.n)) { L.push('✨ <b>' + s.t + '</b> — доверено мне'); continue; }
    L.push('<b>— ' + s.t + ' —</b>');
    let any = false;
    for (const k of s.keys) {
      if (d[k]) { L.push('• <b>' + LABELS[k] + ':</b> ' + esc(d[k])); any = true; }
    }
    if (!any) L.push('• (пусто)');
  }

  const vCount = Math.max(p.voicesCount || 0, files.length);
  if (vCount > 0) { L.push(''); L.push('🎙 <b>Голосовых:</b> ' + vCount); }

  L.push('');
  L.push('🗓 ' + new Intl.DateTimeFormat('ru-RU', { dateStyle:'short', timeStyle:'short', timeZone:'Asia/Almaty' }).format(new Date()));

  let text = L.join('\n');
  if (text.length > 3900) text = text.slice(0, 3890) + '…\n(обрезано)';

  const msg = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode:'HTML', disable_web_page_preview:true })
  });
  if (!msg.ok) return json({ ok:false, error:'telegram' }, 502);

  // голосовые: сначала пробуем как voice, при отказе — документом (ничего не теряется)
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let fd = new FormData();
    fd.append('chat_id', CHAT);
    fd.append('voice', f, `voice_${i+1}.ogg`);
    fd.append('caption', `🎙 Голосовое от ${esc(d.name) || 'клиента'}`);
    let r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendVoice`, { method:'POST', body: fd });
    if (!r.ok) {
      let fd2 = new FormData();
      fd2.append('chat_id', CHAT);
      fd2.append('document', f, `voice_${i+1}.webm`);
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method:'POST', body: fd2 });
    }
  }

  return json({ ok:true });
}