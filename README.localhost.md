# Running Agent Atlas on localhost

This project's backend (Postgres + Auth + RLS) is Supabase. To run it
entirely on your machine we use the **Supabase CLI local stack**, which
spins up a real local PostgreSQL, a local GoTrue auth server (with
Google OAuth support), and applies the existing `supabase/migrations/`.

## Prerequisites

- Docker Desktop (or any Docker daemon) running.
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
  (`brew install supabase/tap/supabase` or see their docs).
- [Bun](https://bun.sh) installed.
- A Google OAuth Client (Web application) from
  <https://console.cloud.google.com/apis/credentials>.
  Add this **Authorized redirect URI**:
  `http://127.0.0.1:54321/auth/v1/callback`

## One-time setup

```bash
# 1. Install JS deps
bun install

# 2. Export your Google OAuth credentials so supabase/config.toml picks them up
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="xxxxxxxx.apps.googleusercontent.com"
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="GOCSPX-xxxxxxxx"

# 3. Boot the local Supabase stack (Postgres + Auth + Studio).
#    This applies every file under supabase/migrations/ automatically.
supabase start
```

`supabase start` prints something like:

```
        API URL: http://127.0.0.1:54321
         DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
     Studio URL: http://127.0.0.1:54323
       anon key: eyJhbGciOi...
service_role key: eyJhbGciOi...
```

If the printed `anon key` / `service_role key` differ from the defaults
in `.env`, replace `VITE_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env`
with the values from this output.

## Run the app

```bash
bun dev
# → http://localhost:8080
```

- Email/password sign-up + sign-in: works out of the box (email
  confirmation is disabled locally in `supabase/config.toml`).
- **Continue with Google**: redirects to Google, returns to
  `http://localhost:8080`, session is set automatically.
- 404s and route refreshes: handled by TanStack Router's
  `notFoundComponent` in `src/routes/__root.tsx`.
- CORS: not a concern in dev — the app and Supabase share
  `localhost`; no extra headers needed.

## Optional: AI features (RAG / agents)

The Gemini calls in `src/lib/ai-gateway.server.ts` use the Google
Gemini API directly via `@google/genai`. Set `GOOGLE_API_KEY` in
`.env` to enable them (get a key at
<https://aistudio.google.com/apikey>). Without the key, AI calls
return a clear `GOOGLE_API_KEY is not configured` error and the rest
of the app keeps working.

## Stopping / resetting

```bash
supabase stop          # stop the local stack
supabase db reset      # wipe DB and re-apply migrations
```

## What was changed for local mode

Only the minimum required:

- `.env` — points to `http://127.0.0.1:54321` instead of the hosted
  Supabase project; adds `SUPABASE_SERVICE_ROLE_KEY` and a
  `GOOGLE_API_KEY` slot.
- `supabase/config.toml` — full local config with `site_url`,
  `additional_redirect_urls`, and `[auth.external.google]` wired to
  env vars.
- `src/integrations/lovable/index.ts` — the cloud-auth broker shim
  now calls `supabase.auth.signInWithOAuth({ provider: "google", ... })`
  directly, so Google Sign-In works against the local GoTrue. The call
  signature used by `src/routes/auth.tsx` is unchanged.

No UI, routes, components, server functions, migrations, or business
logic were modified.