# ASCENT CRM — Product Blueprint

**Companion desktop + web platform for CLiMB Leadership Lab and other coaching/consulting practices.**

> Status: v1.0 blueprint. This document is the definitive product spec. The accompanying web-based MVP in this repo implements a working demonstration of these features.

---

## 1. Executive Summary

**Ascent CRM** is a privacy-first, modular CRM / quoting / invoicing / marketing platform designed for solo coaches and small consulting teams. It is architected in two deployment modes:

1. **Local-first Windows desktop app** (.NET 9 + WinUI 3 + SQLite + EF Core). Runs fully offline, stores data in the user's `%LOCALAPPDATA%`, auto-updates via MSIX.
2. **Connected web mode** (React + FastAPI + MongoDB) — the working reference implementation in this repo — that mirrors the same data model and can sync bidirectionally with the user's marketing website (e.g. `climbleadershiplab.vercel.app`) via REST + webhooks.

Both modes share a common OpenAPI contract, so a deal captured via a website lead form reaches the desktop app without any custom glue.

**Primary value proposition:** own your client data, automate the paperwork around coaching engagements (quote → invoice → recurring billing → follow-up), and write better client-facing copy with a Gemini-3–powered assistant that is *grounded* in your own CRM records and will *refuse to hallucinate* facts it does not have.

**Core differentiators vs. HubSpot / Dubsado / Paperbell:**
- Native Windows-first (encrypted local DB, no forced cloud)
- Grounded AI with field-level provenance (shows which CRM fields were used)
- Out-of-the-box coaching workflows (5 Voices, discovery call, cohort onboarding)
- GDPR tools as a first-class feature (not a bolt-on)

---

## 2. User Personas & Top Use Cases

| # | Persona | Needs | Top Use Case |
|---|---------|-------|--------------|
| P1 | **Solo executive coach (Sherpa)** — e.g. CLiMB Leadership Lab owner | Book discovery calls, send branded proposals in <10 min, run recurring billing for 100X program, remember every client nuance | Discovery → proposal → signed → recurring invoice → session notes → renewal |
| P2 | **Small consulting firm lead (2–5 seats)** | Shared pipeline, role-based access, forecast | Team pipeline review; partner sees own deals + shared accounts |
| P3 | **Fitness coach / health pro** | Package sales, monthly subscriptions, session reminders, intake forms | Sell 12-week package, auto-charge monthly, send session reminders |
| P4 | **Corporate L&D manager running cohort programs** | Manage 30-person cohort, attendance, invoicing corporate client, per-learner surveys | Create cohort from template, bulk-invite, track completion, issue invoice to L&D dept |
| P5 | **Virtual assistant supporting a coach** | Limited-scope access, cannot delete, can draft emails for approval | Draft quote → coach reviews → sends; cannot view bank fields |
| P6 | **Website visitor becoming lead** | Frictionless capture, GDPR consent, confirmation email | Fills hosted form → consent logged → gets double-opt-in email → shows up as "Basecamp" lead |

### Top 10 use cases (acceptance-level)
1. Add a new contact + company from inbound email in <30 sec
2. Move deal through kanban with inline stage rules (e.g., auto-create quote on "Proposal" stage)
3. Build a quote from price list, send PDF, track acceptance, convert to invoice in 1 click
4. Collect payment via Stripe payment link; subscription auto-bills monthly; handle failed card
5. Publish a hosted lead-capture page with consent + double opt-in + auto-tag
6. Generate a blog post draft grounded in 3 recent client win-stories, with sources shown
7. Suggest a reply to an inbound email using the contact's last 5 interactions
8. Export ALL data for a contact in a single ZIP (GDPR SAR) within the app
9. Right-to-delete workflow: soft-delete 14-day grace, hard-delete with audit entry
10. Nightly encrypted backup to user-chosen folder / OneDrive / S3

---

## 3. Feature List (MVP / Phase 2 / Phase 3)

