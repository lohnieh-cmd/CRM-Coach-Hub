# Deployment Guide — Ascent CRM on Vercel

**Goal:** Deploy the full-stack Ascent CRM app (React frontend + FastAPI backend + MongoDB) to production using Vercel + free-tier hosting partners.

---

## ⚠️ READ FIRST — Important Architecture Note

**Vercel is optimised for frontend + serverless functions.** Our backend is a **stateful FastAPI app** that uses:
- A persistent filesystem (`/app/backend/uploads/` for PDF/Word attachments)
- A long-running asyncio background scheduler (subscription ticker, 5-min tick)
- Long-lived MongoDB connections (Motor async driver)

These **do not work well on Vercel's serverless runtime** (no persistent disk, 10–60 s cold-start timeouts, no background workers).

### Recommended deployment topology

| Component | Recommended Host | Why |
|---|---|---|
| **Frontend (React)** | **Vercel** | Perfect fit — static build, global CDN, free tier generous. |
| **Backend (FastAPI)** | **Render.com** (free tier) or **Railway.app** or **Fly.io** | Persistent disk + background workers supported. |
| **MongoDB** | **MongoDB Atlas** (free M0 tier, 512 MB) | Managed, reliable, global. |

We'll cover the recommended topology below. A pure-Vercel "all-in-one" alternative is documented at the bottom with its caveats.

---

## Prerequisites

