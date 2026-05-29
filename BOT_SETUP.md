# Chexar Telegram Bot Setup

## Required environment variable

- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL` / `VITE_SUPABASE_URL` for the same Supabase project used by the Mini App
- `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` for AI task creation in Telegram. If it is missing, the bot uses a local fallback parser.

Optional:

- `CRON_SECRET` for `/api/telegram/reminders`
- `CHEXAR_TIME_ZONE`, default: `Europe/Berlin`

Apply the Supabase migration:

- `supabase/migrations/20260518000000_add_telegram_bot_settings.sql`

## Webhook URL

https://chexar.vercel.app/api/telegram/webhook

## Set webhook

Open this URL after replacing `<TELEGRAM_BOT_TOKEN>` with the bot token:

https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://chexar.vercel.app/api/telegram/webhook

## Test /start

1. Open the Telegram bot chat.
2. Send `/start`.
3. Confirm the bot replies with `Chexar connected ✅` and shows the `Open Chexar` Mini App button.

## Test bot actions

1. Open Chexar through the Telegram Mini App.
2. Go to Profile and enable `Telegram-бот`.
3. In the bot chat, send `/today`.
4. Try:
   - `Отметь вода`
   - `+10 чтение`
   - `Создай задачи: 1. Вода 2. Чтение 20 страниц`

## Reminders

Vercel Cron calls:

https://chexar.vercel.app/api/telegram/reminders

The schedule is configured in `vercel.json` as `0 6 * * *`.
