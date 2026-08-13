# FeedbackLoop

**AI-powered testimonial & review summarization SaaS with an embeddable testimonials widget.**

FeedbackLoop turns raw customer reviews into actionable insight. Paste 10–50 customer reviews (or upload a CSV), and a Groq-powered AI analysis produces a structured summary — key themes, sentiment, an impact matrix, and recommendations — which you can publish on your site as a public testimonials widget.

---

## What it does (features)

- **AI review analysis** — paste reviews or upload a CSV (10–50 reviews, up to 1,000 chars each) and get a rich AI summary: key themes, sentiment breakdown, impact matrix, and recommendations.
- **Saved summaries** — every analysis is stored and searchable with keyword matching and time-range filters; latest results appear on the dashboard.
- **Public testimonials widget** — each summary gets a unique `widget_id`; embed a small script tag on any website to render a customer-voice widget of the analyzed reviews.
- **Subscriptions** — Free / Pro plans billed through Lemon Squeezy (monthly $9 or yearly $90), with a customer billing portal and a fully webhook-driven lifecycle (activate, renew, fail, cancel, refund, expire).
- **Accounts** — email + password, Google OAuth, and magic-link (OTP) sign-in; email OTP sign-up with per-IP rate limiting.
- **Profile & business settings** — display name, avatar upload (resized to 256px, stored in private Supabase Storage), business name/website, password management.

---

## How it works — the three core flows

```
1) ANALYSIS        User (dashboard) ──► pasted reviews ──► Supabase Edge Function
                   (analyze-summaries, Groq LLM) ──► structured summary ──► saved
                   to `summaries` (credits deducted per the plan's quotas)

2) WIDGET          Business ──► copies embed script ──► visitor's site loads
                   /widget.js ──► calls /api/widget?widget_id=… ──► renders the
                   public testimonial widget (server-validated, XSS-safe)

3) SUBSCRIPTION    Customer ──► /api/lemon-squeezy/checkout ──► Lemon Squeezy
                   (pay) ──► signed webhook POSTs to /api/lemon-squeezy/webhook
                   ──► user's plan/status updated in `user_credits` + an entry
                   in `subscription_events` ──► feature access flips in the UI
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js **16.3** (App Router, Turbopack), React **19** |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + `tw-animate-css` |
| UI | shadcn-style components on **Base UI** (`@base-ui/react`), `lucide-react` icons, `framer-motion` |
| Data fetching | TanStack Query v5 |
| Backend / DB | **Supabase** — Postgres (RLS), Auth, Storage, Edge Functions (Deno) |
| AI | **Groq** (`llama-3.3-70b-versatile`) called from the `analyze-summaries` edge function |
| Payments | **Lemon Squeezy** (checkout, customer portal, signed webhooks via `standardwebhooks`) |
| Email | **Nodemailer + SMTP** (Gmail / transactional providers), driven by Supabase auth webhooks to `/api/send-email` |
| Tests | Vitest (unit tests for API routes) |
| Deploy | Vercel (`feedback-loop-delta.vercel.app`) |

---

## Repository structure

```
src/
  app/                     Next.js App Router
    (app)/                 Authenticated app shell (dashboard, profile, pricing,
                           summaries, results, settings)
    api/
      lemon-squeezy/       checkout, portal, webhook (payments)
      send-email/          SMTP sender for Supabase auth webhooks
      signup-otp/send      per-IP rate-limited OTP email send
      signup-otp/verify    OTP verification + account creation
      widget/              public widget data endpoint
    auth/callback/         OAuth / magic-link callback
    login, signup, forgot-password, update-password
  components/              UI components (ui/, insights/, header, sidebar, shell)
  lib/                     supabase clients, queries (react-query), avatar,
                           settings, otp, email, friendly-auth-error
  proxy.ts                 Next.js config for Supabase env inlining
supabase/
  functions/
    analyze-summaries/     Groq-powered analysis + quota enforcement (Deno)
    delete-account/        full account + data deletion (user-invoked)
  migrations/              SQL schema, RLS policies, RPCs, storage buckets
public/
  widget.js                embeddable widget script
scripts/                   verification/utility scripts (verify-subscription-flow,
                           verify-p1-quotas, live-flow-helper)
