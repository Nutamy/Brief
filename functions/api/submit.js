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

// Abuse limits: the endpoint is public, so every input is bounded
const MAX_BODY    = 50 * 1024 * 1024;  // whole multipart request
const MAX_PAYLOAD = 64 * 1024;         // JSON with text answers
const MAX_FIELD   = 2000;              // mirrors maxlength in the form
const MAX_FILES   = 3;                 // mirrors MAXV in the recorder
const MAX_FILE    = 15 * 1024 * 1024;  // 5 min of opus/aac is far below this
const TG_LIMIT    = 4000;              // Telegram hard limit is 4096

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const str = (v, max = MAX_FIELD) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const json = (o, s=200) => new Response(JSON.stringify(o), {
  status:s, headers:{ 'content-type':'application/json', 'cache-control':'no-store' }
});

// Accept only browser requests from this same site
function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; }
  catch { return false; }
}

// Split on line boundaries so no HTML tag or entity is ever cut in half
function chunks(lines) {
  const out = []; let cur = '';
  for (const line of lines) {
    const next = cur ? cur + '\n' + line : line;
    if (next.length > TG_LIMIT && cur) { out.push(cur); cur = line; }
    else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

const plain = html => html.replace(/<[^>]+>/g, '')
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');

async function tg(token, method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, body instanceof FormData
      ? { method:'POST', body }
      : { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) });
    return r.ok;
  } catch { return false; }
}

async function sendText(token, chat, text) {
  const base = { chat_id: chat, link_preview_options:{ is_disabled:true } };
  if (await tg(token, 'sendMessage', { ...base, text, parse_mode:'HTML' })) return true;
  // HTML rejected (e.g. an oversized line) — deliver as plain text rather than lose the lead
  return tg(token, 'sendMessage', { ...base, text: plain(text).slice(0, 4096) });
}

function voiceName(type, i) {
  const ext = type.includes('mp4') || type.includes('aac') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
  return `voice_${i + 1}.${ext}`;
}

export async function onRequestPost({ request, env }) {
  const TOKEN = env.TELEGRAM_BOT_TOKEN;
  const CHAT  = env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT) return json({ ok:false, error:'no_config' }, 500);

  if (!sameOrigin(request)) return json({ ok:false, error:'origin' }, 403);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ ok:false, error:'too_large' }, 413);

  let form;
  try { form = await request.formData(); }
  catch { return json({ ok:false, error:'form' }, 400); }

  const raw = form.get('payload');
  if (typeof raw !== 'string' || raw.length > MAX_PAYLOAD) return json({ ok:false, error:'payload' }, 400);
  let p;
  try { p = JSON.parse(raw); }
  catch { return json({ ok:false, error:'payload' }, 400); }
  if (!p || typeof p !== 'object') return json({ ok:false, error:'payload' }, 400);

  // honeypot: боты заполняют скрытое поле — молча «успешно» выходим
  if (p.hp) return json({ ok:true });

  const d = {};
  const src = p.data && typeof p.data === 'object' ? p.data : {};
  for (const k of Object.keys(LABELS)) d[k] = str(src[k], k === 'name' || k === 'contact' ? 200 : MAX_FIELD);
  if (!d.name || !d.contact) return json({ ok:false, error:'required' }, 400);

  const files = form.getAll('voice')
    .filter(f => f && typeof f === 'object' && f.size > 0 && f.size <= MAX_FILE && String(f.type).startsWith('audio/'))
    .slice(0, MAX_FILES);

  const trusted = p.trusted && typeof p.trusted === 'object' ? p.trusted : {};
  const trustedN = new Set(SECTIONS.map(s => s.n).filter(n => trusted[n] === true));

  const L = [];
  L.push('🟡 <b>Новый бриф — altyn·click</b>');
  L.push('');
  L.push('👤 <b>Имя:</b> ' + esc(d.name));
  L.push('📞 <b>Контакт:</b> ' + esc(d.contact));
  if (d.bizname) L.push('🏪 <b>Бизнес:</b> ' + esc(d.bizname));
  if (d.socials) L.push('🔗 <b>Соцсети:</b> ' + esc(d.socials));
  L.push('⚙️ <b>Режим:</b> ' + (p.mode === 'fast' ? 'быстрый ⚡️' : 'подробный 📋'));
  if (p.trustAll === true) L.push('✨ <b>Доверяет решения: да</b>');

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

  if (files.length) { L.push(''); L.push('🎙 <b>Голосовых:</b> ' + files.length); }

  L.push('');
  L.push('🗓 ' + new Intl.DateTimeFormat('ru-RU', { dateStyle:'short', timeStyle:'short', timeZone:'Asia/Almaty' }).format(new Date()));

  const parts = chunks(L);
  if (!(await sendText(TOKEN, CHAT, parts[0]))) return json({ ok:false, error:'telegram' }, 502);
  for (const part of parts.slice(1)) await sendText(TOKEN, CHAT, part);

  // голосовые: сначала пробуем как voice, при отказе — документом (ничего не теряется)
  const caption = ('🎙 Голосовое от ' + (d.name || 'клиента')).slice(0, 200);
  for (let i = 0; i < files.length; i++) {
    const f = files[i], name = voiceName(String(f.type), i);
    const fd = new FormData();
    fd.append('chat_id', CHAT);
    fd.append('voice', f, name);
    fd.append('caption', caption);
    if (await tg(TOKEN, 'sendVoice', fd)) continue;
    const fd2 = new FormData();
    fd2.append('chat_id', CHAT);
    fd2.append('document', f, name);
    fd2.append('caption', caption);
    if (!(await tg(TOKEN, 'sendDocument', fd2))) {
      await sendText(TOKEN, CHAT, `⚠️ Голосовое ${i + 1} от ${esc(d.name)} не доставлено — попросите прислать в Telegram.`);
    }
  }

  return json({ ok:true });
}
