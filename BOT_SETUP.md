# Chexar Telegram Bot Setup

## Required environment variable

- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL` / `VITE_SUPABASE_URL` for the same Supabase project used by the Mini App
- `SUPABASE_SERVICE_ROLE_KEY` or `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` for AI task creation in Telegram. If it is missing, the bot uses a local fallback parser.
- `TELEGRAM_WEBHOOK_SECRET`, a random 32+ character value using only `A-Z`, `a-z`, `0-9`, `_`, and `-`
- `CRON_SECRET`, a separate random 32+ character value for `/api/telegram/reminders`
- `CHEXAR_TIME_ZONE`, default: `Europe/Berlin`

Apply the Supabase migration:

- `supabase/migrations/20260518000000_add_telegram_bot_settings.sql`

## Webhook URL

https://chexar.vercel.app/api/telegram/webhook

## Set webhook

Configure `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET` in Vercel before merging or deploying the ingress hardening change.
Then register the production webhook with the exact same `TELEGRAM_WEBHOOK_SECRET` value:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/setWebhook" `
  -Body @{
    url = "https://chexar.vercel.app/api/telegram/webhook"
    secret_token = $env:TELEGRAM_WEBHOOK_SECRET
    allowed_updates = '["message","callback_query","pre_checkout_query"]'
  }
```

Do not use `drop_pending_updates=true`. Confirm the configured URL before deployment:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "https://api.telegram.org/bot$env:TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

The webhook rejects Telegram updates when `TELEGRAM_WEBHOOK_SECRET` is missing or does not match the
`X-Telegram-Bot-Api-Secret-Token` request header. The reminders endpoint also rejects every request when
`CRON_SECRET` is missing. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when the
Production environment variable is configured.

For local API testing, set both secrets in `.env.local`. A production bot can point to only one webhook URL,
so use synthetic requests or a separate test bot for preview deployment QA.

### Rollback

Roll back the Vercel deployment before removing either environment variable or changing the Telegram webhook.
The previous Chexar webhook ignores the additional secret header, so keeping `secret_token` configured is safe
during rollback.

## Test /start

1. Open the Telegram bot chat.
2. Send `/start`.
3. Confirm the bot replies with `Chexar connected ✅` and shows the `Open Chexar` Mini App button.

## Test bot actions

1. Open Chexar through the Telegram Mini App.
2. Go to Profile and enable `Telegram-бот`.
3. In the bot chat, send `/menu` or `/today`.
4. Try:
   - `Отметь вода`
   - `+10 чтение`
   - `Создай задачи: 1. Вода 2. Чтение 20 страниц`

## Bot menu

The bot exposes:

- `/menu` — main button menu
- `/today` — today's tasks and quick action buttons
- `/create` — creation examples
- `/help` — short help
- `/settings` — profile/settings entry

## Reminders

Vercel Cron calls:

https://chexar.vercel.app/api/telegram/reminders

The schedule is configured in `vercel.json` as `0 6 * * *`.