```

---

## Plans & quotas

Quota limits live in the `quota_caps` table (single source of truth; the edge function and RPCs read from it and never exceed it).

| | Free | Pro |
|---|---|---|
| Price | — | **$9 / month** or **$90 / year** |
| AI summaries | **10 per 24h window** | **50 per day**, **400 per month** |
| Reviews per analysis | 10–50 | 10–50 |
| Max review length | 1,000 chars | 1,000 chars |
| Max total input | 30,000 chars | 100,000 chars |
| Concurrent analyses | 1 | 3 |
| Widgets / saved summaries | ✓ | ✓ |
| Billing portal | — | ✓ |

Limits are enforced **server-side** in the `analyze-summaries` edge function (`try_reserve_analysis_slot` RPC) — client state can't bypass them.

---

## Getting started (local development)

**Prerequisites:** Node.js 20+, npm, and access to the Supabase project + Lemon Squeezy store (env values).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (see table below)
cp .env.example .env.local   # then fill in real values

# 3. Run the dev server
npm run dev                  # http://localhost:3000
```

Apply the SQL migrations (`supabase/migrations/*.sql`) to your Supabase project via the SQL editor or the Supabase CLI, and deploy the two edge functions (`analyze-summaries`, `delete-account`). Create the private `avatars` storage bucket (per-user folders) per the migration.

### Environment variables

All variables must be set in `.env.local` **and** in the Vercel project (Production). `NEXT_PUBLIC_*` keys are safe to be public; everything else is secret.

| Variable | What it is | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon/publishable key | Supabase → Settings → API |
| `SUPABASE_SECRET_KEY` | Secret (service-role) key — server/edge-function only | Supabase → Settings → API keys |
| `NEXT_PUBLIC_SITE_URL` | Deployed app URL (used for LS post-purchase redirects) | your Vercel domain |
| `SEND_EMAIL_HOOK_SECRET` | Shared secret verifying Supabase → `/api/send-email` webhook calls (`v1,whsec_…`, e.g. `openssl rand -base64 32` prefixed) | generated |
| `LEMONSQUEEZY_API_KEY` | Lemon Squeezy API key | app.lemonsqueezy.com → Settings → API |
| `LEMONSQUEEZY_STORE_ID` | Store ID | LS → Settings → API / store URL |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Signing secret of the webhook you create in LS | LS → Settings → Webhooks |
| `LEMONSQUEEZY_PRO_VARIANT_ID` | Numeric variant ID of the monthly Pro subscription | LS → Products → Pro → Variants |
| `LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID` | Numeric variant ID of the yearly Pro subscription (optional; powers the billing toggle on `/pricing`) | LS → Products → Pro → Variants |
| `LLM_API_KEY` (edge function secret) | Groq API key | console.groq.com |
| `LLM_BASE_URL` / `LLM_MODEL` (optional) | AI endpoint + model (defaults to Groq `llama-3.3-70b-versatile`) | defaults |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | SMTP server + auth for transactional email | your email provider |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | Visible sender | your domain / provider |
| `SMTP_PASS` (legacy alias) / `SMTP_FROM` (deprecated) | Accepted for backward compatibility | — |

> **Gmail note:** the From address must be the Gmail address itself or a verified "Send mail as" identity, or Gmail rewrites it. For a custom-domain sender (`no-reply@yourdomain.com`), use a transactional provider (Resend, SendGrid, SES, Mailgun) with SPF/DKIM set up.

---

## Database schema

All tables are RLS-protected and scoped to `auth.uid()`.

| Table | Purpose |
|---|---|
| `profiles` | Business name + website per user |
| `user_settings` | Per-user UI preferences (`defaultView`) |
| `user_credits` | Plan, quota window, subscription status/renews/ends, cancel-at-period-end, billing interval — the single source of truth for feature access |
| `summaries` | Saved AI analyses + unique `widget_id` (unique index) |
| `analysis_usage` | Legacy hourly rate-limit ledger |
| `subscription_events` | Append-only audit log of every Lemon Squeezy webhook event (idempotency + traceability) |
| `quota_caps` | Central quota configuration (free / pro-daily / pro-monthly / pro-concurrency) |
| `signup_rate_limits` / `signup_verifications` | Per-IP OTP sign-up throttling + verification flow state |

**Key RPCs:** `try_reserve_analysis_slot` (atomic credit deduction), `release_analysis_slot` (refund on failure), `is_pro_subscription_active`, `get_user_plan`, `get_quota_caps`, `rate_limit_take` (IP buckets), `list_summaries_page` (keyset pagination).

---

## Authentication