### MVP (v1.0 — this build)
- Auth (single user + JWT), RBAC skeleton
- Companies, Contacts, Deals, Pipeline Stages (configurable), Kanban + List view
- Custom fields on companies & contacts
- Tags, saved filters, segmentation
- Products / Price Lists with VAT/tax
- Quotes (template, versioning, PDF export, accept-by-link)
- Invoices (numbering, PDF, Stripe payment link, status tracking)
- Stripe Checkout integration + `/api/webhook/stripe`
- Lead forms (embeddable + hosted) with consent capture + double opt-in stub
- AI Studio: content generation + grounded email reply suggester (Gemini 3 via Emergent LLM)
- Analytics dashboard (pipeline conversion, revenue, forecast, invoice aging)
- GDPR Center: consent log, export, right-to-delete
- Audit trail on all mutating endpoints
- Coaching templates library (3 variants: executive, fitness, consultant)
- Integrations Hub (configuration UI + health status)
- Dark "Midnight Mountain" theme; responsive up to 3840px

### Phase 2 (v1.1 — 3 months)
- PayPal alongside Stripe
- Recurring billing / subscriptions UI with dunning
- Email mailbox sync (Microsoft Graph + IMAP/SMTP)
- Automation builder visual editor (triggers + actions)
- Calendly booking → Deal auto-create
- Zoom meeting auto-log
- Multi-step funnel builder with branching
- SEO tools (meta manager, sitemap, schema.org)
- Team seats + RBAC roles (owner, admin, rep, VA, view-only)

### Phase 3 (v1.2 — 6 months)
- Windows native build (.NET 9 + WinUI 3)
- Offline-first sync engine
- Encrypted local backup / restore with versioning
- Zapier / Make full catalog
- SurveyMonkey deep sync (survey results → contact timeline)
- SMS via Twilio
- Advanced forecast (weighted pipeline, AI win-probability)
- Mobile companion (read-only iOS/Android)

---

## 4. Architecture Options

### Option A — .NET 9 + WinUI 3 + SQLite (**RECOMMENDED** for Windows-first)
- **Stack:** .NET 9, WinUI 3, SQLite + EF Core, Quartz.NET for jobs, `HttpClient` for REST, Microsoft Graph SDK for email, MSIX installer, Windows Credential Manager for secrets.
- **Pros:** True native feel, full offline, MSIX auto-update, Windows Hello / BitLocker-aware storage, best integration with Office/Outlook, smallest attack surface.
- **Cons:** Windows-only (by design), slower iteration vs. web, smaller UI-component ecosystem than React.
- **Offline:** Full. Sync engine pushes deltas when online.
- **Complexity:** Medium-high. One engineer can ship MVP in 12 weeks.
- **Cost:** Dev licenses free; no per-user cloud cost for local mode. Code-signing cert ~$200/yr.
- **Maintainability:** Excellent long-term — Microsoft LTS roadmap through 2029+.

### Option B — Electron + React + SQLite (cross-platform desktop)
- **Stack:** Electron, React + Shadcn, better-sqlite3, Node worker for jobs.
- **Pros:** Share code between desktop and web, fast iteration, huge component library.
- **Cons:** 150MB+ binary, higher memory, not truly "native", Windows-style UX polish harder, signing/auto-update more DIY.
- **Offline:** Full.
- **Complexity:** Low-medium.
- **Cost:** Free.
- **Maintainability:** Medium — Electron churn is non-trivial.

### Option C — Web-only SaaS (React + FastAPI + MongoDB) **— this repo's mode**
- **Stack:** React 19, FastAPI, MongoDB (Motor), Emergent LLM, Stripe.
- **Pros:** Zero-install, instant updates, easiest team collaboration.
- **Cons:** No offline, cloud-dependent, privacy-sensitive users may object.
- **Offline:** None (PWA fallback possible).
- **Complexity:** Low.
- **Cost:** Hosting + Mongo Atlas + LLM spend.
- **Maintainability:** Excellent.

### Recommendation
Ship **Option C** first as the reference implementation and hosted service, then fork to **Option A** for the Windows-native edition. Both share the identical REST contract and data model defined in §5 so a desktop client can round-trip data through the same backend or run fully standalone.

---

## 5. Data Model (entities + key fields)

All IDs are UUIDv4 strings. Timestamps are ISO-8601 UTC.

