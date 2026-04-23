# Ascent CRM — User Manual

**Version:** MVP v1.2 · Phase 2 complete (Batches 1–7 + Batches D / E / F)
**Last updated:** Apr 2026
**Audience:** Solo coaches, small consulting firms, fitness coaches, corporate L&D, virtual assistants, SA accountants.
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
10. [Tasks](#10-tasks)
11. [Email Sync & AI Reply Drafting](#11-email)
12. [AI Studio](#12-ai-studio)
13. [Automations](#13-automations)
14. [Accounting — SA double-entry](#14-accounting)
    - 14.1 Chart of Accounts · Journals · Trial Balance · IS · BS · VAT201 · Periods
    - 14.2 Bank Accounts + CSV import + Reconciliation
    - 14.3 Fixed Assets + Depreciation
    - 14.4 Receipts OCR (Gemini Vision)
    - 14.5 Payroll & Tax (Employees · EMP201 auto-journal · IRP6 · Dividends Tax)
    - 14.6 AFS PDF bundle + Digital sign-off signature
15. [SEO Tools](#15-seo)
16. [Templates (Word quote editor + coaching templates)](#16-templates)
17. [Integrations Hub](#17-integrations)
18. [Analytics](#18-analytics)
19. [Team & RBAC](#19-team)
20. [GDPR & Audit log](#20-gdpr)
21. [Attachments (quotes & invoices)](#21-attachments)
22. [Troubleshooting](#22-troubleshooting)
23. [API quick reference](#23-api-reference)

---

## 1. Quick Start

1. Open the app URL (your Emergent preview URL or deployed domain).
2. Log in with the seeded demo account (or your own if deployed):
   - **Email:** `demo@climbleadershiplab.com`
   - **Password:** `SherpaDemo2026!`
3. You land on the **Dashboard** with seeded demo data (~R161 400 open pipeline, 7 deals across "altitude" stages).
4. Use the left sidebar to navigate.

> **Theme:** "Midnight Mountain" — terracotta + sage palette. Deal stages are altitude labels (Basecamp → Intake → Proposal Sent → Contract Signed → Engaged → Won / Lost).

---

## 2. Logging In

- **Sign up:** `/login` → "Create account" (first user becomes the **owner**).
- **Accept an invite:** paste the invite link your owner/admin sent you into your browser → `/accept-invite/:token`.
- **Password reset:** contact your admin (self-service reset is on the roadmap).

---

## 3. Dashboard

- Open pipeline value (ZAR) · Weighted forecast · Revenue YTD · Outstanding invoices.
- Revenue chart (last 12 months).
- Altitude map — deals per stage with counts + value.
- Recent Activity feed · Upcoming tasks.
- AI Studio shortcut → "Draft a grounded reply".

---

## 4. CRM — Companies, Contacts, Pipeline <a id="4-crm"></a>

### Companies (`/companies`)
- **New / Edit / Delete** buttons on every row (soft-delete via `deleted_at`).
- **Contacts column:** click the count chip → modal listing every contact linked to that company.

### Contacts (`/contacts`)
- **Edit** button on every row (solid secondary-style, not ghost).
- Contact detail page (`/contacts/:id`):
  - Sidebar: email / phone / company / tags / consent / interaction count.
  - Timeline: emails (terracotta-bordered inbound / sage-bordered outbound), deals, invoices, quotes, form submissions, tasks.
  - **"Draft reply" button** on any inbound email → Gemini 3 writes a grounded response using your real price list + contact history.

### Pipeline (`/pipeline`)
- Kanban across the altitude stages.
- Drag-and-drop deals; click a card to edit amount, expected-close date, probability.

---

## 5. Products & Price List (`/products`) <a id="5-products"></a>
- Central catalogue of coaching services (e.g. "Executive 1-on-1 Monthly — R15 000").
- Quotes and invoices pull from this list.
- Each product: name, description, unit price (ZAR), SKU, VAT code, active flag.

---

## 6. Quoting (`/quotes`) <a id="6-quoting"></a>

### Creating a quote
1. "New Quote" → pick Contact + optional Company.
2. Set **Valid for (days)** (e.g. `30`) — "Valid Until" auto-computes (today + 30); manual override wins.
3. Add line items from Products or free text.
4. VAT default 15%; set per-line discount %.
5. Save → status = `draft`.

### Exporting
- **PDF:** browser-native print to PDF.
- **Word (.docx):** "Word" button → downloads `Quote_QT-2026-0001.docx`.
- Customise the Word template at `/templates` (title label, accent colour, tagline, footer, signature).

### Attachments
- Each quote has an attachment panel (see §21).

### Converting
- "Convert to Invoice" copies the line items into a new invoice in one click.

---

## 7. Invoicing & Payments (`/invoices`) <a id="7-invoicing"></a>

### Creating an invoice
- From a quote, or "New Invoice" manually.
- Numbers auto-increment (`INV-2026-0001`).

### Payment buttons
- **Pay (Stripe)** — redirects to Stripe Checkout.
- **PayPal** — redirects to PayPal-hosted approval page (sandbox by default).

### Auto-capture flow
- **Stripe:** webhook `/api/webhook/stripe` marks invoice paid on `checkout.session.completed`.
- **PayPal:** return URL `?paypal=success&token=<order_id>` polls status → auto-captures → marks invoice paid.
- On successful payment the accounting module auto-posts **DR Stripe/PayPal Clearing / CR Debtors**.

---

## 8. Subscriptions / Recurring Billing (`/subscriptions`) <a id="8-subscriptions"></a>
- Set contact + product + interval (monthly / quarterly / annual) + start date.
- A background asyncio scheduler (5-min tick) auto-generates invoices from due subscriptions.
- `/api/scheduler/status` exposes scheduler state.
- **Dunning:** overdue subs are flagged; user can manually retry.

---

## 9. Lead Forms & Website Integration (`/forms`) <a id="9-lead-forms"></a>

### Building a form
- Give it a slug (e.g. `executive-coaching-interest`).
- Add fields (text / email / phone / checkbox / select / long-text).
- Add multi-step funnels with conditional `branches` (if answer X → jump to step Y).
- GDPR consent checkbox (logged to audit).

### Website Integration card (top of `/forms`)

**Option 1 — Hosted page** (easiest):
```
https://<your-app-url>/f/<form-slug>
```

**Option 2 — iframe embed:**
```html
<iframe src="https://<your-app-url>/f/<form-slug>" width="100%" height="600" frameborder="0"></iframe>
```

**Option 3 — Direct API webhook:**
```bash
POST https://<your-app-url>/api/forms/<form-slug>/submit
Content-Type: application/json
{ "fields": { "name": "Jane Doe", "email": "jane@example.com" }, "consent_given": true }
```

Every route auto-creates Contact + Basecamp Deal + GDPR consent log and feeds Automations / AI Studio.

---

## 10. Tasks (`/tasks`) <a id="10-tasks"></a>
- Auto-created by automations or added manually.
- Status: `open` / `done`.
- Filters: open / done / all.
- Links to contact or deal.

---

## 11. Email Sync & AI Reply Drafting <a id="11-email"></a>

### Manual email logging
- On any contact → "Log Email" → paste subject + body + direction.
- Interaction counter auto-increments.

### IMAP live sync (`/email-sync`)
- Enter IMAP host, port, username, app password, SSL toggle.
- Polls your mailbox and auto-matches incoming messages to contacts by sender email.
- **Gmail:** requires an [App Password](https://myaccount.google.com/apppasswords).
- **Outlook / Office 365:** Microsoft disabled basic-auth IMAP Sept 2024 — you need an app password.

### AI Reply Drafting
- On any inbound email → "Draft reply".
- Gemini 3 generates a **grounded** reply using the contact's history, your real price list, open deals & quotes.
- UI shows **Fields Used** + **Missing Info** panels so you can see exactly what the AI knew.

---

## 12. AI Studio (`/ai-studio`) <a id="12-ai-studio"></a>
- Prompts for: blog post, email campaign, LinkedIn post, lead magnet, SEO meta, coaching template, proposal intro.
- All generations are grounded with your CRM data (brand voice, services, recent wins). Output is copy-paste ready.

---

## 13. Automations (`/automations`) <a id="13-automations"></a>

### Visual builder
- Drag-and-drop triggers → actions.
- **Triggers:** new contact, form submitted, deal stage changed, invoice paid, invoice overdue, tag added, task overdue.
- **Actions:** create task, log email, add tag, move deal stage, webhook POST, AI generate + log.

### Prebuilt flows
- **Welcome new lead** — form submit → create Basecamp deal → assign rep task.
- **Overdue invoice** — 7-day trigger → task + logged email.
- **Hot lead tag** — deal reaches Summit → AI drafts proposal.

---

## 14. Accounting (`/accounting`) — South African / SARS compliant <a id="14-accounting"></a>

11 tabs, covering a full double-entry accounting system for a SA SMB.

### 14.1 Core (tabs 1–8)

| # | Tab | What it does |
|---|---|---|
| 1 | Overview | Seeded status, current period, quick stats |
| 2 | CoA | 66 pre-seeded SA accounts (Assets / Equity / Liabilities / Income / Expenses) |
| 3 | Journals | List + "New Entry" modal with live DR=CR balance check |
| 4 | Trial Balance | CSV / PDF export |
| 5 | Income Statement | With headline-27% corporate tax estimate |
| 6 | Balance Sheet | Current-year earnings auto-roll-up |
| 7 | VAT 201 | Boxes 1/2/3/14/15 + net payable (for manual upload to SARS eFiling) |
| 8 | Periods | Open / close / lock / reopen + accountant sign-off + note |

#### First-time setup
1. `/accounting` → Overview tab → **"Seed Chart of Accounts"** (idempotent — safe to click again).
2. Start creating journals, or let invoices auto-post.

#### Auto-journals
- **Invoice created:** DR Debtors / CR Revenue / CR VAT Output.
- **Payment captured:** DR Stripe-PayPal Clearing / CR Debtors.
- **Period lock:** once locked, no new journals can post to that period.

### 14.2 Bank Accounts + CSV Import + Reconciliation (tab 9: **Bank & Recon**)

- **Register a bank account** — friendly name + GL account code (default `21000` Bank — FNB Current).
- **Upload CSV:** columns `date`, `description`, `amount`, optional `reference`. Any bank export works (just map the columns once).
- **Money-in matching:** shows candidate unpaid invoices by amount (±5 % tolerance to avoid R50 matching an R50 000 invoice) → one-click reconcile → posts DR Bank / CR Debtors.
- **Money-out matching:** ranks your tenant's top-10 expense accounts by recent-usage frequency for one-click categorisation.
- **Unreconcile** reverses the journal using the **original transaction date** (important: doesn't bleed into current VAT period).
- **Dup-hash** is owner-scoped (salted with your user id) — prevents re-importing the same line twice, no cross-tenant side channel.

### 14.3 Fixed Assets + Depreciation (tab 10: **Fixed Assets**)

- **Add an asset:** name, cost, date acquired, useful-life (months), depreciation method (straight-line by default), GL codes (defaults: `11100` asset / `11110` accumulated depreciation / `82500` expense).
- **Run monthly depreciation** for any period → posts DR Depreciation Expense / CR Accumulated Depreciation for every asset, transactionally.
- **Disposal** handling: writes off the remaining carrying value.
- Integrated into Balance Sheet (net book value) and the Cash Flow statement (depreciation add-back).

### 14.4 Receipts OCR (tab 11: **Receipts (OCR)**)

- **Upload receipt image** (PNG/JPG/PDF).
- **Gemini Vision** parses vendor, date, net, VAT, category suggestion.
- Review extracted fields → adjust category → **Post** → posts DR Expense (VAT Input) / CR Bank or Accruals.
- Deleting a posted receipt requires reversing the journal first (safety).

### 14.5 Payroll & Tax (`Payroll & Tax` tab)

4 sub-tabs: **Employees · EMP201 · IRP6 · Dividends Tax**.

#### Employees register
- **Name · Role · Monthly Gross (ZAR) · Tax status** (standard / director / non-resident).
- **PAYE refinements (optional):**
  - **Date of birth** — drives SARS age-based rebate stack (primary R17 235 + secondary R9 444 for 65+ + tertiary R3 145 for 75+).
  - **Medical-aid members** — MSFTC of R364/main + R364/first dep + R246/each additional, monthly, annualised.
  - **Retirement / pension contribution** — deducted from taxable income, capped at min(27.5 % × gross, R350 000 / year).
- **Terminate** soft-deletes (keeps historical records).

#### EMP201 monthly report
- Pick any `YYYY-MM` period → **Run** — displays:
  - Per-employee: gross, PAYE, UIF (employee + employer), SDL, net pay, total cost to employer.
  - Totals + **EMP201 payable to SARS** (= PAYE + UIF total + SDL).
- Uses **SA 2025/26 sliding scale** (7 brackets, from 18 % to 45 %) with all the refinements above.
- **SDL** applies only if annual payroll > R500 000 threshold.
- **UIF base** capped at R17 712 per month.

##### ⭐ EMP201 Auto-journal (finalise → GL) — NEW
Once the numbers look right, click **"Post to GL"**. One balanced journal is posted:

```
DR 82600 Salaries & Wages     (total gross)
DR 82700 UIF Contribution (Employer) (employer UIF)
DR 82800 SDL Contribution (Employer) (SDL)
    CR 53000 PAYE Payable         (total PAYE)
    CR 53100 UIF Payable          (employee + employer UIF)
    CR 53200 SDL Payable          (SDL)
    CR 21000 Bank — Current       (net pay to employees)
```

- **Idempotent** — one active posting per (owner, period). 409 if you try to post twice.
- **Reverse journal** button un-finalises the period (creates a reversing entry) so you can edit and re-post.
- Posted journal appears in the Journals tab with `source = "payroll"` and reference `EMP201-YYYY-MM`.

#### IRP6 Provisional Tax
- Enter `tax_year` (2026 = ending Feb 2026), `period` (1 = Aug / 2 = Feb), `estimated_taxable_income`, `taxable_income_basic` (SARS assessment), `provisional_payment_prior`.
- **Period 1:** 50 % × (est × 27 %) − prior.
- **Period 2:** full tax − prior. 20 % under-estimation penalty if taxable > R1m and estimate < 80 % of basic.
- Workpaper persisted; due-by date auto-computed.

#### Dividends Tax
- Declare a dividend → 20 % WHT for SA resident individuals & non-residents; **0 %** for SA resident companies (s64F exemption).
- Summary endpoint returns totals for any date range (monthly DTR01 cadence).

### 14.6 AFS PDF bundle + Digital sign-off (tab 8: **Periods & Sign-off**)

One branded PDF in a single click — the accountant's pack for review and SARS/CIPC submission.

**Contents (7 pages):**
1. Cover page (company name, period end, IFRS for SMEs notice)
2. Statement of Comprehensive Income (IS)
3. Statement of Financial Position (BS)
4. Statement of Cash Flows (indirect method: Operating / Investing / Financing + reconciliation)
5. VAT 201 summary (boxes 1/2/3/14/15 + payable)
6. Notes to the AFS — 8 auto-generated IFRS-for-SMEs notes (reporting framework, going concern, revenue recognition, PPE, tax, VAT, financial risk, related parties)
7. Accountant sign-off block

**Usage:**
1. Periods tab → **"AFS bundle · accountant-ready pack"** card.
2. Pick From / To dates (defaults to SA fiscal year: 1 Mar → today).
3. Click **"Download PDF"** → file lands in your browser's Downloads folder as `AFS_<Company>_<date>.pdf`.

#### ⭐ Digital sign-off signature — NEW (Batch F)
Accountants can upload a PNG/JPEG signature once and every AFS export embeds it automatically on page 7 — no more printing, signing, scanning.

1. Periods tab → **"Digital signature for AFS bundle"** card (top of the page).
2. Fill in: Accountant name, Firm, Registration (CA(SA) / SAIPA / SAICA), Signed date.
3. Upload a PNG or JPEG (max 2 MB) — transparent PNGs work best.
4. Click **"Save signature"** → a green "Signature on file" banner appears.
5. Re-generate the AFS bundle → page 7 now has the full pre-filled sign-off with embedded signature.
6. Click **"Remove"** anytime to revert to blank signature lines.

### Roles for accounting
- **Owner / Admin / Accountant:** full write (seed, post, close, lock, sign off, post EMP201, upload signature).
- **Rep / VA / View:** read-only (403 on any write).

### ⚠️ Disclaimer (displayed in-app)
> Scaffolding for a SA SMB. All computations (TB, IS, BS, VAT201, 27 % corporate tax estimate, EMP201, IRP6, DT) are **for accountant review**. **Must be signed off by a CA(SA) / SAIPA / SAICA member before filing with SARS.** SARS eFiling submission is NOT integrated — we produce reports you upload manually.

---

## 15. SEO Tools (`/seo`) <a id="15-seo"></a>
- Meta-tag generator (title / description / OG image) per page.
- Auto-generates `sitemap.xml`.
- AI-generated JSON-LD (Service, LocalBusiness, FAQ).

---

## 16. Templates (`/templates`) <a id="16-templates"></a>

### Word Quote Template editor
6 customisable fields: `title_label`, `company_name`, `accent_color_hex` (live swatch), `tagline`, `footer_text`, `signature_block`.
Click **"Preview Word"** to export the first quote using your saved settings.

### Coaching templates
3 prebuilt packages: onboarding workbook, 90-day plan, quarterly review.

### "Where are my downloads?" cheat-sheet
In-app reminder of default Downloads folder paths for Windows, macOS, Linux.

---

## 17. Integrations Hub (`/integrations`) <a id="17-integrations"></a>

| Integration | Status |
|---|---|
| Stripe Checkout | ✅ Live (user provides API key) |
| PayPal REST v2 | ✅ Live (sandbox-ready; needs `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET`) |
| Gemini 3 AI (text + vision) | ✅ Live (Emergent LLM key) |
| IMAP inbound mailbox sync | ✅ Live (user provides app password) |
| Calendly — **inbound webhook** | ✅ Live |
| Calendly — OAuth outbound | 🚧 MOCKED (awaiting user sandbox) |
| Zoom | 🚧 MOCKED |
| Zapier / Make | 🚧 MOCKED |
| SurveyMonkey | 🚧 MOCKED |
| Microsoft Graph | 🚧 MOCKED |

MOCKED integrations are stubbed awaiting user-supplied sandbox credentials.

---

## 18. Analytics (`/analytics`) <a id="18-analytics"></a>
- Pipeline value trend
- Win/loss by stage
- Revenue by product
- Lead-source attribution
- Conversion funnel (form → deal → invoice → paid)

---

## 19. Team & RBAC (`/team`) <a id="19-team"></a>

### Roles
| Role | What they can do |
|---|---|
| **owner** | Full access, billing, team management |
| **admin** | Full CRM/accounting, no billing |
| **accountant** | Full accounting (post journals, close periods, run EMP201/IRP6, upload AFS signature); read-only CRM |
| **rep** | CRM read/write, no accounting, no team mgmt |
| **va** | Scoped (contacts + tasks only) |
| **view** | Read-only everywhere |

### Inviting a teammate
1. `/team` → "Invite member" → email + role.
2. Copy the invite link (owner/admin only) → send via any channel.
3. Invitee opens link → `/accept-invite/:token` → creates account → auto-linked to your team.

### Multi-tenancy
Every record is scoped via `team_owner_id`. No cross-tenant reads are possible; verified by 40+ tenant-isolation tests.

---

## 20. GDPR Center & Audit log <a id="20-gdpr"></a>

### GDPR (`/gdpr`)
- Consent log per contact (when / where consent was given).
- Export-my-data (JSON bundle per contact).
- Delete-my-data (hard-delete on request).

### Audit log (`/audit`)
- Every write action logged: `actor_id`, action, resource, timestamp, payload diff.
- Filter by actor, action, date range.
- Paginated: `?limit=100&after_id=<id>` (cursor-based).

---

## 21. Attachments (quotes & invoices) <a id="21-attachments"></a>

Explicit endpoints — no catch-all routes:
- `POST /api/quotes/{id}/attachments` · `GET /api/quotes/{id}/attachments`
- `POST /api/invoices/{id}/attachments` · `GET /api/invoices/{id}/attachments`
- `GET /api/attachments/{att_id}/download` · `DELETE /api/attachments/{att_id}`

**Limits:** 15 MB per file. **Allowed:** `.pdf .docx .doc .png .jpg .jpeg`.
**Disk layout:** `/app/backend/uploads/<owner_id>/{quotes|invoices}/<rid>/<att_id>.<ext>`.
**Security:** owner-scoped; cross-tenant attempts 404.

In the UI, open any quote or invoice → Attachments panel → drag-and-drop or file-picker upload → per-row Download + Delete buttons.

Non-attachable resources (contacts, companies, deals) 404 cleanly at the routing layer.

---

## 22. Troubleshooting <a id="22-troubleshooting"></a>

| Problem | Fix |
|---|---|
| Can't log in | Check `/app/memory/test_credentials.md`. Seeded demo: `demo@climbleadershiplab.com` / `SherpaDemo2026!`. |
| Accounting reports empty | Click **"Seed Chart of Accounts"** on `/accounting` Overview. |
| Word download missing | Check your browser's **Downloads** folder (Windows: `C:\Users\<you>\Downloads`). In-app cheat-sheet at `/templates`. |
| Stripe button does nothing | Ensure `STRIPE_API_KEY` is set in `backend/.env` and supervisor restarted. |
| PayPal button does nothing | Ensure `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE` are set. |
| IMAP sync failing | Use an **app password**, not your regular password. Microsoft: basic-auth IMAP was disabled Sept 2024. |
| AI Studio / reply draft error | Emergent LLM key may be out of balance — top up at Profile → Universal Key → Add Balance. |
| Frontend blank after deploy | Check `REACT_APP_BACKEND_URL` in `frontend/.env` matches your deployed backend. |
| EMP201 "Post to GL" 409 | Period is already finalised. Click **Reverse journal** first, then re-post. |
| AFS PDF has blank signature | Upload a PNG/JPEG at Periods → "Digital signature for AFS bundle", then re-export. |
| Bank CSV import duplicates | The dup-hash is owner-scoped; retrying the same CSV skips already-imported rows automatically. |
| Receipt OCR wrong values | Click **Edit** on the receipt before posting — Gemini values are always editable. |

---

## 23. API quick reference <a id="23-api-reference"></a>

Full list in `backend/server.py` + sub-modules. Highlights:

### Auth
- `POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/auth/accept-invite`
- `GET /api/auth/me` · `GET/PUT /api/auth/quote-template`

### CRM
- `GET/POST/PATCH/DELETE /api/contacts|companies|deals|tasks|emails`
- `GET /api/companies/{cid}/contacts`

### Billing
- `GET/POST/PATCH/DELETE /api/quotes|invoices|products|subscriptions`
- `GET /api/quotes/{id}/export/docx`
- `POST /api/quotes/{id}/attachments` · `POST /api/invoices/{id}/attachments`

### Payments
- `POST /api/payments/stripe/checkout` · `POST /api/webhook/stripe`
- `POST /api/payments/paypal/checkout` · `GET /api/payments/paypal/status/{order_id}` · `POST /api/webhook/paypal`

### Accounting core
- `POST /api/accounting/seed`
- `GET/POST/PATCH /api/accounting/accounts`
- `GET/POST /api/accounting/journals` · `POST /api/accounting/journals/{jid}/reverse`
- `GET /api/accounting/reports/trial-balance` · `income-statement` · `balance-sheet` · `vat201`
- `GET /api/accounting/reports/general-ledger/{account_id}`
- `GET/POST /api/accounting/periods` · `POST /api/accounting/periods/{p}/{close|lock|reopen|signoff}`
- `GET /api/accounting/reports/{trial-balance|income-statement|balance-sheet}/pdf`

### Accounting — Bank / Fixed Assets / Receipts
- `GET/POST/PATCH /api/accounting/bank-accounts`
- `POST /api/accounting/bank-transactions/import` · `GET /api/accounting/bank-transactions`
- `POST /api/accounting/bank-transactions/{tid}/reconcile` · `DELETE /api/accounting/bank-transactions/{tid}/reconcile`
- `GET /api/accounting/bank-transactions/{tid}/suggest-matches`
- `GET/POST/PATCH/DELETE /api/accounting/fixed-assets`
- `POST /api/accounting/fixed-assets/depreciate?period=YYYY-MM`
- `POST/GET /api/accounting/receipts` · `POST /api/accounting/receipts/{rid}/post`

### Accounting — Payroll & Tax
- `GET/POST/PATCH/DELETE /api/accounting/employees`
- `GET /api/accounting/reports/emp201?period=YYYY-MM`
- `POST /api/accounting/reports/emp201/{period}/post` · `GET /api/accounting/reports/emp201/{period}/posting` · `DELETE /api/accounting/reports/emp201/{period}/post`
- `POST/GET /api/accounting/reports/irp6`
- `POST/GET /api/accounting/reports/dividends-tax` · `GET /api/accounting/reports/dividends-tax/summary`

### Accounting — AFS
- `GET /api/accounting/reports/afs-bundle/pdf?date_from=&date_to=`
- `POST /api/accounting/afs/signature` (multipart) · `GET /api/accounting/afs/signature` · `DELETE /api/accounting/afs/signature`

### Other
- `GET/POST /api/forms` · `POST /api/forms/{slug}/submit` · `POST /api/webhook/calendly`
- `POST /api/ai/generate` · `GET /api/seo/{meta|sitemap.xml|jsonld}`
- `GET /api/audit?limit=100&after_id=<id>`
- `GET /api/team/invites` · `POST /api/team/invites`
- `POST/GET/DELETE /api/imap/config` · `POST /api/imap/sync`

---

## Support & Updates
- Codebase: [github.com/lohnieh-cmd/CRM-Coach-Hub](https://github.com/lohnieh-cmd/CRM-Coach-Hub) (or your fork).
- Roadmap: `/app/memory/PRD.md`.
- Tests: `cd backend && pytest` — currently **244 pass + 4 skip** (2 PayPal env-fails pending sandbox credentials).

---

**End of User Manual.**
