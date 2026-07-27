# Supabase + Vercel Setup

## 1. Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. In **Authentication > Sign In / Providers**, enable **Email** sign-ins.
4. For a small private beta, you can turn off email confirmation in
   **Authentication > Sign In / Providers > Email** so newly created accounts can sign in
   immediately. If confirmation stays on, users must verify their email before logging in.
5. Copy these values from **Project Settings > API**:
   - Project URL
   - anon public key

Add them to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

`supabase/schema.sql` also creates the private `ai_rate_limit_buckets` table and
the atomic `consume_ai_rate_limit` function. Production AI endpoints fail
closed when this quota function or its server-only salt is missing.

The app uses Supabase Auth email/password accounts plus `app_state_snapshots` for MVP cloud
persistence. It stores each account's app state as user-owned JSONB under Supabase RLS, keyed by
`(user_id, profile_id)`. This keeps the existing string-based equipment and exercise IDs intact
while the normalized tables are available for the next migration step.

If you already ran an older schema where `app_state_snapshots.user_id` was the only primary key,
run this once in SQL Editor before syncing multiple profiles:

```sql
alter table app_state_snapshots
  add column if not exists profile_id text not null default 'default',
  add column if not exists profile_name text not null default '사용자';

alter table app_state_snapshots drop constraint if exists app_state_snapshots_pkey;
alter table app_state_snapshots add primary key (user_id, profile_id);
```

## 2. Vercel

Set these environment variables in Vercel:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.5
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
AI_GUEST_ACCESS_ENABLED=false
AI_RATE_LIMIT_SALT=use_a_random_server_only_value_of_at_least_16_characters
AI_RATE_LIMIT_BACKEND=supabase
```

Keep guest AI disabled for the public portfolio unless anonymous OpenAI spend
is intentional. The guest UI still works through the deterministic local
planner. If guest AI is enabled, anonymous clients share a strict IP quota.
`AI_RATE_LIMIT_BACKEND=memory` is only suitable for local development; it is
not a cross-instance production quota.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and is used only for the atomic
quota RPC. Never prefix it with `NEXT_PUBLIC_`, expose it to the browser, or
commit it. The quota table and function are not executable by `anon` or
`authenticated` roles.

Use the Vercel dashboard or CLI:

```bash
npx vercel link
npx vercel env add OPENAI_API_KEY
npx vercel env add OPENAI_MODEL
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
npx vercel env add SUPABASE_SERVICE_ROLE_KEY
npx vercel env add AI_GUEST_ACCESS_ENABLED
npx vercel env add AI_RATE_LIMIT_SALT
npx vercel env add AI_RATE_LIMIT_BACKEND
npx vercel --prod
```

After deployment, verify that:

1. a guest can create a deterministic plan without an OpenAI request;
2. an unauthenticated direct `POST /api/ai/training-focus` returns `401`;
3. an authenticated request returns rate-limit headers;
4. malformed JSON, wrong media type, and oversized bodies return consistent
   `4xx` error envelopes;
5. Vercel logs contain request IDs and safe error codes, not check-in, InBody,
   nutrition, or provider-error payloads.

## 3. Local Verification

After adding Supabase env vars locally:

```bash
npm run lint
npm run typecheck
npm test
npm run evaluate
npm run build
npm run dev
```

Then create or log into an account. Open `/settings`, use **Supabase 클라우드 동기화**, and run:

1. 세션 확인
2. 클라우드에 업로드
3. Refresh or open another browser, then 클라우드에서 복원