- **Methods:** email + password, Google OAuth, magic link (OTP via email), and email-OTP **sign-up** (code delivered by SMTP through `/api/signup-otp/send`, verified by `/verify` which also creates the account).
- **Sign-up abuse protection:** both OTP endpoints are rate limited per IP (`client-ip.ts` hashes the client IP; buckets tracked via `rate_limit_take`).
- **Session:** Supabase SSR cookies (`sb-<ref>-auth-token` + PKCE verifiers). Middleware refreshes sessions and redirects signed-in users away from `/login` and `/signup`.
- **Password rules:** min 8 chars; password changes require a recent sign-in (Supabase's `valid_last_sign_in_at` guard — the app explains this in the UI).
- **Account deletion:** `delete-account` edge function removes the user, their summaries, credits, and profile (cascading).
- **Logout** is instant: session cookies are cleared locally first, then the server-side session is revoked in the background.

---

## Payments & subscriptions (Lemon Squeezy)

**Checkout:** `/api/lemon-squeezy/checkout?interval=month|year` creates a real LS checkout URL for the Pro variant and stores the customer's email; `/api/lemon-squeezy/portal` returns the LS customer portal URL for managing/cancelling.

**Webhook** (`/api/lemon-squeezy/webhook`): every event is **signature-verified** with `standardwebhooks` using `LEMONSQUEEZY_WEBHOOK_SECRET`, and events are recorded idempotently in `subscription_events` before applying state changes. The store only sends events whose IDs haven't been processed, so replays can't double-apply.

Register the webhook in the LS dashboard at:

```
https://<your-app>/api/lemon-squeezy/webhook
```

…subscribed to these events:

```
order_created, subscription_created, subscription_updated,
subscription_payment_success, subscription_payment_failed,
subscription_resumed, subscription_unpaused, subscription_cancelled,
subscription_expired, subscription_paused, subscription_payment_refunded,
order_refunded
```

**Lifecycle handling:** paid → `active` (Pro); failed payment → `past_due`/`unpaid`; cancel → access until period end; expiry/refund → back to Free. Verified end-to-end by `scripts/verify-subscription-flow.mjs`.

---

## AI analysis (`analyze-summaries` edge function)

- Deno edge function on Supabase, called from the dashboard with the user's JWT.
- Validates plan + quotas atomically (free 10/24h · pro 50/day · pro 400/month · concurrency caps) **before** spending tokens.
- Guards input: 10–50 reviews, ≤1,000 chars each, ≤30k chars (free) / 100k (pro); garbage input is rejected.
- Calls Groq (`llama-3.3-70b-versatile`) for a **rich analysis** (sentiment, themes, impact matrix, recommendations — `RICH_MAX_TOKENS`) and falls back to a legacy summarization path if the rich mode fails.
- Persists the summary + `widget_id`, refunds the credit slot if anything fails (`release_analysis_slot`).

---

## Widget

- Each summary exposes a public endpoint `/api/widget?widget_id=…` (server-side rendered, origin-validated, no private data — it never returns customer emails or internal metadata).
- Embed anywhere with the script tag from the app (loads `/widget.js`, renders the testimonial widget). See `public/widget.js` + `src/components/insights/widget-section.tsx`.

---

## Email

Supabase auth events (magic links, OTP, password reset, confirmation) are forwarded to `/api/send-email`, which validates the `SEND_EMAIL_HOOK_SECRET` header and sends through Nodemailer/SMTP.

---

## Security

- Row-Level Security enabled on every table, every policy scoped to `auth.uid()`.
- All API routes authenticate the caller server-side; no client-controlled IDs or role/subscription fields are trusted.
- Lemon Squeezy webhooks signature-verified and idempotent.
- OTP sign-up rate limited per IP; free-tier AI quotas enforced server-side.
- User/AI content is rendered with React escaping — no `dangerouslySetInnerHTML`, no HTML injection; the widget output is sanitized.
- Secrets never reach the client bundle (`NEXT_PUBLIC_*` only), logs, or git (`.env.local` git-ignored, `.vercelignore` keeps local junk out of deploys).
- Avatars stored in a **private** bucket, served via 1-hour signed URLs.

---

## Testing & scripts

```bash
npm run lint     # ESLint
npm run test     # Vitest (API route unit tests, e.g. signup-otp)
npm run build    # Production build
npm run dev      # Dev server on :3000
```

Verification utilities in `scripts/`:

- `verify-subscription-flow.mjs` — full payment/webhook lifecycle test (28 checks) against a real store
- `verify-p1-quotas.mjs` — quota & abuse-limit checks against the live DB
- `live-flow-helper.mjs` — helpers for live payment-flow testing

---

## Deployment (Vercel)

1. Push to GitHub → import the repo in Vercel (framework preset: Next.js).
2. Set **all** env vars from the table above (Production).
3. Deploy. After deploy, make sure:
   - the Lemon Squeezy webhook points at `https://<your-app>/api/lemon-squeezy/webhook`;
   - `NEXT_PUBLIC_SITE_URL` matches your Vercel domain;
   - Supabase Google provider is enabled with your OAuth client, and its authorized redirect URI (`https://<ref>.supabase.co/auth/v1/callback`) is in Google Cloud Console;
   - edge functions are deployed to Supabase and the migrations applied.
