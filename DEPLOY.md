# Deploy (all free)

1. **GitHub**: create a private repo, push this folder.
2. **Supabase**: New project (pick the region nearest your users, e.g. Mumbai). Save the DB password.
   Dashboard > Connect: copy the *Transaction pooler* string (port 6543) -> `DATABASE_URL`
   and the *Session pooler* string (port 5432) -> `DIRECT_URL`. Do not add `?sslmode=`.
3. **Google OAuth**: console.cloud.google.com > new project > APIs & Services > OAuth consent screen (External;
   scopes openid/email/profile only; publish to Production) > Credentials > OAuth client ID (Web).
   Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` and
   `https://<your-app>.vercel.app/api/auth/callback/google`.
4. **Vercel**: Import the GitHub repo. Add env vars from `.env.example` (`BETTER_AUTH_URL` = your Vercel URL).
   Deploy. The build runs `prisma migrate deploy`.
5. **GitHub Actions secrets**: `APP_URL` (your Vercel URL), `BACKUP_DB_URL` (the session-pooler string).
6. **Invite friends** at `/admin`. **Install**: iPhone Safari > Share > Add to Home Screen; Android Chrome > Install app.
