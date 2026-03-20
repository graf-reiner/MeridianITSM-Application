# Feature Research

**Domain:** Multi-tenant SaaS ITSM platform targeting MSPs
**Researched:** 2026-03-19
**Confidence:** HIGH (competitor analysis confirmed across multiple sources; ITIL standards well-established)

## Feature Landscape

### Table Stakes (Users Expect These)

Features MSP customers assume exist. Missing any of these means the product feels broken or incomplete — customers leave, not complain.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Incident management (ticket lifecycle) | Core ITSM function; every competing product has it | MEDIUM | Create, assign, prioritize, resolve, close. Requires status machine + audit trail. |
| Multi-tenant isolation | MSPs manage multiple client orgs; data leakage is existential | HIGH | tenantId on every table, every query. Non-negotiable security boundary. |
| SLA management with breach alerting | MSPs sell against SLAs; breach tracking is contractual proof | MEDIUM | Response + resolution timers, proactive alerts at 75%/90%, escalation chains. |
| Email-to-ticket (inbound) | Clients submit via email; portal is secondary channel | MEDIUM | IMAP/POP3 polling, parse → create ticket, reply threading, bounce handling. |
| Self-service portal (end-user) | 90% of users expect online self-service; reduces agent load | MEDIUM | Simplified UI — submit request, track status, browse KB. Separate from agent UI. |
| Knowledge base | Agents need resolution docs; end users want self-help | MEDIUM | Rich text, search, article voting, linking to tickets. |
| Asset management | MSPs track client hardware/software as core service | HIGH | Manual entry + agent-fed discovery, lifecycle status, assignment to CI/users. |
| CMDB with relationship mapping | Change impact analysis requires knowing what depends on what | HIGH | CI types, dependency relationships, impact visualization. Feeds change management. |
| Change management with approval workflows | ITIL compliance; regulated clients require CAB process | HIGH | Change types (standard/normal/emergency), CAB meetings, approval chains, scheduling. |
| RBAC with role hierarchy | Different access levels for MSP staff, client admins, end users | MEDIUM | System roles + custom roles. Scope to tenant + customer organization. |
| Email notifications (outbound) | Agents and users expect status updates via email | LOW | Templated emails on ticket events: created, assigned, updated, resolved, SLA breach. |
| Ticket assignment and routing | Manual and automatic assignment to agents/teams | MEDIUM | Round-robin, load-based, or skill-based assignment. Group/queue support. |
| Ticket priorities and categorization | Triage requires structure; reporting requires categories | LOW | Priority levels (P1–P4), category/subcategory taxonomy, type (incident/request/problem). |
| Problem management | Root cause tracking distinct from incident handling | MEDIUM | Link incidents to problems, root cause analysis, known errors, workarounds. |
| Reporting and dashboards | MSPs need performance data to show value to clients | MEDIUM | Ticket volume, SLA performance, resolution time, agent workload. Per-tenant. |
| Audit logs | Compliance and accountability require immutable change history | MEDIUM | Who changed what, when. Immutable append-only. Per-tenant scoped. |
| Mobile app (iOS + Android) | Technicians are on the move; mobile is table stakes for agents | HIGH | React Native. Ticket management, push notifications, status updates on the go. |
| Push notifications | Time-sensitive SLA alerts require push, not just email | MEDIUM | FCM (Android) + APNs (iOS). SLA breach, ticket assignment, escalation events. |
| Service catalog / request forms | End users submit structured requests; reduces back-and-forth | MEDIUM | Catalog items with custom fields, approval steps, fulfillment workflows. |
| Tenant provisioning and onboarding | MSP SaaS must automate signup → ready to use | HIGH | Stripe checkout → provision DB schema → welcome email → first login. |
| Stripe billing and plan enforcement | SaaS revenue collection is non-negotiable | HIGH | Subscription plans, trial flow, dunning, paywall (planGate), upgrade/downgrade. |
| API access (REST) | Integration with client systems, RMM, PSA tools is expected | MEDIUM | Authenticated API with API key management. Document endpoints. |

### Differentiators (Competitive Advantage)

