
## Analysis of the uploaded project

`agent-atlas-27-main.zip` is a TanStack Start app whose entire backend is **Supabase** (auth + Postgres + RLS) plus the **Lovable AI Gateway** (Gemini). Specifically:

- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts` — all use `@supabase/supabase-js` and Supabase JWTs.
- `src/integrations/lovable/index.ts` uses `@lovable.dev/cloud-auth-js` to perform **Google OAuth** and then hands the tokens to `supabase.auth.setSession(...)`.
- `src/routes/auth.tsx`, `_authenticated/route.tsx` use `supabase.auth.getSession()` / `onAuthStateChange`.
- `src/lib/*.functions.ts` and `rag.functions.ts` query Postgres through `supabase.from(...)` with RLS policies defined in `supabase/migrations/*.sql` (uses `auth.uid()`, `auth.users` FKs, `pgvector`, an `app_role` enum, a `has_role` security-definer fn, triggers on `auth.users`, etc.).
- `src/lib/ai-gateway.server.ts` calls `https://ai.gateway.lovable.dev` with `LOVABLE_API_KEY`.
- `.env` points to a hosted Supabase project (`ryjncgtniswoiksutnpe.supabase.co`).

## Why "raw local Postgres only" is not viable as a minimum change

The user's two requirements conflict if we strip Supabase out:

1. *Keep all existing features and Google Sign-In.*
2. *Replace backend with local Postgres.*

Raw Postgres has no auth server, no Google OAuth, no JWT issuance, no RLS-with-`auth.uid()`, no Storage. Removing Supabase would require rewriting every `supabase.from(...)` call, the entire auth flow, all RLS policies, the `auth.users` FKs in migrations, the auth middleware, and the OAuth callback handling — i.e. a rewrite, not a minimum change, and it would break Google Sign-In.

The genuine minimum-change path is the **Supabase CLI local stack**, which runs locally in Docker and provides:

- Local Postgres (the "local PostgreSQL" the user asked for) on `localhost:54322`
- Local GoTrue auth server with Google OAuth on `localhost:54321`
- Auto-applies the existing `supabase/migrations/*.sql`
- Uses the same `@supabase/supabase-js` client code unchanged

Only **env vars and a few config values** change. All app code, routes, UI, and features stay intact.

## Files that will be modified / added (minimum set)

| File | Change | Why |
|---|---|---|
| Whole project tree under `/dev-server` | Replace scaffold with the uploaded ZIP (excluding any `.git`) | The current `/dev-server` is the blank Lovable template; user said the ZIP is source of truth |
| `.env` (and `.env.local`) | Repoint `VITE_SUPABASE_URL` → `http://127.0.0.1:54321`, `VITE_SUPABASE_PUBLISHABLE_KEY` → the local anon key printed by `supabase start`; add `SUPABASE_SERVICE_ROLE_KEY` (local), `LOVABLE_API_KEY` placeholder | Fix "localhost / database / auth" — point client + server to the local stack |
| `supabase/config.toml` | Expand from the current 1-line stub to a real config: `site_url = "http://localhost:8080"`, `additional_redirect_urls = ["http://localhost:8080/**"]`, enable `[auth.external.google]` with `client_id`/`secret` env refs | Fix "redirect / callback / CORS" for Google Sign-In against the local GoTrue |
| `src/integrations/lovable/index.ts` | Replace the `@lovable.dev/cloud-auth-js` shim with a thin wrapper that calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` | The Lovable cloud-auth service can't issue tokens for a local Supabase; standard `supabase-js` OAuth works against local GoTrue and keeps the same `lovable.auth.signInWithOAuth("google", …)` call site in `auth.tsx` unchanged |
| `src/routes/__root.tsx` (1 line) | Add `notFoundComponent` already exists — verify; no UI change | Confirms the existing 404 page works on localhost (no code change expected unless missing) |
| `README.localhost.md` (new) | Step-by-step: `supabase start`, set Google `client_id`/`secret` envs, `bun install`, `bun dev` | So the user can actually run it |

No UI files, no route files, no business-logic files, no migrations are modified. The AI Gateway code is left alone — it will work as soon as `LOVABLE_API_KEY` is set; otherwise AI-powered features return a clear error (unchanged behavior).

## What the user has to provide once

- Docker running locally (required by `supabase start`).
- A Google OAuth Client ID + Secret (Google Cloud Console → OAuth client → Web app → Authorized redirect URI `http://127.0.0.1:54321/auth/v1/callback`). These get exported as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `…_SECRET` before `supabase start`.
- Optional: `LOVABLE_API_KEY` if they want the Gemini-powered RAG/agent features to run locally.

## Out of scope (per "do not redesign / rewrite unrelated parts")

- No changes to `src/routes/_authenticated/*`, `dashboard.tsx`, `topics.$topicId.tsx`, `auth.tsx` UI, `PaperChat.tsx`, `AppNav.tsx`, `*.functions.ts`, `rag.functions.ts`, `ai-gateway.server.ts`, styles, components, or migrations.
- No swap of Supabase for raw `pg`/Drizzle/Prisma.
- No removal of RLS or `auth.users` FKs.

## Confirm before I proceed

Two things to confirm so I don't waste your turn:

1. **OK to use the local Supabase CLI stack** (Docker-backed local Postgres + GoTrue) as the "local PostgreSQL" target? This is the only path that satisfies "keep all features + keep Google Sign-In + minimum changes".
2. **OK to overwrite `/dev-server` with the ZIP contents** (excluding any `.git`)? The current sandbox is the blank scaffold; the ZIP becomes the source of truth as you requested.

If both are yes, I'll execute the file-set above with no other changes.
