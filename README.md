
### Страницы

| Файл | Что это | Кому показываем |
|---|---|---|
| `index.html` | Продающий лендинг: услуги, кейсы, оффер 120 000 ₸ | Всем, кто пришёл из 2ГИС, соцсетей, сарафана |
| `brief.html` | Бриф клиента: режимы «Быстро/Подробно», голосовые записи, галочка «Доверяю решение вам» | Тем, кто готов заказать сайт |

---

## 🚀 Деплой на Cloudflare Pages

⚠️ **Важно:** Pages Functions работают только при деплое через **Git** или **Wrangler**.
Загрузка папки через drag-and-drop в дашборде **не подхватит** `functions/` — форма отправлять не будет.

### Вариант 1 — через Git (рекомендую)

1. Запушьте репозиторий на GitHub
2. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**
3. Выберите репозиторий → настройки сборки оставьте по умолчанию (Build command: пусто, Output: `/`)
4. Сохраните → сайт доступен по адресу вида `имя-проекта.pages.dev`

### Вариант 2 — через Wrangler

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=altyn-click
---

## 🛡 Структура и безопасность

| Файл | Назначение |
|---|---|
| `index.html` | Разметка брифа (без инлайн-скриптов — требование CSP) |
| `assets/brief.js` | Логика формы |
| `assets/brief.css` | **Собранный** Tailwind + стили (не править вручную) |
| `src/brief.css`, `tailwind.config.js` | Исходники стилей |
| `build.mjs` | Сборка CSS + версии файлов (`?v=хеш`) в `index.html` |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | Иконки |
| `_headers` | Заголовки безопасности Cloudflare Pages (CSP, HSTS и др.) |
| `functions/api/submit.js` | Приём брифа → Telegram (лимиты, проверка Origin) |

### Сборка после любых правок `index.html`, `src/brief.css` или `assets/brief.js`

```bash
node build.mjs
```

Скрипт пересобирает CSS и проставляет в `index.html` новые `?v=…` у CSS и JS.
Без этого новые классы не появятся, а браузеры могут показать старую версию файлов (они кешируются на год).

### Кеш и черновики

- `index.html` всегда перепроверяется браузером (`Cache-Control: no-cache` в `_headers`) — обновление видно сразу после деплоя.
- Черновик брифа хранится в `localStorage` под ключом `altyn_brief_v<SCHEMA>`. **Меняете поля или варианты ответов — увеличьте `SCHEMA` в `assets/brief.js`**: старые черновики удалятся и не перебьют новую форму. Черновики старше 30 дней удаляются автоматически.

### Секреты

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` и `TURNSTILE_SECRET_KEY` — только в **Settings → Variables and Secrets** проекта Pages (тип *Secret*). В репозиторий не коммитить.

Site key Turnstile (публичный) прописан в `assets/brief.js` → `TS_SITEKEY`. В настройках виджета Turnstile должен быть указан домен сайта (`*.pages.dev` / свой домен).