```
User(id, email, password_hash, role[owner|admin|rep|va|view], brand_voice, created_at)

Company(id, name, industry, website, lifecycle_stage, status, notes,
        billing_address:{line1,line2,city,postal,country},
        custom_fields:{k:v}, tags:[str], owner_id→User, created_at, updated_at)

Contact(id, company_id→Company?, first_name, last_name, role_title,
        email, phone, notes, tags:[str], consent:{marketing,newsletter,updated_at,source},
        interaction_count, last_activity_at, custom_fields, owner_id, created_at, updated_at)

PipelineStage(id, name, order, probability, altitude_label[Basecamp|Ascent|Summit|Closed],
              auto_actions:[{trigger,action}])

Deal(id, title, contact_id, company_id, pipeline_stage_id,
     value, currency, probability, expected_close_date, actual_close_date,
     tags, notes, owner_id, status[open|won|lost], created_at, updated_at)

Product(id, sku, name, description, unit_price, currency, tax_rate,
        tier[foundation|ascent|summit], valid_from, valid_to, active)

Quote(id, number, deal_id, contact_id, company_id, status[draft|sent|accepted|declined|expired],
      line_items:[{product_id,qty,unit_price,discount_pct,tax_rate,line_total}],
      subtotal, discount_total, tax_total, grand_total, currency,
      valid_until, terms, version, parent_quote_id?,
      acceptance:{accepted_at,accepted_by,ip,signature_name},
      pdf_url, created_at, updated_at)

Invoice(id, number, quote_id?, contact_id, company_id,
        line_items, subtotal, tax_total, grand_total, currency,
        issue_date, due_date, status[draft|sent|paid|overdue|void|refunded],
        payment_link, stripe_session_id, paid_at, created_at)

PaymentTransaction(id, invoice_id?, session_id, payment_id,
                   amount, currency, status, metadata, created_at, updated_at)

LeadForm(id, name, slug, fields:[{key,label,type,required,options}],
         consent_text, double_opt_in, success_redirect,
         submissions_count, created_at)

FormSubmission(id, form_id, answers:{}, consent_given,
               contact_id?, ip, created_at)

Automation(id, name, trigger:{type,config}, actions:[{type,config}],
           enabled, run_count, last_run_at)

Template(id, kind[coach|fitness|consultant], name, description,
         pipeline_stages[], sample_products[], sample_forms[], sample_emails[])

EmailMessage(id, direction[in|out], contact_id?, deal_id?,
             subject, body, from, to, thread_id, received_at)

Integration(id, kind[stripe|paypal|calendly|zoom|zapier|graph|imap],
            status[connected|error|disconnected], config:{}, last_sync_at)

ConsentLog(id, contact_id, kind, given, source, ip, timestamp)

AuditEntry(id, actor_id, action, entity_type, entity_id,
           before:{}, after:{}, timestamp)

AiGeneration(id, kind[blog|email|reply|quote_summary], prompt, output,
             grounding_fields:[{entity,id,field,value}],
             tone, model, tokens, created_at)
```

### Key relationships
- `Company 1─* Contact`
- `Contact 1─* Deal`, `Company 1─* Deal`
- `Deal 1─* Quote`, `Quote 1─? Invoice`, `Invoice 1─? PaymentTransaction`
- `Contact 1─* EmailMessage`, `Contact 1─* ConsentLog`, `Contact 1─* FormSubmission`
- Every mutating request writes an `AuditEntry`.

---

## 6. Key Workflows

### 6.1 Lead → CRM → Quote → Invoice → Payment → Automation
```
[Website visitor fills hosted form] 
      │
      ▼
POST /api/forms/{slug}/submit  ── writes FormSubmission + ConsentLog
      │
      ▼
Auto-create/merge Contact (by email) with tag "source:web-form"
      │
      ▼
Create Deal in stage "Basecamp" (probability 10%)
      │
      ▼
User drags card → "Ascent: Proposal"
   └─▶ Automation rule: auto-create Quote from template
      │
      ▼
User edits Quote, clicks Send → PDF generated, email with accept-link
      │
      ▼
Prospect clicks accept-link → Quote.status=accepted; Deal.probability=90%
      │
      ▼
1-click "Convert to Invoice" → Invoice created, Stripe payment link attached
      │
      ▼
Prospect pays → Stripe webhook → Invoice.status=paid, Deal stage=Summit (Won)
      │
      ▼
Automation: send onboarding email + create recurring monthly invoice schedule
```

