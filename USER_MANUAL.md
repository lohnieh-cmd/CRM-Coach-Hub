# Ascent CRM — User Manual

**Version:** MVP v1.2 · Phase 2 Batch 6 (South African Accounting)
**Audience:** Solo coaches, small consulting firms, fitness coaches, corporate L&D, virtual assistants.
**Stack:** React 19 + FastAPI + MongoDB + Gemini 3 AI + Stripe + PayPal.

---

## Table of Contents
1. [Quick Start](#1-quick-start)
2. [Logging In](#2-logging-in)
3. [Dashboard](#3-dashboard)
4. [CRM — Companies, Contacts, Pipeline](#4-crm)
5. [Products & Price List](#5-products)
6. [Quoting](#6-quoting)
7. [Invoicing & Payments](#7-invoicing)
8. [Subscriptions / Recurring Billing](#8-subscriptions)
9. [Lead Forms & Website Integration](#9-lead-forms)
10. [Tasks & Contact Timeline](#10-tasks)
11. [Email Sync & AI Reply Drafting](#11-email)
12. [AI Studio (Content Generator)](#12-ai-studio)
13. [Automations](#13-automations)
14. [Accounting (South African / SARS)](#14-accounting)
15. [SEO Tools](#15-seo)
16. [Templates (Word + Coaching)](#16-templates)
17. [Integrations Hub](#17-integrations)
18. [Analytics](#18-analytics)
19. [Team & RBAC](#19-team)
20. [GDPR & Audit Log](#20-gdpr)
21. [Troubleshooting](#21-troubleshooting)

---

## 1. Quick Start

1. Open the app URL (your Emergent preview URL or your deployed domain).
2. Log in with the seeded demo account (or your own if deployed):
   - **Email:** `demo@climbleadershiplab.com`
   - **Password:** `SherpaDemo2026!`
3. You will land on the **Dashboard** with seeded demo data (~R161 400 open pipeline, 7 deals across "altitude" stages).
4. Use the left sidebar to navigate.

> **Tip:** The theme is "Midnight Mountain" — terracotta + sage palette. Deal stages use mountain altitude labels (Basecamp → Ridge → Summit).

---

## 2. Logging In

- **Sign up:** `/login` → "Create account" (first user becomes the **owner**).
- **Password reset:** contact your admin (self-service reset is on the roadmap).
- **Accept an invite:** paste the invite link your owner/admin sent you into your browser → `/accept-invite/:token`.

---

## 3. Dashboard

Shows:
- Open pipeline value (ZAR)
- Deals by stage (altitude chart)
- Recent activity
- Upcoming tasks
- Quick links to create Contact / Deal / Quote / Invoice

---

## 4. CRM — Companies, Contacts, Pipeline

### Companies (`/companies`)
- **Add company:** top-right "New Company" button.
- **Edit:** click the **Edit** button on any row → modal opens.
- **Delete:** inside the edit modal, red **Delete** button (soft-delete).
- **Contacts column:** click the count chip to see every contact linked to that company.

### Contacts (`/contacts`)
- **Add contact:** "New Contact" button.
- **Edit:** click the **Edit** button on any row.
- **Delete:** inside edit modal.
- **Contact Detail:** click the contact's name → `/contacts/:id` opens the full profile:
  - Sidebar: email, phone, company, tags, consent status, interaction count.
  - Timeline: emails (inbound red-bordered / outbound sage-bordered), deals, invoices, quotes, form submissions, tasks.
  - **"Draft reply" button** on any inbound email → AI generates grounded response.

### Pipeline (`/pipeline`)
- Kanban board with altitude stages: **Basecamp → Ridge → Summit → Closed-Won / Closed-Lost**.
- Drag-and-drop deals between stages.
- Click a deal card to edit amount, expected close date, probability.

---

## 5. Products & Price List (`/products`)
- Central catalogue of coaching services (e.g. "Executive 1-on-1 Monthly — R15 000").
- Quotes and invoices pull from this list.
- Each product has: name, description, unit price (ZAR), SKU, VAT code, active flag.

---

## 6. Quoting (`/quotes`)

### Creating a quote
1. Click **"New Quote"**.
2. Pick a Contact and optional Company.
3. Set **Valid for (days)** — e.g. `30`. The "Valid Until" date auto-computes (today + 30 days). You can override manually.
4. Add line items from Products or type free-text items.
5. Set VAT (default 15%) and discount %.
6. **Save** → status = `draft`.

### Exporting
- **PDF:** "PDF" button (browser-native print to PDF).
- **Word (.docx):** "Word" button → downloads `Quote_QT-2026-0001.docx` to your browser's default Downloads folder.
  - Windows: `C:\Users\<you>\Downloads`
  - macOS: `~/Downloads`
  - Linux: `~/Downloads`
- Customize the Word template at `/templates` → "Word Quote Template" section.

### Attachments
- Open any quote → scroll to **Attachments** panel.
- Upload PDF / DOCX / PNG / JPG (15 MB max).
- Download or delete per file.

### Sending
- Convert to Invoice: "Convert to Invoice" button (copies line items).
- Email: copy the PDF/DOCX and attach manually (real SMTP is mocked in MVP).

---

## 7. Invoicing & Payments (`/invoices`)

### Creating an invoice
- From a quote: "Convert to Invoice" on any quote.
- Manually: "New Invoice" button.
- Invoice numbers auto-increment (`INV-2026-0001`).

### Payment buttons
Each unpaid invoice shows two payment buttons:
- **Pay (Stripe)** — redirects buyer to Stripe Checkout.
- **PayPal** — redirects buyer to PayPal-hosted approval page (sandbox by default).

### How payment capture works
- **Stripe:** webhook `/api/webhook/stripe` auto-marks invoice paid on `checkout.session.completed`.
- **PayPal:** return URL `?paypal=success&token=<order_id>` polls status → auto-captures APPROVED orders → marks invoice paid.
- An accounting journal posts automatically: **DR Clearing / CR Debtors**.

### Attachments
Same as quotes — upload PDFs/receipts directly on the invoice.

---

## 8. Subscriptions / Recurring Billing (`/subscriptions`)

- Set a contact + product + interval (monthly / quarterly / annual) + start date.
- A background scheduler (5-minute tick) auto-generates invoices from due subscriptions.
- Endpoint `/api/scheduler/status` exposes scheduler state.
- **Dunning:** overdue subscriptions are flagged; user can manually retry billing.

---

## 9. Lead Forms & Website Integration (`/forms`)

### Building a form
- "New Form" → give it a slug (e.g. `executive-coaching-interest`).
- Add fields: text, email, phone, checkbox, select, long-text.
- Add steps for multi-step funnels with conditional `branches` (if answer X → jump to step Y).
- Enable GDPR consent checkbox (logged to audit).

### Website integration (three options, shown in the big card at top of `/forms`)

**Option 1 — Link to hosted page** (easiest):
```
https://<your-app-url>/f/<form-slug>
```
Just set this as the CTA button `href` on your website (e.g. Vercel site).

**Option 2 — iframe embed**:
```html
<iframe src="https://<your-app-url>/f/<form-slug>"
        width="100%" height="600" frameborder="0"></iframe>
```

**Option 3 — Direct API webhook**:
```bash
POST https://<your-app-url>/api/forms/<form-slug>/submit
Content-Type: application/json

{
  "fields": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "message": "Interested in 1:1 coaching"
  },
  "consent_given": true
}
```

Every route auto-creates a Contact + Basecamp-stage Deal + GDPR consent log.

---

## 10. Tasks (`/tasks`)
- Auto-created by automations or added manually.
- Status: open / done.
- Filters: open / done / all.
- Link to a contact or deal.

---

## 11. Email Sync & AI Reply Drafting

### Manual email logging
- On any contact page → "Log Email" → paste subject + body + direction (inbound/outbound).
- Interaction counter auto-increments.

### IMAP live sync (`/email-sync`)
- Enter IMAP host, port, username, app password, SSL on/off.
- Polls your mailbox and auto-matches incoming messages to contacts by sender email.
- **Gmail:** requires an [App Password](https://myaccount.google.com/apppasswords).
- **Outlook / Office 365:** basic-auth IMAP was disabled by Microsoft in Sept 2024 — you need a Microsoft-generated app password.

### AI Reply Drafting
- On any inbound email in a contact's timeline → "Draft reply" button.
- Gemini 3 generates a **grounded** reply using:
  - The contact's history
  - Your real price list (won't invent prices)
  - Open deals & quotes
- UI shows **Fields Used** + **Missing Info** panels so you can see exactly what the AI knew.

---

## 12. AI Studio (`/ai-studio`)
- Prompts for: blog post, email campaign, LinkedIn post, lead-magnet, SEO meta, coaching template, proposal intro.
- All generations are grounded with your CRM data (brand voice, services, recent wins).
- Output is copy-paste ready.

---

## 13. Automations (`/automations`)

### Visual builder
- Drag-and-drop triggers → actions.
- **Triggers:** new contact, form submitted, deal stage changed, invoice paid, invoice overdue, tag added, task overdue.
- **Actions:** create task, send email log, add tag, move deal stage, webhook POST, AI generate + log.

### Example flows (prebuilt)
- "Welcome new lead" — form submit → create Basecamp deal → assign rep task.
- "Overdue invoice" — 7-day trigger → task for owner + email log.
- "Hot lead tag" — deal reaches Summit → AI drafts proposal.

---

## 14. Accounting (`/accounting`) — South African / SARS compliant

### 8 tabs:
1. **Overview** — seeded status, current period, quick stats.
2. **CoA (Chart of Accounts)** — 66 pre-seeded SA accounts (Assets / Equity / Liabilities / Income / Expenses).
3. **Journals** — list + "New Entry" modal with live DR=CR balance check.
4. **Trial Balance** — CSV export.
5. **Income Statement** — with headline-27% corporate tax estimate.
6. **Balance Sheet** — current-year earnings auto-roll-up.
7. **VAT201** — boxes 1/2/3/14/15 + net payable (for manual upload to SARS eFiling).
8. **Periods** — open / close / lock / reopen; accountant sign-off + note.

### Key rules
- Double-entry: every journal must balance (sum DR = sum CR).
- Auto-journals:
  - **Invoice created:** DR Debtors / CR Revenue / CR VAT Output.
  - **Payment captured:** DR Stripe-PayPal Clearing / CR Debtors.
- **Period lock:** once locked, no new journals can post to that period (except by accountant role with sign-off).
- **VAT period:** bi-monthly (VAT Category A/B) or monthly (Category C) — configurable.

### ⚠️ Disclaimer (displayed in-app)
> Scaffolding for a SA coaching business. All computations (TB, IS, BS, VAT201, 27% corporate tax estimate) are for **accountant review**. **Must be signed off by a CA(SA) / SAICA / SAIPA member before filing with SARS.** Not a replacement for professional advice. SARS eFiling submission is NOT integrated — we produce reports you upload manually.

### First-time setup
1. Go to `/accounting` → Overview tab.
2. Click **"Seed Chart of Accounts"** (idempotent — safe to click multiple times).
3. Start creating journals or let invoices auto-post.

### Roles
- **Owner / Admin / Accountant:** can post, close, lock, reopen, sign off.
- **Rep / VA / View:** read-only (403 on any write).

---

## 15. SEO Tools (`/seo`)
- Meta tag generator for any URL/page (title, description, OG image).
- Auto-generates `sitemap.xml`.
- AI-powered JSON-LD structured data (service, LocalBusiness, FAQ).

---

## 16. Templates (`/templates`)

### Word Quote Template editor
6 customizable fields:
- `title_label` (e.g. "PROPOSAL" or "QUOTE")
- `company_name`
- `accent_color_hex` (live colour swatch)
- `tagline`
- `footer_text`
- `signature_block`

Click **"Preview Word"** to export the first quote with your saved settings.

### Coaching templates
3 prebuilt packages (onboarding workbook, 90-day plan, quarterly review).

---

## 17. Integrations Hub (`/integrations`)

| Integration | Status |
|---|---|
| Stripe | ✅ Live (user provides API key) |
| PayPal | ✅ Live (sandbox by default) |
| Gemini 3 AI | ✅ Live (Emergent LLM key) |
| IMAP inbound | ✅ Live (user provides app password) |
| Calendly | 📝 Inbound webhook live · OAuth outbound: MOCKED |
| Zoom | 🚧 MOCKED |
| Zapier / Make | 🚧 MOCKED |
| SurveyMonkey | 🚧 MOCKED |
| Microsoft Graph | 🚧 MOCKED |

Integrations marked MOCKED are awaiting user-supplied sandbox credentials.

---

## 18. Analytics (`/analytics`)
- Pipeline value trend
- Win / loss by stage
- Revenue by product
- Lead source attribution
- Conversion funnel (form → deal → invoice → paid)

---

## 19. Team & RBAC (`/team`)

### Roles
- **owner** — full access, billing, team management.
- **admin** — full CRM/accounting access except billing.
- **accountant** — full accounting, read-only CRM.
- **rep** — CRM read/write, no accounting, no team mgmt.
- **va** — scoped (contacts + tasks only).
- **view** — read-only everywhere.

### Inviting a teammate
1. `/team` → "Invite member" → email + role.
2. Copy the invite link (owner/admin only) → send via any channel.
3. Invitee opens link → `/accept-invite/:token` → creates account → auto-linked to your team.

### Multi-tenancy
Every record is scoped via `team_owner_id`. No cross-tenant reads are possible.

---

## 20. GDPR Center & Audit (`/gdpr`)

### GDPR
- Consent log per contact (when/where consent was given).
- Export-my-data (JSON bundle per contact).
- Delete-my-data (hard-delete on request).

### Audit log (`/audit`)
- Every write action is logged: actor, action, resource, timestamp, payload diff.
- Filter by actor, action, date range.
- Paginated (`?limit=100&after_id=<id>`).

---

## 21. Troubleshooting

| Problem | Fix |
|---|---|
| Can't log in | Check `/app/memory/test_credentials.md` for the seeded demo account. |
| Accounting reports empty | Click "Seed Chart of Accounts" on `/accounting` Overview. |
| Word download "missing" | Check your browser's **Downloads** folder (Windows: `C:\Users\<you>\Downloads`). |
| Stripe button does nothing | Ensure `STRIPE_API_KEY` is set in backend `.env` and backend has restarted. |
| PayPal button does nothing | Ensure `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE` are set. |
| IMAP sync failing | Use an **app password**, not your regular password. Microsoft users: basic-auth IMAP disabled Sept 2024. |
| AI Studio returns error | Emergent LLM key may be out of balance — top up at Profile → Universal Key → Add Balance. |
| Frontend blank after deploy | Check `REACT_APP_BACKEND_URL` in `frontend/.env` matches your deployed backend. |

---

## Support & Updates
- Codebase: [github.com/lohnieh-cmd/CRM-Coach-Hub](https://github.com/lohnieh-cmd/CRM-Coach-Hub) (or your fork).
- Roadmap: see `/app/memory/PRD.md`.
- Tests: `pytest backend/tests/`.

---

**End of User Manual.**
