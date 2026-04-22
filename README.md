# Ascent CRM — CLiMB Leadership Lab

A production-grade CRM + Quoting + Invoicing + Payments + AI + South African Accounting platform, built as the web companion to [climbleadershiplab.vercel.app](https://climbleadershiplab.vercel.app).

> **"Midnight Mountain" theme** · Terracotta + sage palette · Altitude-labelled deal stages (Basecamp → Ridge → Summit).

---

## 📖 Documentation

- **[USER_MANUAL.md](./USER_MANUAL.md)** — complete end-user guide for every feature.
- **[DEPLOYMENT_VERCEL.md](./DEPLOYMENT_VERCEL.md)** — step-by-step instructions to deploy to Vercel (+ Render + MongoDB Atlas).
- **[memory/PRD.md](./memory/PRD.md)** — product requirements + changelog.
- **[memory/ASCENT_CRM_BLUEPRINT.md](./memory/ASCENT_CRM_BLUEPRINT.md)** — 13-section architecture blueprint.

---

## 🚀 Quick Start (local development)

### Prerequisites
- Node.js 18+ and Yarn
- Python 3.11+
- MongoDB (local or Atlas)

### Backend
```bash
cd backend
pip install -r requirements.txt
# Create .env with MONGO_URL, DB_NAME, JWT_SECRET, EMERGENT_LLM_KEY, STRIPE_API_KEY, PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_MODE
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend
```bash
cd frontend
yarn install
# Create .env with REACT_APP_BACKEND_URL=http://localhost:8001
yarn start
```

### Default demo login
- Email: `demo@climbleadershiplab.com`
- Password: `SherpaDemo2026!`

---

## 🧩 Features

- **CRM** — Companies, Contacts, Deals Pipeline (altitude stages)
- **Quoting** — Word + PDF export, attachments, valid-days auto-compute
- **Invoicing** — Stripe + PayPal live checkout
- **Subscriptions** — recurring billing with background scheduler
- **Lead Forms** — multi-step funnels, consent, website integration
- **AI Studio** — Gemini 3 grounded content & reply drafting
- **Automations** — visual builder, executable engine
- **South African Accounting** — COA, journals, Trial Balance, IS, BS, VAT201
- **SEO Tools** — meta pages, sitemap, JSON-LD
- **Team & RBAC** — 6 roles, multi-tenant scoping
- **GDPR Center** — consent log, export-my-data, delete-my-data
- **IMAP inbound mailbox sync** with AI reply drafting

---

## 🛠 Tech Stack

- **Frontend:** React 19 · React Router 7 · Tailwind · Shadcn · Phosphor icons · Recharts
- **Backend:** FastAPI · Motor (async MongoDB) · python-docx
- **AI:** Gemini 3 via Emergent LLM Key
- **Payments:** Stripe Checkout · PayPal REST API v2
- **Storage:** MongoDB · local disk for attachments

---

## 🧪 Tests

```bash
cd backend
pytest tests/
```

---

## 🚀 Deploy to production

See **[DEPLOYMENT_VERCEL.md](./DEPLOYMENT_VERCEL.md)** for the full step-by-step guide.

**TL;DR:**
- Frontend → Vercel (free)
- Backend → Render.com (free tier) or Railway / Fly.io
- Database → MongoDB Atlas (free M0 tier)

Total cost: **$0/month** on free tiers, ~**$16/month** recommended production setup.

---

## 📄 License
Proprietary — CLiMB Leadership Lab. All rights reserved.
