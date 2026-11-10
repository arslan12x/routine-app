# Deploy (all free)

1. **GitHub**: create a private repo, push this folder.
2. **Supabase**: New project (pick the region nearest your users, e.g. Mumbai). Save the DB password.
   Dashboard > Connect: copy the *Transaction pooler* string (port 6543) -> `DATABASE_URL`
   and the *Session pooler* string (port 5432) -> `DIRECT_URL`. Do not add `?sslmode=`.
3. **Vercel**: Import the GitHub repo. Add `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `INITIAL_ADMIN_USERNAME`, and `INITIAL_ADMIN_PASSWORD` in Project Settings > Environment Variables.
   Set `BETTER_AUTH_URL` to the stable production domain assigned to the app. Use a unique, strong admin password;
   never commit credentials. Deploy; the build runs `prisma migrate deploy`.
4. **Create the admin account**: from the project folder, configure `.env` with the production Supabase URLs and
   the same `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD`, then run `npm run db:seed`. This stores a password
   hash in the database; it does not store the plaintext password.
5. **Create users** at `/admin` using a username and temporary password. Share passwords privately.
   **Install**: iPhone Safari > Share > Add to Home Screen; Android Chrome > Install app.

## Daily push reminders

The app can send reminders at **9 PM, 10 PM, and 11 PM in each user's saved timezone**, only while that user still has scheduled tasks incomplete. Notifications are registered per device, so enable them separately on every phone or browser.

1. Generate a VAPID key pair in the project folder:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Add these Vercel production environment variables:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — the generated public key
   - `VAPID_PRIVATE_KEY` — the generated private key (keep it secret)
   - `VAPID_SUBJECT` — a contact such as `mailto:you@example.com`
   - `REMINDER_CRON_SECRET` — a long, random secret; use the same value in Supabase Vault below

   Redeploy after setting them. Do not commit the private key or scheduler secret.
2. In the Supabase SQL Editor, enable the scheduler and HTTP extensions:
   ```sql
   create extension if not exists pg_cron with schema pg_catalog;
   create extension if not exists pg_net with schema extensions;
   ```
3. Store your stable Vercel app URL and the exact `REMINDER_CRON_SECRET` value from Vercel in Supabase Vault. Replace the placeholders; do not put real secrets in source control:
   ```sql
   select vault.create_secret('https://your-production-domain.vercel.app', 'routine_app_url');
   select vault.create_secret('replace-with-the-same-random-secret-as-vercel', 'routine_reminder_secret');
   ```
4. Schedule the protected endpoint once per minute. The endpoint only sends during the first five minutes of a user's 9 PM, 10 PM, or 11 PM local hour, and records each device/hour to prevent concurrent duplicate sends:
   ```sql
   select cron.schedule(
     'routine-task-reminders',
     '* * * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'routine_app_url') || '/api/cron/reminders',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'routine_reminder_secret'),
         'Content-Type', 'application/json'
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 10000
     );
     $$
   );
   ```
5. Sign in on each device, open **Settings**, and select **Enable on this device**. Allow notifications when prompted. On iPhone, use iOS 16.4 or newer and install the app from Safari with **Share > Add to Home Screen** first.

To confirm or remove the scheduled job, use Supabase SQL Editor:
```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'routine-task-reminders';
select cron.unschedule(jobid) from cron.job where jobname = 'routine-task-reminders';
```