### 6.2 Coaching engagement workflow (Executive Coach template)
1. Discovery call booked (Calendly → webhook → Contact + Deal "Basecamp")
2. Intake form sent (auto), results attached to Contact timeline
3. Proposal generated by AI grounded in intake answers
4. Onboarding email with 5 Voices assessment link
5. Recurring monthly session invoice (6 sessions @ fixed price)
6. Session reminder 24h before (automation)
7. Follow-up note template after each session (logged to Deal timeline)
8. Mid-program feedback survey (SurveyMonkey integration)
9. Renewal reminder 30 days before end

---

## 7. Integration Design

| Integration | Auth | Sync | Failure Handling |
|---|---|---|---|
| Stripe | API key (secret server-side) + webhook signing secret | Webhook push + polling fallback | 3× exponential retry, dead-letter queue, UI badge red |
| PayPal | OAuth client-credentials | IPN webhook | Same retry; reconcile nightly |
| Calendly | OAuth 2.0 user token stored encrypted | Subscribed webhook `invitee.created` | Token refresh on 401; user prompted to re-auth |
| Zoom | OAuth 2.0 | Webhook on meeting end → log to Deal | Log to audit, show in Integrations Hub |
| Microsoft Graph (email) | OAuth 2.0 (device code flow on desktop) | Delta query polling every 5 min | Backoff on 429; show last-sync badge |
| IMAP/SMTP fallback | Username + app-password, encrypted at rest | IMAP IDLE where supported else 2-min poll | Reconnect with backoff |
| Zapier / Make | Outbound webhooks + inbound API-key endpoints | Push-based | Retry 5× with exp backoff, visible in Integrations Hub |
| SurveyMonkey | OAuth 2.0 | Webhook on response | Retry + manual re-sync button |
| Website REST sync | JWT service token | `/api/sync/push` + `/api/sync/pull` with `since` cursor | Idempotent by `external_id`; conflict → last-write-wins with audit |

All secrets encrypted at rest (Windows DPAPI on desktop; AES-256 + `JWT_SECRET`-derived KEK on web). UI surface: `Integrations Hub` page shows each connector's status, last-sync, error detail, "Re-authorize" and "Test" buttons.

---

## 8. AI Design (grounding, brand voice, safe auto-reply)

### 8.1 Grounding strategy
The AI never has free access to the LLM. Every prompt is wrapped by the backend into a **system contract**:

```
SYSTEM:
You are the writing assistant for {brand_voice.name}.
Brand voice: {brand_voice.tone}, {brand_voice.vocabulary_hints}.
HARD RULES:
1. Only use facts present in <CRM_CONTEXT>. If a fact is missing, ASK a specific question rather than inventing.
2. Output JSON: { "draft": "...", "fields_used": [...], "questions_for_user": [...] }
3. Never invent prices, dates, names, or guarantees.
4. If the user asks something outside the provided context, respond with a clarifying question.

<CRM_CONTEXT>
{retrieved contact / deal / last 5 emails / quote}
</CRM_CONTEXT>
```

### 8.2 Retrieval strategy
- For a contact-scoped generation: fetch Contact + Company + last 5 EmailMessages + open Deal + latest Quote → send as structured JSON (not free-text) so the model can cite field names.
- For a blog/marketing generation: fetch top 3 Deals won in last 90 days (anonymized), plus the user's `brand_voice` profile.
- No vector DB needed for MVP — structured retrieval is sufficient and auditable. A Phase-2 upgrade can add embeddings of session notes.

### 8.3 Brand voice settings (per user)
- `tone`: professional | friendly | authoritative | warm-sherpa
- `vocabulary_hints`: free text, e.g. "use ascent/summit metaphors sparingly"
- `signature`: appended to outbound emails
- `banned_phrases`: array (e.g., "cutting-edge", "synergy")

### 8.4 Safe auto-reply policy
The system **never auto-sends**. It always creates a `draft` with:
- A **Fields Used** panel listing every CRM field that influenced the draft (entity + id + field name).
- A **Missing Info** panel with clarifying questions the model needs answered before sending.
- A tone slider + "Regenerate with different tone" button.
- A required human "Send" click. Audit entry records `ai_assisted: true` plus `generation_id`.

### 8.5 Example prompts & outputs

