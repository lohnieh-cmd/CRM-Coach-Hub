# Deployment Guide — Ascent CRM to Production

**Last updated:** Apr 2026
**Audience:** Anyone wanting to deploy their Ascent CRM fork to the public internet.

---

## ⚠️ READ FIRST — the Supabase question

> **"Can I use Supabase as the database?"**
> **Short answer: not directly, because our backend is wired to MongoDB (via Motor) — Supabase is a PostgreSQL platform.**

This app was built from day one on **MongoDB** for:
- 60+ collections (contacts, companies, deals, quotes, invoices, attachments, journals, accounts, periods, employees, emp201_postings, bank_accounts, bank_transactions, fixed_assets, receipts, irp6_workpapers, dividend_declarations, …)
- Dynamic nested documents (journal lines, deal custom fields, form steps+branches, brand voice JSON, AFS signature metadata)
- Indexes chosen for Mongo's query planner

**Your three honest options:**

| Option | Effort | When to use |
|---|---|---|
| **A. MongoDB Atlas (recommended)** — use the free M0 tier | ≈ 0 | 99 % of cases. Keep the existing architecture. |
| **B. Use Supabase for Auth / Storage / Realtime only** (keep Mongo for data) | Low | You want Supabase's features (social login, object storage, realtime) _alongside_ Mongo. |
| **C. Rewrite the backend to Postgres (Supabase)** | **High — multi-week job** | You have a hard Postgres mandate. Would require: rewriting every Motor query to `asyncpg` / SQLAlchemy, converting every Pydantic model to a SQL table, migrating all nested documents into relational tables + JSONB columns, rewriting the double-entry accounting engine queries, updating ~244 tests. Not covered in this guide. |

**If you still want Option C**, tell me in a separate chat — I can scope out a phased rewrite plan, but expect ~2–3 full sessions of work.

This guide covers **Option A** (recommended) plus a bonus path for **Option B** at the end.

---

## Recommended topology

| Layer | Host | Free tier? | Notes |
|---|---|---|---|
| **Frontend (React)** | **Vercel** | ✅ Free (Hobby plan) | Perfect fit — static build, global CDN, generous free tier. |
| **Backend (FastAPI + asyncio scheduler + disk)** | **Render.com** / **Railway** / **Fly.io** | Partial (see §5 below) | Needs persistent disk + background worker — Vercel serverless won't work. |
| **Database (MongoDB)** | **MongoDB Atlas** (free M0) | ✅ 512 MB forever | Perfectly sized for small SMBs. |
| **LLM** | **Emergent LLM key** | Pay-as-you-go | Already set in your `.env`. |
| **Object storage (attachments, AFS signatures, receipts)** | Render/Railway **persistent disk** (or S3/Cloudflare R2 / Supabase Storage for Option B) | Depends on host | On Render free tier, disk is ephemeral — see §6 for the three storage options. |

---

## Backend hosting — full comparison

Here's the real pricing landscape for FastAPI backends in **Feb 2026**:

| Host | Free tier | Paid tier (smallest) | Persistent disk on free | Background workers | Best for |
|---|---|---|---|---|---|
| **Render.com** | ✅ Yes — 750 hrs/mo web service, spins down after 15 min inactivity (~50 s cold start) | $7/mo "Starter" = always-on, 512 MB RAM | ❌ No (paid only; $0.25/GB-mo from Starter) | ✅ separate worker service | Best free option for testing; cheapest upgrade path |
| **Railway** | ❌ No (trial credit only; $5 one-time) | $5/mo + metered usage | N/A (paid from day 1) | ✅ | Simpler deploy UX; now paid-only |
| **Fly.io** | ✅ Yes — 3 small VMs (256 MB RAM each), 3 GB persistent volume free | $1.94/mo per shared-1×-256 VM | ✅ on free | ✅ | Best if you need persistent disk on free |
| **Koyeb** | ✅ Yes — 1 web service, always-on, 512 MB RAM | $2.7/mo | ✅ | ✅ | Good free alternative to Render |
| **Vercel** (serverless Python) | ✅ Yes | From $20/mo Pro | ❌ ephemeral /tmp only | ❌ no asyncio schedulers | **NOT recommended for our backend** (no disk, no worker, cold starts kill the ticker) |
| **AWS App Runner / ECS** | ❌ No true free | From ~$10/mo | ✅ via EFS | ✅ | Production at scale; steeper learning curve |
| **DigitalOcean App Platform** | ❌ No true free | $5/mo "Basic" | ✅ via Spaces | ✅ | Simpler AWS-alternative |

### 👉 My recommendation by scenario