Features that set MeridianITSM apart. MSPs will pay more or choose Meridian over Freshservice/ManageEngine specifically because of these.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| .NET cross-platform inventory agent | Auto-discovery of Windows/Linux/macOS assets feeds CMDB without manual entry — competitors charge extra or require separate tools | HIGH | Agent installs on client machines, phones home to API. Signed binaries, secure channel. |
| MSP-native multi-org management | Single pane of glass for all customer organizations — not bolted-on multi-tenancy but designed-in from day one | HIGH | CustomerOrganization model with per-org SLAs, assets, KB, contacts. ManageEngine has this; Freshservice's MSP mode is weaker. |
| Owner admin portal with impersonation | Platform operator can see and act inside any tenant without separate credentials — critical for support | HIGH | Fully isolated app, separate auth, separate JWT secret. Never exposed in main UI. |
| Application portfolio management | Track business applications and their CI dependencies — goes beyond asset tracking | HIGH | App dependency mapping, owner assignment, risk scoring. Few MSP ITSM tools have this. |
| CMDB agent auto-discovery reconciliation | Agent continuously reconciles CMDB — stale CI data is a real pain point in competing products | HIGH | Background worker diffs agent reports vs CMDB state, creates reconciliation records. |
| Webhook system with delivery tracking | MSPs integrate with client monitoring tools, PSA, billing — reliable webhooks are a developer differentiator | MEDIUM | Signed payloads, retry with backoff, delivery log. Competitors often have basic webhooks without retry visibility. |
| Per-tenant trial flow with dunning | Self-serve trial → paid conversion without sales intervention — allows MSP platform to scale acquisition | HIGH | Trial expiry gates, dunning email sequence, paywall enforcement, reactivation. |
| Scheduled exports (CSV/JSON) | MSPs must produce reports for clients in their preferred format — built-in scheduled delivery reduces custom work | MEDIUM | Configurable report schedules, email delivery, format options. Reduces need for manual exports. |
| White-label / per-tenant branding | MSPs want to present their own brand to clients, not the tool vendor's | MEDIUM | Per-tenant logo, color scheme, portal domain (future). HaloITSM does this; Freshservice MSP mode does it only on higher tiers. |
| CAB workbench with meeting scheduling | Structured CAB meeting management (agenda, attendees, decisions) inside the tool — many platforms just have approval flows | HIGH | CAB meeting object, attendee list, linked changes for review, decision recording. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem reasonable to request but create disproportionate complexity, ongoing maintenance burden, or pull the product away from its core value.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time chat / live chat | Clients want instant support; feels modern | Requires WebSocket infrastructure, presence tracking, chat history, and turns the product into a chat platform. Core ITSM value is structured ticketing, not chat. Also noted explicitly as out of scope in PROJECT.md. | Email-to-ticket provides async communication. Push notifications provide fast response signals. |
| AI ticket classification and auto-resolution | Reduces agent workload; competitors market heavily | AI hallucinations in ITSM context cause real damage (deleting configs, wrong escalations). Premature AI without high-quality training data creates trust problems worse than no AI. | Rule-based auto-assignment using category/priority/keywords is reliable and explainable. Add AI after data corpus exists. |
| SSO / OAuth2 (Azure AD, Okta, Google) | Enterprise clients require SSO | Correct behavior but high implementation complexity. Each IdP has edge cases; token refresh, group sync, and SCIM provisioning are ongoing maintenance. PROJECT.md correctly defers this. | Strong API key + JWT auth for v1. SSO as Enterprise tier add-on post-launch with dedicated milestone. |
| Graph database for CMDB | CMDB has complex relationships; graph feels natural | PostgreSQL recursive CTEs handle the actual query patterns at MSP scale. Graph DB adds operational complexity (new service to operate, different query language, different backup strategy) without proportional benefit until 1M+ CIs. | PostgreSQL with recursive CTEs and a relationship join table. Proven at scale. PROJECT.md explicitly calls this out. |
| Native RMM integration | MSPs use RMM tools (NinjaOne, ConnectWise Automate); unified view is appealing | RMM integration requires per-vendor API work, ongoing maintenance as RMM APIs change, and scope-creeps toward building an RMM. Webhooks + REST API let RMM tools push to Meridian without native integration burden. | Expose webhook ingest endpoint for alert-to-ticket creation. Document the API. Let RMM vendors or MSPs build the connector. |
| Built-in telephony / CTI | Some MSPs run phone support | Telephony integration (Twilio, Vonage) introduces call recording compliance, call routing complexity, and voicemail-to-ticket parsing. Marginal MSP use case vs. development cost. | Integration-ready via webhooks. Third-party CTI adapters can post to the ticket API. |
| Multi-currency billing | MSPs in different countries bill clients in local currency | Stripe handles currency natively but multi-currency plan enforcement creates pricing matrix complexity that grows exponentially with plan count. | Launch USD only. Add currency per Stripe's built-in support when a specific market demands it. |
| Built-in project management | IT projects relate to service delivery | Full project management (Gantt, resource leveling, budgeting) is a separate product category. Half-baked project features create user confusion vs. dedicated tools. | Task management within change requests is sufficient. Link to external PM tools via webhook. |

