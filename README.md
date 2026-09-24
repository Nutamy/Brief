
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