| Your situation | Pick |
|---|---|
| **"I just want to show this to someone this week, for free"** | **Fly.io** (free + persistent disk + worker) **or** **Render free** (ok with 50 s cold-start) |
| **"I have real users and need always-on, cheap"** | **Render Starter ($7/mo)** or **Koyeb Starter ($2.7/mo)** |
| **"We're going to grow and want to scale later"** | **Fly.io** (pay-as-you-go, excellent scaling) or **Render** |
| **"I want one-click git-push deploys"** | **Render** (literally connect GitHub → deploy) or **Railway** |

**No, the backend is not free-forever like Vercel is for static frontends** — because FastAPI is a long-running process that needs RAM + disk + network time. The closest thing to "free forever" for us is **Fly.io** (3 tiny VMs free) or **Koyeb** (1 always-on service free) or **Render free** (with the cold-start trade-off).

---

## Step 1 — Prerequisites

Before starting you need:
1. A **GitHub** account (free) — sign up at [github.com](https://github.com).
2. A **Vercel** account (free) — sign up at [vercel.com](https://vercel.com) with GitHub.
3. A **MongoDB Atlas** account (free) — [cloud.mongodb.com](https://cloud.mongodb.com).
4. A **Render / Fly.io / Koyeb** account (pick one from §Recommendation above).
5. Your codebase pushed to GitHub (use Emergent's **"Save to GitHub"** button in the chat input).
6. These credentials ready:
   - `EMERGENT_LLM_KEY` — already in `/app/backend/.env` from your Emergent workspace.
   - `STRIPE_API_KEY` — from [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) (test or live).
   - `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET` — from [developer.paypal.com/dashboard](https://developer.paypal.com/dashboard/) (Sandbox or Live).
   - A strong random `JWT_SECRET` — generate one: `openssl rand -hex 32`.

---

## Step 2 — Push code to GitHub

1. In the Emergent chat input, click the **"Save to GitHub"** button.
2. Confirm repo name (e.g. `lohnieh-cmd/CRM-Coach-Hub`).
3. Wait for push. Verify at `https://github.com/<you>/<repo>`.

---

## Step 3 — Set up MongoDB Atlas

1. [cloud.mongodb.com](https://cloud.mongodb.com) → sign up.
2. **Build a Database** → **M0 Free**.
3. Region: pick the one closest to your users (e.g. **AWS eu-west-1** for Europe / South Africa).
4. Cluster name: `ascent-crm-prod`.
5. In Security Quickstart:
   - Create a DB user (username: `ascent_prod`, strong password — save it).
   - Network Access: add `0.0.0.0/0` (or your backend host's static IP for tighter security).
6. Click **Connect** → **Drivers** → Python → **3.12 or later** → **copy the connection string**. It looks like:
   ```
   mongodb+srv://ascent_prod:<password>@ascent-crm-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. Paste your real password into the `<password>` placeholder.

Keep this string — you'll paste it into the backend host's env vars in Step 4.

---

## Step 4 — Deploy the backend (pick ONE host)

### Option 4A — Render.com (easiest; free with cold starts)

1. [render.com](https://render.com) → sign up with GitHub.
2. **New → Web Service** → connect your GitHub repo → pick the repo.
3. Configure:
   - **Name:** `ascent-crm-backend`
   - **Region:** Frankfurt (closest to SA users)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** Free (for testing) or Starter ($7/mo for always-on).
4. **Environment** tab → add these variables:
   ```
   MONGO_URL=mongodb+srv://ascent_prod:<password>@ascent-crm-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority
   DB_NAME=ascent_crm
   JWT_SECRET=<openssl rand -hex 32 output>
   EMERGENT_LLM_KEY=<from your backend/.env>
   STRIPE_API_KEY=sk_test_...
   PAYPAL_CLIENT_ID=<from PayPal developer dashboard>
   PAYPAL_SECRET=<from PayPal developer dashboard>
   PAYPAL_MODE=sandbox
   PUBLIC_SITE_BASE=https://<your-vercel-domain>.vercel.app
   UPLOAD_ROOT=/app/uploads
   ```
5. **Disk** (paid plans only): add a disk mounted at `/app/uploads`, size 1 GB.
   - On **free tier** disk is ephemeral — attachments/signatures will disappear on re-deploy. **For production you MUST use Starter ($7/mo) + disk**, or switch attachment storage to S3/R2/Supabase Storage (see §6).
6. **Create Web Service**. First build takes ~5 min. You'll get a URL like `https://ascent-crm-backend.onrender.com`.
7. Verify: `curl https://ascent-crm-backend.onrender.com/api/` — should return the service banner.

### Option 4B — Fly.io (free + persistent disk)

1. Install flyctl: `curl -L https://fly.io/install.sh | sh`.
2. `fly auth signup`.
3. In `/app/backend/`:
   ```bash
   fly launch --name ascent-crm-backend --region fra --no-deploy
   ```
4. Edit the generated `fly.toml` — add a mount + release-command for health:
   ```toml
   [mounts]
     source = "ascent_data"
     destination = "/app/uploads"

   [env]
     DB_NAME = "ascent_crm"
     PAYPAL_MODE = "sandbox"
     UPLOAD_ROOT = "/app/uploads"
   ```
5. Create the volume: `fly volumes create ascent_data --region fra --size 1`.
6. Set secrets (env vars):
   ```bash
   fly secrets set MONGO_URL="mongodb+srv://..."
   fly secrets set JWT_SECRET="$(openssl rand -hex 32)"
   fly secrets set EMERGENT_LLM_KEY="..."
   fly secrets set STRIPE_API_KEY="..."
   fly secrets set PAYPAL_CLIENT_ID="..."
   fly secrets set PAYPAL_SECRET="..."
   fly secrets set PUBLIC_SITE_BASE="https://<your-vercel-domain>.vercel.app"
   ```
7. Deploy: `fly deploy`.
8. URL: `https://ascent-crm-backend.fly.dev`.

### Option 4C — Koyeb (another free always-on option)

Similar to Render. Connect GitHub → pick `backend/` root → Python runtime → same start command + env vars → deploy.

---

## Step 5 — Deploy the frontend on Vercel

1. [vercel.com](https://vercel.com) → sign in with GitHub.
2. **Add New** → **Project** → pick your repo.
3. Configure:
   - **Framework Preset:** `Create React App` (CRA).
   - **Root Directory:** `frontend`.
   - **Build Command:** `yarn build` (CRA's default is `react-scripts build` — either works).
   - **Output Directory:** `build`.
4. **Environment Variables** (add one):
   ```
   REACT_APP_BACKEND_URL=https://<your-backend-domain>   (e.g. https://ascent-crm-backend.onrender.com)
   ```
   ⚠️ **No trailing slash.** The frontend appends `/api/...` to this.
5. Click **Deploy**. ~2 min later you'll get `https://<your-project>.vercel.app`.
6. Open the URL → should show the login page with "Midnight Mountain" branding.

### Update backend CORS + PUBLIC_SITE_BASE

Once you have the final Vercel domain:
1. Go back to your backend host (Render / Fly / Koyeb) → env vars → set:
   ```
   PUBLIC_SITE_BASE=https://<your-project>.vercel.app
   ```
2. Redeploy / restart backend.
3. CORS is already wildcard in `server.py` for dev, but for production you can tighten:
   ```python
   # In server.py — optional production hardening
   CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
   ```
   Then set `CORS_ORIGINS=https://<your-project>.vercel.app` on the backend.

---

## Step 6 — Attachment & signature storage

The backend writes uploaded files (quote/invoice attachments, AFS signature PNG, receipt OCR images) to disk at `UPLOAD_ROOT`.

Pick one strategy:

| Strategy | How | Cost | When to use |
|---|---|---|---|
| **Persistent disk on host** (easiest — no code change) | Render Starter + disk, Fly.io volume, DO Block Storage | $1–3/mo for 1 GB | If you're already on a paid tier of the host |
| **AWS S3 / Cloudflare R2** | Swap `disk_path.write_bytes(data)` for an S3 put; return signed URLs on download | R2 = 10 GB free forever | Growing user base; need CDN for attachments |
| **Supabase Storage** (Option B from §1) | Same as S3 but using Supabase JS SDK; very generous free tier (1 GB storage, 2 GB egress/mo) | Free up to quota | If you want to use Supabase _selectively_ without rewriting the database layer |

**If you want Supabase Storage (Option B)** — I can wire this up in ~30 min in a follow-up session: it's a drop-in replacement for the 3 write-to-disk spots (`_upload_attachment_impl`, `upload_afs_signature`, receipt ingest) + swapping 3 download routes to signed Supabase URLs. Ask and I'll do it.

---

## Step 7 — Stripe & PayPal webhooks

Both payment providers need to know _your deployed backend URL_ for their webhooks.

### Stripe
1. [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint**.
2. URL: `https://<your-backend-domain>/api/webhook/stripe`.
3. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`.
4. Copy the **Signing secret** (starts `whsec_...`).
5. Backend env → add: `STRIPE_WEBHOOK_SECRET=whsec_...`.
6. Redeploy backend.

### PayPal
1. [developer.paypal.com/dashboard](https://developer.paypal.com/dashboard/) → your app → **Webhooks**.
2. URL: `https://<your-backend-domain>/api/webhook/paypal`.
3. Event: `PAYMENT.CAPTURE.COMPLETED` (or **All events** during testing).
4. Copy the **Webhook ID** (e.g. `3NC11658CK228473R`).
5. Backend env → add: `PAYPAL_WEBHOOK_ID=<id>`.
6. Redeploy.

**For production, flip `PAYPAL_MODE=live`** and use your live `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` instead of sandbox.

---

## Step 8 — Seed the database

First-time login after deploy will NOT have the SA Chart of Accounts or demo data seeded. Two options:

### Option 1 — Just sign up
Hit `/login` → **Create account** — the first user becomes owner. Then on `/accounting` → Overview → **"Seed Chart of Accounts"**. Done.

### Option 2 — Replicate the demo seed
SSH into your backend container / Fly shell and run:
```bash
cd backend
python -c "from server import seed_data; import asyncio; asyncio.run(seed_data())"
```
(This is what runs automatically on first local boot; on hosted environments it's gated behind `SEED_DEMO_DATA=true` — add that env var if you want demo contacts/deals pre-populated.)

---

## Step 9 — Post-deploy verification checklist

Run through this once after your first successful deploy:

| Check | How |
|---|---|
| Backend healthy | `curl https://<backend>/api/` → 200 with service banner |
| Login works | Open `https://<frontend>/login` → create an account or log in |
| MongoDB writes land | Log in, create a contact, check Atlas → Collections → `contacts` |
| CORS OK | Open DevTools network tab; no red CORS errors on any `/api/...` call |
| Stripe payment | Create an invoice → **Pay** → Stripe Checkout → test card `4242 4242 4242 4242` → webhook fires → invoice marks paid |
| PayPal payment | Same flow, **PayPal** button → sandbox checkout → return URL polls → invoice marks paid |
| AI Reply | On a contact's timeline → **Draft reply** → Gemini 3 response within ~5 s |
| AFS PDF | `/accounting` → Periods → **Download PDF** → opens in reader |
| Attachments persist | Upload a PDF on a quote → trigger a backend redeploy → come back → file still downloadable (this is the key test — if the file is gone, you're on ephemeral disk and need §6) |

---

## Step 10 — Custom domain (optional)

### Frontend
1. Vercel dashboard → your project → **Domains** → **Add** → type your domain (e.g. `app.coaches.co.za`).
2. Follow Vercel's DNS instructions (usually add a CNAME to `cname.vercel-dns.com`).
3. Wait for SSL auto-provisioning (~2 min).

### Backend
1. Render / Fly / Koyeb all support custom domains on paid plans.
2. Add a CNAME `api.coaches.co.za` → `<backend>.onrender.com` / `<backend>.fly.dev`.
3. Re-issue SSL (automatic).
4. Update Vercel env var `REACT_APP_BACKEND_URL=https://api.coaches.co.za` → re-deploy frontend.

---

## Bonus: Pure-Vercel alternative (not recommended)

You **can** deploy the backend as Vercel Python serverless functions, but:
- ❌ No persistent disk → all attachment/signature uploads broken unless moved to S3/R2/Supabase Storage.
- ❌ No long-running asyncio → subscription scheduler **disabled** (invoices won't auto-generate from recurring subscriptions).
- ❌ 10 s cold-start timeout → AI calls and PDF generation may time out.
- ❌ Each function invocation gets a fresh Mongo connection → burns through Atlas connection quota fast.

If you still want to try: add `vercel.json` routing all `/api/*` to `backend/vercel_handler.py`, switch storage to an object-store provider, and accept the subscription ticker will be dead. Not a path I'd recommend for this app.

---

## Cost summary — the realistic "tell me what this will cost me" table

| Phase | Setup | Monthly cost |
|---|---|---|
| **Free tier everything** (Render free + Atlas M0 + Vercel Hobby + Fly free disk) | 1 evening | **$0 / mo** (with cold-start caveats) |
| **Minimum viable production** (Render Starter + Atlas M0 + Vercel Hobby + 1 GB disk) | 1 evening | **~$9 / mo** (Render $7 + disk $1.50 + Vercel free) |
| **Small SMB (500 invoices/mo, 1 GB attachments)** | Add Atlas M10 for perf | ~$70 / mo |
| **Growing coaching business (5 000 invoices/mo, daily backups)** | Atlas M20, Render paid + worker service, Cloudflare R2 for files | ~$180 / mo |

---

## Support & updates
- Codebase: your GitHub fork.
- Roadmap: `/app/memory/PRD.md`.
- Tests: `cd backend && pytest` — 244 pass + 4 skip (Apr 2026).
- Stuck? Open a GitHub issue with the deploy-step + full error message + host name.

---

**End of Deployment Guide.**