## Feature Dependencies

```
[Multi-tenant isolation]
    └──required by──> ALL features (tenantId scoping is the foundation)

[Stripe billing + plan enforcement]
    └──required by──> [Tenant provisioning]
                          └──required by──> [Trial flow with dunning]

[Asset management]
    └──required by──> [CMDB with relationships]
                          └──required by──> [Change management impact analysis]
                          └──required by──> [Application portfolio management]

[.NET inventory agent]
    └──enhances──> [Asset management] (populates automatically)
    └──enhances──> [CMDB] (auto-discovery feeds CI database)

[Knowledge base]
    └──enhances──> [Self-service portal] (KB articles surfaced in portal)
    └──enhances──> [Incident management] (suggested articles during ticket creation)

[Incident management]
    └──required by──> [Problem management] (link incidents to problems)
    └──required by──> [SLA management] (SLA timers attach to tickets)
    └──required by──> [Email-to-ticket] (creates incidents from inbound email)

[SLA management]
    └──required by──> [Push notifications] (breach events trigger push)
    └──required by──> [Email notifications] (breach events trigger emails)

[RBAC with role hierarchy]
    └──required by──> [Owner admin portal] (impersonation requires role model)
    └──required by──> [Change management] (CAB approval requires role-gated actions)

[CAB workbench]
    └──required by──> [Change management with approval workflows]

[Webhook system]
    └──enhances──> [External integrations / RMM alert-to-ticket]

[Mobile app]
    └──requires──> [Push notifications] (core mobile value is real-time alerts)
    └──requires──> [REST API] (mobile consumes same API as web)
```

### Dependency Notes

- **Multi-tenant isolation requires everything:** Every data model, every API handler, every background worker must be tenantId-scoped. This is the first thing built, not a retrofit.
- **CMDB requires Asset management:** CIs are a superset of assets with relationship metadata. Asset data must exist before CMDB relationship mapping makes sense.
- **Change management impact analysis requires CMDB:** Impact analysis ("what breaks if I change this CI?") requires relationship data in the CMDB. Change management without CMDB is just approval workflows, not ITIL-compliant change management.
- **Agent auto-discovery requires Asset management and CMDB to both exist:** The agent feeds both. Building the agent before either module exists means there's nowhere to put the data.
- **Trial flow requires Stripe to be working end-to-end:** Trial expiry → paywall → conversion requires webhook handling, plan enforcement middleware, and Stripe subscription state to be reliable before trial flow is safe to enable.
- **Mobile app requires stable API contract:** The React Native app consumes the same API as the web frontend. A moving API contract during mobile development creates rework. API should stabilize before deep mobile investment.

## MVP Definition

### Launch With (v1)

Minimum required to acquire and retain the first paying MSP customer.