Before starting you need:
1. A [GitHub](https://github.com/) account (free).
2. A [Vercel](https://vercel.com/) account (sign up with GitHub).
3. A [MongoDB Atlas](https://www.mongodb.com/atlas) account (free).
4. A [Render.com](https://render.com/) account (free) **OR** Railway / Fly.io.
5. Your codebase pushed to a GitHub repo (use Emergent's "Save to GitHub" button in chat).
6. These credentials ready:
   - `EMERGENT_LLM_KEY` (from your Emergent profile)
   - `STRIPE_API_KEY` (from [dashboard.stripe.com](https://dashboard.stripe.com/apikeys))
   - `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET` (from [developer.paypal.com](https://developer.paypal.com/dashboard/))
   - A strong random string for `JWT_SECRET` (generate one: `openssl rand -hex 32`)

---

## Step 1 — Push your code to GitHub

1. In the Emergent chat input, click the **"Save to GitHub"** button.
2. Confirm the repo name (e.g. `lohnieh-cmd/CRM-Coach-Hub`).
3. Wait for the push to complete.
4. Verify at `https://github.com/<you>/<repo>` — you should see `backend/`, `frontend/`, `README.md`, `USER_MANUAL.md`, and this file.

---

## Step 2 — Set up MongoDB Atlas (database)

1. Go to [https://cloud.mongodb.com](https://cloud.mongodb.com) → sign up.
2. Click **"Build a Database"** → choose **M0 Free**.
3. Pick a region close to your users (e.g. **AWS eu-west-1** for Europe/Africa).
4. Name the cluster `ascent-crm-prod`.
5. Click **Create**.
6. In the "Security Quickstart" panel:
   - **Username:** `ascentadmin`
   - **Password:** click *Autogenerate* → **copy and save this password**.
   - **Access:** click *"Add My Current IP Address"* AND also add `0.0.0.0/0` (allow from anywhere — required because Render/Vercel have dynamic IPs).
7. Click **Finish & Close**.
8. On the cluster page → click **Connect** → **Drivers** → copy the connection string, which looks like:
   ```
   mongodb+srv://ascentadmin:<password>@ascent-crm-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
9. Replace `<password>` with the password you saved. Save the full string as `MONGO_URL` — you'll paste it into Render in Step 3.

---

## Step 3 — Deploy the backend to Render.com

1. Go to [https://render.com](https://render.com) → sign up with GitHub.
2. Click **New +** → **Web Service** → connect your GitHub repo.
3. Configure the service:
   - **Name:** `ascent-crm-backend`
   - **Region:** same region as MongoDB Atlas
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** `Free`
4. Scroll to **Environment Variables** → click **Add Environment Variable** for each:

   | Key | Value |
   |---|---|
   | `MONGO_URL` | (the Atlas connection string from Step 2) |
   | `DB_NAME` | `ascent_crm_prod` |
   | `JWT_SECRET` | (generate: `openssl rand -hex 32`) |
   | `EMERGENT_LLM_KEY` | (from your Emergent profile) |
   | `STRIPE_API_KEY` | `sk_test_...` or `sk_live_...` |
   | `PAYPAL_CLIENT_ID` | (from PayPal Developer) |
   | `PAYPAL_SECRET` | (from PayPal Developer) |
   | `PAYPAL_MODE` | `sandbox` or `live` |
   | `CORS_ORIGINS` | `https://<your-vercel-project>.vercel.app` (you'll know this URL after Step 4 — come back and update) |

5. Click **Create Web Service** → wait ~5 min for first build.
6. Once deployed, copy the URL (e.g. `https://ascent-crm-backend.onrender.com`) — you'll need it in Step 4.
7. Test it: open `https://ascent-crm-backend.onrender.com/api/health` — should return `{"status":"ok"}`.

> **Free-tier note:** Render free-tier services **sleep after 15 min of inactivity** and take ~30 s to wake up on the next request. Upgrade to the $7/mo Starter plan to keep the backend warm.

### Alternative — Railway.app
If you prefer Railway:
1. [railway.app](https://railway.app) → New Project → Deploy from GitHub.
2. Set root to `backend/`, same env vars as above.
3. Railway auto-detects the start command from the `Procfile` (create one if missing — see Appendix A).

---

## Step 4 — Deploy the frontend to Vercel

1. Go to [https://vercel.com](https://vercel.com) → sign in with GitHub.
2. Click **Add New...** → **Project** → import your GitHub repo.
3. Configure:
   - **Framework Preset:** `Create React App`
   - **Root Directory:** `frontend`
   - **Build Command:** `yarn build` (default)
   - **Output Directory:** `build` (default)
   - **Install Command:** `yarn install` (default)
4. Expand **Environment Variables** and add:

   | Key | Value |
   |---|---|
   | `REACT_APP_BACKEND_URL` | `https://ascent-crm-backend.onrender.com` *(your Render URL from Step 3 — no trailing slash)* |

5. Click **Deploy**.
6. Wait ~2 min → you'll get a URL like `https://crm-coach-hub-xyz.vercel.app`.
7. Open the URL → you should see the login page.

---

## Step 5 — Update CORS on the backend

1. Go back to your Render service → **Environment** tab.
2. Update `CORS_ORIGINS` to your Vercel URL, e.g.:
   ```
   https://crm-coach-hub-xyz.vercel.app,https://your-custom-domain.com
   ```
3. Click **Save Changes** → Render auto-redeploys.

---

## Step 6 — Configure a custom domain (optional)

### On Vercel (frontend)
1. Vercel project → **Settings** → **Domains** → Add `app.yourdomain.com`.
2. Vercel shows a CNAME record → add it at your DNS provider.

### On Render (backend)
1. Render service → **Settings** → **Custom Domain** → Add `api.yourdomain.com`.
2. Render shows a CNAME record → add it at your DNS provider.
3. Update your Vercel `REACT_APP_BACKEND_URL` to `https://api.yourdomain.com`.
4. Update Render `CORS_ORIGINS` to `https://app.yourdomain.com`.

---

## Step 7 — Configure Stripe + PayPal webhooks (production)

### Stripe
1. [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers** → **Webhooks** → **Add endpoint**.
2. URL: `https://api.yourdomain.com/api/webhook/stripe`
3. Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`.
4. Copy the signing secret → add as `STRIPE_WEBHOOK_SECRET` env var on Render → redeploy.

### PayPal
1. [developer.paypal.com](https://developer.paypal.com) → My Apps & Credentials → your app → **Webhooks** → **Add Webhook**.
2. URL: `https://api.yourdomain.com/api/webhook/paypal`
3. Events: `PAYMENT.CAPTURE.COMPLETED`.
4. Copy the Webhook ID → add as `PAYPAL_WEBHOOK_ID` env var on Render → redeploy.

---

## Step 8 — First-run bootstrap

1. Open your production frontend URL.
2. Log in with the seeded demo account **OR** register a new owner (the first user becomes the owner).
3. Navigate to `/accounting` → click **"Seed Chart of Accounts"** once.
4. Go to `/team` → invite your teammates.
5. Connect any remaining integrations (IMAP, PayPal live, Stripe live).

---

## Step 9 — Automatic redeploys

Every `git push` to `main`:
- **Vercel** rebuilds the frontend automatically (~2 min).
- **Render** rebuilds the backend automatically (~5 min).

To preview a branch:
- Vercel creates a unique preview URL for every PR / branch automatically.

---

## Alternative: Pure-Vercel Deployment (Frontend + Backend)

If you want to host the backend on Vercel too (using Vercel Serverless Functions):

### Caveats
1. ❌ **Attachments won't work** — no persistent disk. You must migrate uploads to S3 / Vercel Blob / Cloudflare R2.
2. ❌ **Background scheduler won't work** — no long-running processes. You must use **Vercel Cron Jobs** or an external service (e.g. cron-job.org, GitHub Actions) to ping a `/api/scheduler/tick` endpoint every 5 min.
3. ⚠️ **Cold starts** — FastAPI via Mangum adapter has ~2–5 s cold-start.
4. ⚠️ **10–60 s function timeout** — long AI generations may time out.

### Steps (high level)
1. Add `/app/backend/vercel.json`:
   ```json
   {
     "version": 2,
     "builds": [
       { "src": "server.py", "use": "@vercel/python" }
     ],
     "routes": [
       { "src": "/(.*)", "dest": "server.py" }
     ]
   }
   ```
2. Wrap FastAPI with Mangum in `server.py`:
   ```python
   from mangum import Mangum
   handler = Mangum(app)
   ```
3. Add `mangum` to `requirements.txt`.
4. Create a **second** Vercel project pointing at `backend/` root.
5. Migrate `/app/backend/uploads/` to Vercel Blob:
   - `yarn add @vercel/blob`
   - Rewrite `POST /api/{resource}/{rid}/attachments` to upload to Blob and store the Blob URL instead of a disk path.
6. Replace the asyncio scheduler with a **Vercel Cron Job**:
   ```json
   // vercel.json
   "crons": [
     { "path": "/api/scheduler/tick", "schedule": "*/5 * * * *" }
   ]
   ```
7. Migrate IMAP sync to a cron-triggered endpoint too.

**We do not recommend this** unless you're committed to a fully serverless architecture. Render + Vercel is simpler and costs the same ($0 on free tiers).

---

## Appendix A — Render Procfile (optional)

Create `/app/backend/Procfile`:
```
web: uvicorn server:app --host 0.0.0.0 --port $PORT
```

## Appendix B — Environment Variables Reference

### Backend (Render)
| Variable | Required | Example |
|---|---|---|
| `MONGO_URL` | ✅ | `mongodb+srv://...` |
| `DB_NAME` | ✅ | `ascent_crm_prod` |
| `JWT_SECRET` | ✅ | (64-char random hex) |
| `EMERGENT_LLM_KEY` | ✅ | `sk-emergent-...` |
| `STRIPE_API_KEY` | ✅ | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | production | `whsec_...` |
| `PAYPAL_CLIENT_ID` | ✅ | `AYH...` |
| `PAYPAL_SECRET` | ✅ | `EHG...` |
| `PAYPAL_MODE` | ✅ | `sandbox` or `live` |
| `PAYPAL_WEBHOOK_ID` | production | `3SW...` |
| `CORS_ORIGINS` | ✅ | `https://app.yourdomain.com` |

### Frontend (Vercel)
| Variable | Required | Example |
|---|---|---|
| `REACT_APP_BACKEND_URL` | ✅ | `https://api.yourdomain.com` |

---

## Appendix C — Troubleshooting deployment

| Symptom | Fix |
|---|---|
| Frontend loads but login fails with CORS error | Update Render `CORS_ORIGINS` to include your Vercel URL → redeploy. |
| 502 on Render backend | Check Render logs → MongoDB connection usually the culprit. Verify `MONGO_URL` + Atlas IP allow-list (`0.0.0.0/0`). |
| Attachments upload fails on Render free tier | Render free tier has ephemeral disk; files are lost on restart. Upgrade plan or migrate to S3 / Vercel Blob. |
| Background scheduler not ticking | Free-tier services sleep. Upgrade or trigger via external cron → `POST /api/scheduler/tick`. |
| Vercel build fails "Module not found" | Ensure the **Root Directory** is `frontend` in Vercel project settings. |
| Vercel build fails on `craco` | Vercel auto-detects CRA; make sure `package.json` has `"scripts": {"build": "craco build"}`. |
| Gemini 3 AI returns 401 | `EMERGENT_LLM_KEY` missing or out of balance — top up at Emergent Profile. |

---

## Appendix D — Cost summary

| Service | Tier | Monthly Cost |
|---|---|---|
| Vercel (frontend) | Hobby (free) | $0 |
| Render (backend) | Free | $0 (with cold starts) |
| Render (backend) | Starter | $7 |
| MongoDB Atlas | M0 Free | $0 |
| MongoDB Atlas | M2 Shared | $9 |
| Custom domain (optional) | — | ~$10/year |
| **Total (free tier)** | | **$0/month** |
| **Total (recommended prod)** | | **~$16/month** |

---

## Appendix E — Backup & disaster recovery

1. **MongoDB Atlas** runs automated backups on paid tiers. On M0 free tier, export manually:
   ```bash
   mongodump --uri "$MONGO_URL" --out backup-$(date +%F)
   ```
2. **Attachments** — if using Render disk, export via SSH periodically. If using Vercel Blob / S3, backups are automatic.
3. **Code** — GitHub is your source of truth. Tag production releases:
   ```bash
   git tag v1.0.0 && git push --tags
   ```

---

**End of Deployment Guide.**
