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