- [ ] Multi-tenant isolation with tenantId scoping — the security foundation everything else requires
- [ ] Tenant provisioning (signup → provision → welcome email) — without this, no one can get in
- [ ] Stripe billing with trial flow and plan enforcement — without this, no revenue
- [ ] Incident management (full ticket lifecycle) — the core ITSM deliverable
- [ ] SLA management with breach alerting — MSPs sell SLAs; this is contractual
- [ ] Email-to-ticket (inbound) — primary ticket creation channel for clients
- [ ] Email notifications (outbound) — baseline communication expectation
- [ ] Self-service portal — end users need a way in beyond email
- [ ] RBAC with system roles — multi-tenant needs role separation from day one
- [ ] Knowledge base — supports self-service and agent efficiency
- [ ] Asset management (manual entry) — table stakes for MSP service delivery
- [ ] Owner admin portal with tenant management — required to operate the SaaS
- [ ] Basic reporting / dashboard — MSPs need to demonstrate value

### Add After Validation (v1.x)

Add once core is working and first customers are retained.

- [ ] CMDB with relationship mapping — enhances asset management; needed for change impact analysis; requires asset data to exist first
- [ ] Change management with CAB workflows — ITIL compliance add; complex to build correctly; validate incident management first
- [ ] .NET inventory agent — strong differentiator; requires asset management and CMDB to land the data somewhere useful
- [ ] Problem management — links to incidents; adds ITIL completeness; lower immediate MSP urgency than incidents
- [ ] Mobile app (iOS + Android) — differentiator for field technicians; requires API stability first
- [ ] Push notifications — tied to mobile; add when mobile ships
- [ ] Webhook system — integration enabler; adds value after core is stable
- [ ] Scheduled exports — reporting enhancement; add when dashboards are validated

### Future Consideration (v2+)

Defer until product-market fit is established and specific customer demand justifies the investment.

- [ ] Application portfolio management — sophisticated feature; defer until CMDB is mature and MSP customers request it
- [ ] CAB workbench with meeting scheduling — full CAB meeting management; approval chains suffice for v1 change management
- [ ] White-label / per-tenant branding — desirable but not a blocker to first paying customer
- [ ] SSO / OAuth2 (Azure AD, Okta, Google) — Enterprise tier; per PROJECT.md explicitly deferred post-launch
- [ ] Per-tenant trial customization — advanced billing; standard trial flow sufficient initially
- [ ] API rate limiting and developer portal — needed at scale; overkill for first customers

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Multi-tenant isolation | HIGH | HIGH | P1 |
| Tenant provisioning | HIGH | MEDIUM | P1 |
| Stripe billing + trial flow | HIGH | HIGH | P1 |
| Incident management | HIGH | MEDIUM | P1 |
| SLA management | HIGH | MEDIUM | P1 |
| Email-to-ticket | HIGH | MEDIUM | P1 |
| RBAC | HIGH | MEDIUM | P1 |
| Self-service portal | HIGH | MEDIUM | P1 |
| Knowledge base | HIGH | MEDIUM | P1 |
| Asset management (manual) | HIGH | MEDIUM | P1 |
| Owner admin portal | HIGH | HIGH | P1 |
| Email notifications | HIGH | LOW | P1 |
| CMDB with relationships | HIGH | HIGH | P2 |
| Change management + CAB | HIGH | HIGH | P2 |
| .NET inventory agent | HIGH | HIGH | P2 |
| Problem management | MEDIUM | MEDIUM | P2 |
| Mobile app | HIGH | HIGH | P2 |
| Push notifications | MEDIUM | MEDIUM | P2 |
| Webhook system | MEDIUM | MEDIUM | P2 |
| Reporting / dashboards | HIGH | MEDIUM | P2 |
| Scheduled exports | MEDIUM | LOW | P2 |
| Application portfolio mgmt | MEDIUM | HIGH | P3 |
| CAB workbench (full) | MEDIUM | HIGH | P3 |
| White-label branding | MEDIUM | MEDIUM | P3 |
| SSO / OAuth2 | HIGH | HIGH | P3 |

**Priority key:**
- P1: Must have for launch — first paying customer cannot exist without it
- P2: Should have — competitive and adds clear retention value; add in first major release
- P3: Nice to have — future consideration, defer until specific demand

## Competitor Feature Analysis