**Blog draft** — prompt: *"Write a 600-word blog post about overcoming Q4 leadership fatigue, aimed at mid-level managers, warm-sherpa tone."*
Output:
```json
{
  "draft": "Every climber knows the sting of altitude on the last pitch...",
  "fields_used": ["brand_voice.tone", "brand_voice.vocabulary_hints"],
  "questions_for_user": ["Should I include a CTA to the 100X Leader Program?"]
}
```

**Quote summary email** — prompt: *"Summarize this quote for the prospect in 4 sentences."*
Output includes only fields from the Quote + Contact context; omits any fact not supplied.

**Reply suggestion** — given an incoming email "Can I get 10% off if we commit to a year?" → Output proposes reply *referencing actual pricing tiers from the user's Price List*, not made-up numbers; if price list lacks a yearly tier, asks the user to confirm before drafting.

---

## 9. Security & Compliance

- **Transport:** TLS 1.2+ everywhere; HSTS on web.
- **At rest (desktop):** SQLite file encrypted via SQLCipher; key derived from Windows DPAPI user scope.
- **At rest (web):** MongoDB TLS; field-level AES-256 for `integration.config` secrets.
- **Secrets:** Windows Credential Manager (desktop) / `.env` + cloud secret manager (web). Never in code.
- **Passwords:** bcrypt cost 12. Account lockout after 10 failures (15-min window).
- **RBAC:** roles `owner | admin | rep | va | view`. Permission matrix checked server-side on every endpoint.
- **Audit:** every CREATE/UPDATE/DELETE writes `AuditEntry` with actor, before, after, IP.
- **Backups:** nightly encrypted ZIP to user-chosen destination; restore wizard verifies integrity hash.
- **GDPR:**
  - Consent captured at point-of-collection, immutable `ConsentLog`.
  - Data Subject Access Request: one-click "Export all data for contact X" → ZIP with JSON + attachments.
  - Right-to-erasure: two-step (soft 14-day, then hard delete + audit tombstone).
  - Data processing register exposed at `Settings → Compliance`.
  - Data residency: MongoDB region configurable per tenant.

---

## 10. UI/UX Wireframe Description

### Global
- **Theme:** "Midnight Mountain" dark palette. Background `#0B0F15`, surface `#161D26`, terracotta primary `#E26E4A`, sage accent `#4F7C8A`.
- **Typography:** Cabinet Grotesk (headings), Manrope (body). No Inter, no purple.
- **Icons:** Phosphor Icons (duotone).
- **Layout:** Left sidebar (224px) + sticky glass top-bar + content area with 32px padding.
- **Signature:** topographic contour SVG at 5% opacity on empty states; altitude-labeled stage badges.

### Screens (MVP)
1. **Login / Sign-up** — centered card on topographic background; brand lockup; single "Begin the ascent" CTA.
2. **Dashboard** — 4 KPI tiles (Open Pipeline $, Won MTD, Invoices Overdue, New Leads), revenue bar chart 12-mo, funnel conversion, recent activity stream, "AI Insights" tile.
3. **Pipeline (Kanban)** — columns per stage with altitude labels (Basecamp → Ascent → Summit → Closed Won / Lost). Cards show: deal name, contact avatar, value, probability bar (elevation-gain indicator), days-in-stage. List-view toggle top-right.
4. **Contacts & Companies** — dense table, saved-filter chips, tag pills, "Add contact" slide-over drawer.
5. **Contact detail** — left 2/3 timeline (emails, notes, meetings, form submissions), right 1/3 profile + custom fields + consent status.
6. **Deals** — table + detail; detail has Quotes, Invoices, Activities tabs.
7. **Products & Price List** — table with tier badge, inline-edit unit price, tax rate.
8. **Quote builder** — left line-items editor, right live preview (branded). Versioning dropdown, "Send & track" button.
9. **Invoices** — table with status chip, bulk "Send payment link", per-row "Copy Stripe link". Detail shows payment history.
10. **Lead Forms** — list + builder (drag-drop fields), embed snippet + hosted URL, submission inbox.
11. **AI Studio** — tabs: Content / Reply Suggester / Brand Voice. Center: prompt + output; right rail: "Fields Used" panel; bottom: tone slider + regenerate.
12. **Automations** — list of rules + simple builder (MVP: pre-built templates, Phase-2 visual graph).
13. **Templates Library** — cards for Executive Coach / Fitness Coach / Business Consultant; "Apply template" imports pipeline stages + products + forms + emails.
14. **Analytics** — tabs: Pipeline / Revenue / Funnel / Email / Aging. Recharts with terracotta + sage palette.
15. **Integrations Hub** — grid of connector tiles with status dot, last-sync, Configure/Test buttons.
16. **Settings → GDPR Center** — consent logs table, export data tool, right-to-erasure workflow, audit log viewer.

