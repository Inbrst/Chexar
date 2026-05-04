# Chexar Vercel Deployment

Chexar is a Telegram Mini App. One Vercel deployment and one Supabase project are used for all testers. User data is separated by Telegram user id.

## Vercel Environment Variables

1. Open the Vercel project.
2. Go to `Settings` -> `Environment Variables`.
3. Add:

```env
VITE_SUPABASE_URL=https://tootikpapwqqhgaqwnfv.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase Publishable key>
```

4. Use the Supabase Publishable key only.
5. Do not use the Supabase Secret key.
6. Apply the variables to `Production`, `Preview`, and `Development` if Vercel shows those scopes.
7. Redeploy the latest deployment after adding or changing env variables.

Vite exposes only variables prefixed with `VITE_` to the frontend build. The app reads exactly:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Telegram Tester Behavior

- All testers use the same Vercel deployment.
- All testers use the same Supabase project.
- The app reads Telegram identity from `window.Telegram.WebApp.initDataUnsafe.user`.
- `initDataUnsafe.user.id` is stored as `users.telegram_id`.
- App data is scoped by the internal `users.id` linked to that `telegram_id`.
- Testers should open the app through Telegram Mini App, not only by direct browser link.
- Browser fallback is only for local development and Vercel preview checks.

## Supabase Notes

The MVP does not use Supabase Auth and does not have email/password login. User identity comes from Telegram.

For the current MVP setup, the tables must allow frontend reads/writes with the Publishable key. If RLS is enabled without policies, user bootstrap will fail. Apply the migration in `supabase/migrations/20260504001000_disable_rls_for_mvp.sql` or equivalent SQL until app-level Telegram verification and RLS policies are added.

## Production Diagnostics

If Vercel env variables are missing, the app shows:

```text
Supabase env не настроен на Vercel.
```

If env variables exist but a query fails, the app shows:

```text
Supabase подключен, но запрос не прошел. Проверь таблицы или доступ.
```