| Feature | Freshservice | ManageEngine SDP MSP | HaloITSM | MeridianITSM Approach |
|---------|--------------|---------------------|----------|----------------------|
| Multi-tenant MSP mode | Yes (dedicated MSP mode) | Yes (built for MSPs) | Partial (HaloPSA handles MSP billing) | Built-in from scratch — CustomerOrganization model per tenant |
| CMDB | Yes | Yes, with relationship maps | Yes, with auto-discovery | PostgreSQL CTEs + agent auto-discovery |
| Change management + CAB | Yes, ITIL-aligned | Yes | Yes, highly configurable | CAB workbench with meeting scheduling (differentiator) |
| Inventory agent | No native agent (integrations) | Yes (Endpoint Central MSP add-on, extra cost) | Yes (built-in, included) | .NET cross-platform agent (Windows/Linux/macOS) — included |
| Self-service portal | Yes | Yes | Yes, white-label | Yes, separate simplified UI |
| Mobile app | Yes (iOS + Android) | iOS only (per research) | Yes | React Native iOS + Android |
| Knowledge base | Yes, with AI suggestions | Yes | Yes | Yes, with rich text + ticket linking |
| Stripe SaaS billing | N/A (Freshservice is the SaaS vendor) | N/A | N/A | Yes — Meridian is the SaaS vendor; this is what makes it a product |
| Owner admin portal | N/A | N/A | N/A | Yes — platform-level tenant management with impersonation |
| Application portfolio mgmt | No | No | No | Yes (differentiator, v2) |
| Webhook system | Yes | Yes | Yes | Yes, with delivery tracking (differentiator) |
| White-label portal | Higher tiers | No | Yes | v2 roadmap |
| All modules included | Per-tier pricing | Per-tier pricing | All-inclusive licensing | All-inclusive per plan — simplifies MSP selling |

**Confidence on competitor analysis:** MEDIUM — based on public marketing pages and third-party reviews as of 2026-03. Specific tier restrictions may differ. Verify before using in sales material.

## Sources

- [17 Best ITSM Tools & Platforms to Consider in 2026 — DeskDay](https://deskday.com/best-itsm-tools/)
- [ManageEngine ServiceDesk Plus MSP Features](https://www.manageengine.com/products/service-desk-msp/msp-software-features.html)
- [HaloITSM Features](https://usehalo.com/haloitsm/features/)
- [Freshservice vs ServiceNow 2026 — Capterra](https://www.capterra.com/compare/132997-254088/Freshservice-vs-ServiceNow)
- [23 Best ServiceNow Alternatives Reviewed In 2026 — CX Lead](https://thecxlead.com/tools/best-servicenow-alternatives/)
- [5 Must-Have ITSM Features for MSP Software — Sunrise Software](https://www.sunrisesoftware.com/blog/5-must-have-itsm-features-for-msp-software)
- [ITIL 4 Change Management Process Guide — PDCA Consulting](https://pdcaconsulting.com/comprehensive-guide-to-itil-change-management/)
- [IT Self-Service Portal Best Practices for 2026 — Monday.com](https://monday.com/blog/service/it-self-service-portal/)
- [Top MSP Challenges and Solutions for 2025 — Syncro](https://syncromsp.com/blog/top-msp-challenges-solutions-2025/)
- [ITSM Integration Guide 2026 — Exalate](https://exalate.com/blog/itsm-integration/)
- [HaloITSM in 2025: AI-Driven ITSM — Cubet Tech](https://cubettech.com/resources/blog/halo-itsm-2025-the-best-it-service-management-software-for-ai-driven-efficiency-cubet-s-global-integration-services/)
- [MSP Freshservice Overview — Datalunix](https://www.datalunix.com/post/msp-freshservice)
- [Halo ITSM Pricing — Xurrent Blog](https://www.xurrent.com/blog/halo-itsm-pricing)
- [SLA Breach Prevention Guide — ManageEngine](https://www.manageengine.com/products/service-desk/itsm/sla-breach.html)

---
*Feature research for: MeridianITSM — multi-tenant SaaS ITSM platform for MSPs*
*Researched: 2026-03-19*