### Critical forms
- Contact create (required email; optional company auto-complete).
- Quote line-item (product autocomplete → fills unit price/tax).
- Lead form builder (field type, required, options, consent text).
- Invoice create (from quote or blank; auto-number).

---

## 11. Implementation Plan

| Milestone | Scope | Duration | Done-when |
|---|---|---|---|
| M0 | Repo, CI, design tokens, auth, seed data | 1 wk | login works, seed loads |
| M1 | CRM core (companies, contacts, deals, kanban) | 2 wk | can manage full pipeline |
| M2 | Products + Quotes + PDF export | 1 wk | send quote, mark accepted |
| M3 | Invoices + Stripe | 1 wk | pay a test invoice end-to-end |
| M4 | Lead forms + hosted page + consent | 1 wk | form submission creates contact |
| M5 | AI Studio (Gemini 3 + grounding) | 1 wk | generate grounded reply with fields-used |
| M6 | Analytics + GDPR + Audit | 1 wk | export + delete workflows pass |
| M7 | Templates + Integrations Hub shells | 3 days | apply coach template creates pipeline |
| M8 | Hardening, load-test, docs | 1 wk | 100 concurrent users OK |
| M9 → | Phase 2 (mailbox sync, automation builder, PayPal) | 6 wk | |
| M10 → | Phase 3 (.NET 9 desktop fork) | 10 wk | MSIX installs, offline full CRUD |

### Test strategy
- **Unit:** pytest for services (quote totals, tax, probability rules).
- **Integration:** one test per REST endpoint (success + auth + validation).
- **E2E:** testing_agent_v3 for critical flows (lead→quote→invoice→payment).
- **Regression:** seed data snapshot + API contract tests.

### Backup / restore
- Web: Mongo Atlas continuous backup.
- Desktop: nightly SQLite encrypted ZIP to user-chosen destination (local folder, OneDrive, S3). Restore wizard checks SHA-256.

### Update strategy
- Web: rolling deploy behind feature flags.
- Desktop: MSIX auto-update channel (stable / beta), schema migrations via EF Core migrations with forward-only rule.

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM hallucinates client fact | Med | High (reputational) | Grounding contract + Fields Used panel + never auto-send |
| Stripe webhook missed | Low | Med | Polling fallback + idempotent updater keyed by `session_id` |
| GDPR erasure incomplete (stale replica) | Low | High (fines) | Tombstone + scheduled purge + audit proof |
| Calendly/Zoom OAuth token expires | Med | Low | Refresh-token flow + user banner |
| SQLite corruption on desktop | Low | High | WAL mode + nightly verified backup |
| Payment dispute | Med | Med | Audit trail + quote acceptance proof (IP + signature) |
| Integration API breaking change | Med | Med | Per-connector version pinning + health dashboard |
| Data loss from user error | Med | High | 14-day soft-delete + backup restore UI |
| AI cost overrun | Low | Med | Per-user monthly token cap + model fallback to flash |

---

## 13. Open Questions (max 8)

1. **Windows-only target**: OK to drop macOS entirely, or should Option B (Electron) be budgeted as a fallback?
2. **Currency**: primary is ZAR or USD (CLiMB has both local and international pricing)? Multi-currency required at MVP?
3. **Email provider**: is the user on Microsoft 365 (Graph) or Google Workspace (IMAP)? Drives Phase-2 priority.
4. **Brand assets**: do you have a vector CLiMB logo + brand palette we should mirror in the app header?
5. **Tax rules**: South African VAT (15%) only, or EU VAT + US sales tax from day one?
6. **Payment**: Stripe primary; is PayPal truly required for MVP or can it slip to Phase 2?
7. **Cohort pricing**: do cohort programs need seat-level invoicing (per learner) or single corporate invoice?
8. **Data residency**: any requirement to host data in South Africa / EU specifically?

---

*End of blueprint. The web-based MVP reference implementation lives under `/app/backend` and `/app/frontend`.*
