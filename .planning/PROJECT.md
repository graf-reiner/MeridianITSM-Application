# MeridianITSM

## What This Is

A multi-tenant SaaS ITSM (IT Service Management) platform targeting Managed Service Providers (MSPs), enterprises, and B2C service providers. MeridianITSM provides ITIL-compliant incident/service request management, change management with CAB workflows, knowledge base, asset management, CMDB with agent-fed auto-discovery, application portfolio management, SLA monitoring, and subscription-based billing — delivered as a monorepo with separate web app, API server, mobile app (React Native/Expo), owner admin portal, and cross-platform .NET inventory agent.

## Core Value

An MSP can manage multiple customer organizations' IT service desks from a single platform with complete tenant isolation, paying via Stripe subscription, with the full ITSM lifecycle (ticket creation through resolution with SLA enforcement) working end-to-end.

## Requirements

### Validated

- [x] Owner admin portal (tenant management, billing, impersonation) — fully isolated *(Validated in Phase 02: billing-and-owner-admin)*
- [x] Stripe subscription billing with plan enforcement (planGate middleware) *(Validated in Phase 02: billing-and-owner-admin)*
- [x] Tenant provisioning automation (signup → provision → welcome email) *(Validated in Phase 02: billing-and-owner-admin)*
- [x] Trial flow with expiry, dunning emails, and paywall *(Validated in Phase 02: billing-and-owner-admin)*
- [x] Ticket lifecycle: create, assign, SLA tracking, resolve, close *(Validated in Phase 03: core-itsm)*
- [x] Knowledge base with rich text, search, voting, ticket linking *(Validated in Phase 03: core-itsm)*
- [x] SLA management with automated monitoring and breach alerts *(Validated in Phase 03: core-itsm)*
- [x] Email-to-ticket via IMAP/POP3 polling *(Validated in Phase 03: core-itsm)*
- [x] Background workers (SLA monitoring, email notifications, email polling) *(Validated in Phase 03: core-itsm)*
- [x] End-user self-service portal (simplified UI) *(Validated in Phase 03: core-itsm)*
- [x] Scheduled reports (CSV/JSON) *(Validated in Phase 03: core-itsm)*
- [x] Change management with approval workflows and CAB meetings *(Validated in Phase 04: cmdb-change-management-and-asset-portfolio)*
- [x] Asset management with manual entry and agent-collected inventory *(Validated in Phase 04: cmdb-change-management-and-asset-portfolio)*
- [x] CMDB with CI relationships, impact analysis, agent auto-discovery *(Validated in Phase 04: cmdb-change-management-and-asset-portfolio)*
- [x] Application portfolio management with dependency mapping *(Validated in Phase 04: cmdb-change-management-and-asset-portfolio)*

### Active

- [ ] Multi-tenant architecture with tenantId scoping on every query
- [ ] Separate API server (Hono/Fastify) + Next.js frontend (architectural split)
- [x] Push notifications (FCM for Android, APNs for iOS) *(Validated in Phase 05: agent-mobile-and-integrations)*
- [ ] RBAC with system roles (admin, msp_admin, agent, end_user) and custom roles
- [x] React Native/Expo mobile app (iOS + Android) *(Validated in Phase 05: agent-mobile-and-integrations)*
- [x] .NET cross-platform inventory agent (Windows, Linux, macOS) *(Validated in Phase 05: agent-mobile-and-integrations)*
- [x] API key management for external integrations *(Validated in Phase 05: agent-mobile-and-integrations)*
- [x] Webhook system with delivery tracking *(Validated in Phase 05: agent-mobile-and-integrations)*
- [ ] MSP model: managing multiple CustomerOrganizations per tenant

### Out of Scope

- OAuth2/SSO providers (Azure AD, Okta, Google) — defer to Enterprise tier, post-launch
- Real-time chat — not core to ITSM value
- CI/CD pipeline configuration — handle separately from app code
- Graph database for CMDB — PostgreSQL recursive CTEs sufficient for v1

## Context

This is a **clean rewrite** of an existing application that reached ~62% completion (235/380 tasks). The original codebase's architecture couldn't support the evolved scope — particularly the owner admin portal, CMDB, subscription billing layer, and mobile app migration from Capacitor to React Native.

The full specification is captured in `DOCUMENTATION .md` (1900 lines) covering all data models (50+ Prisma models), ~115 API endpoints, 55 dashboard pages, mobile app architecture, .NET agent architecture, owner admin portal, and SaaS billing model.

**Key architectural change from original:** The rewrite separates the API into a standalone server (Hono or Fastify) from the Next.js frontend, enabling independent scaling and cleaner boundaries for the mobile app and .NET agent.

**Dev server:** Debian at 10.1.200.153 (SSH as root), Docker Compose for backing services (PostgreSQL, Redis, MinIO, MailHog). Will migrate to production infrastructure later.

**Existing production reference:** Previous deployment at https://servicedeskbeta.msaas.online/ on 10.3.200.104.

## Constraints

- **Stack**: Open to best current options — the doc's stack (Next.js 16, Prisma 6, React 19, etc.) is a guide, not a mandate. Research should inform final choices.
- **Architecture**: Separate API server + Next.js frontend (decided). Monorepo with pnpm + Turborepo.
- **Multi-tenancy**: Every table has tenantId. Every query scoped. Non-negotiable security boundary.
- **Owner admin isolation**: Separate app, separate auth, separate JWT secret, never exposed publicly.
- **Icons**: Material Design Icons (Pictogrammers) via @mdi/react + @mdi/js (web) and react-native-vector-icons (mobile). Tree-shakeable SVG only, no webfont.
- **Dev environment**: Debian server at 10.1.200.153, Docker Compose for services.
- **Success criteria**: First paying MSP customer using the platform.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Separate API from frontend | Independent scaling, cleaner boundaries for mobile/agent consumers, original doc recommended it | — Pending |
| Clean rewrite vs. continue | Scope evolved beyond what original architecture could support (owner admin, CMDB, billing, mobile migration) | — Pending |
| Docker Compose for dev services | Simple setup on Debian dev server, consistent environments | — Pending |
| Full spec as target | All 380 tasks including the 38% never built in the original | — Pending |
| Stack open to research | Let research identify best current options rather than locking to original choices | — Pending |
| AUTH_RATE_LIMIT shipped as max=50/15min (not spec'd max=5/15min) | 5/15min was too aggressive for dev/testing cycles (login + password-reset routinely burn >5 attempts during feature work); 50 is the pragmatic shipped value while still materially harder to brute-force than the global 100/min default | Applied in login.ts, signup.ts, form-login.ts, and both password-reset.ts POST handlers via `{ config: { rateLimit: AUTH_RATE_LIMIT } }`. Intentional deviation from the AUTH-08 spec. Revisit and tighten toward 5/15min if abuse is observed in production or if v2.0 threat-model review reprioritises brute-force resistance. Logged 2026-04-16 during v1.0 milestone paperwork cleanup (Phase 6). |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-23 — Phase 05 (agent-mobile-and-integrations) complete — all v1 phases done*
