# Assets, CMDB, and Applications — How They Fit Together

A plain-English guide to the three inventory-like features in MeridianITSM and why they all exist side-by-side instead of being one big list.

---

## The 30-second version

Think of it like owning a restaurant:

- **Assets** = the stuff you bought. *"I own a $12,000 pizza oven, serial #ABC, bought in 2024, warranty expires 2027."* This is the **accountant's view**.
- **CMDB (Configuration Items)** = the stuff you operate. *"The pizza oven is installed in the kitchen, plugged into circuit 4, runs at 500°F, maintained by Bob, and if it breaks the whole dinner service goes down."* This is the **operations view**.
- **Applications** = the services your customers actually care about. *"Dinner service" — which uses the pizza oven, the dishwasher, and the POS system.* This is the **business view**.

The same pizza oven shows up in all three, but each view asks different questions about it.

---

## 1. Assets — "What did we buy?"

**Mental model:** A spreadsheet your finance team would keep.

**What an Asset record holds:**
- Asset tag, serial number, manufacturer, model
- Purchase date, purchase cost, warranty expiry
- Who it's assigned to
- Status: `IN_STOCK`, `ASSIGNED`, `RETIRED`
- Hardware specs (CPU, RAM, disks) if it's a computer

**Typical questions Assets answer:**
- "What's still under warranty?"
- "How much did we spend on laptops last year?"
- "Which assets are assigned to the Marketing team?"
- "This laptop was stolen — what was its serial number?"

**Example:**
> Dell Latitude 5540, serial `DL5540-99821`, purchased 2025-03-10 for $1,420, warranty until 2028-03-10, currently assigned to Jane Smith.

Assets don't care whether the thing is turned on, what software is on it, or what it does. They just track that you own it.

---

## 2. CMDB — "What are we operating, and what depends on what?"

**CMDB** stands for **C**onfiguration **M**anagement **D**ata**b**ase. Each entry is called a **Configuration Item (CI)**.

**Mental model:** A living map of everything IT runs, with lines drawn between the things that depend on each other.

**What a CI record holds:**
- Hostname, FQDN, IP address
- **Class** (Server, Database, Network Device, Application Instance, etc.)
- **Lifecycle status** (Planned, In Stock, Deployed, Retired)
- **Operational status** (Running, Degraded, Down, Maintenance) — note: two separate statuses, because a server can be "Deployed" but "Down"
- **Environment** (Production, Staging, Dev)
- Business owner, technical owner, support group
- **Relationships** to other CIs (depends-on, runs-on, hosted-on, uses, etc.)

**Typical questions CMDB answers:**
- "If we reboot server `prod-db-01`, what breaks?"
- "Who do I call when the payroll database is slow?"
- "Which production servers are running an unsupported OS?"
- "Show me every CI that depends on this network switch."

**Example:**
> CI: `prod-db-01.acme.com`, Class = Database Server, Environment = Production, Operational Status = Running, Technical Owner = DBA Team.
> Relationships:
> - `runs-on` → CI `esxi-host-04` (a VMware hypervisor)
> - `depends-on` → CI `core-switch-02`
> - Is the `primary CI` for Application "Payroll System"

### The big difference from Assets

| | Asset | CI |
|---|---|---|
| **Purpose** | Track ownership and cost | Track operations and impact |
| **Lifecycle** | Purchased → Retired | Planned → Deployed → Retired |
| **Cares about** | Serial number, warranty | Hostname, dependencies, who owns support |
| **Updated by** | Procurement team | Auto-discovery agents + IT ops |

### How Assets and CIs connect

When you create an Asset that has a hostname (like a server or laptop), the system can automatically create a matching CI so the same physical thing is visible in both views. The Asset keeps the financial data, the CI keeps the operational data, and they're linked via `CmdbConfigurationItem.assetId`.

**Why not merge them?** Because:
- Not every Asset becomes a CI (e.g., a spare monitor in storage — tracked as an Asset but nothing to "operate")
- Not every CI is an Asset (e.g., a cloud-hosted database you rent from AWS — you operate it but don't own it)
- The audiences are different. Finance doesn't care about `depends-on` relationships. Ops doesn't care about depreciation schedules.

---

## 3. Applications — "What services do we deliver?"

**Mental model:** The list of things your users would name if you asked "what software do you use to do your job?"

**What an Application record holds:**
- Name, type (Web, Mobile, API, Service)
- Status (Active, Inactive, Decommissioned)
- **Criticality** (Low, Medium, High, Critical) — how bad is it if this goes down?
- Lifecycle stage (Planning, Development, Production, Sunset)
- Support notes, runbook info, vendor contact, OS requirements
- **Primary CI** — the CI that represents this app's main deployment
- **Dependencies** on other Applications

**Typical questions Applications answer:**
- "What business services do we run?"
- "Which apps are business-critical and need 24/7 support?"
- "If Active Directory goes down, what apps stop working?"
- "Who's the vendor contact for the Payroll app?"

**Example:**
> Application: "Payroll System", Type = Web, Criticality = Critical, Lifecycle = Production.
> Primary CI → `payroll-app-01` (which itself `runs-on` `prod-db-01`).
> Depends on Application "Active Directory" (for login).
> Vendor contact: ADP Support, 555-0100.

### How Applications connect to CMDB

When you create an Application, the system automatically creates a CI for it (class = `application_instance`) and links them via `Application.primaryCiId`. This is called the **APM ↔ CMDB bridge**.

**Why?** Because once the Application is a CI, it can participate in the CMDB relationship graph:

```
Application "Payroll System"
   └── primary CI: payroll-app-01  (class: application_instance)
          └── runs-on → server-db-01  (class: server)
                └── runs-on → esxi-host-04  (class: hypervisor)
                        └── depends-on → core-switch-02  (class: network)
```

Now if `core-switch-02` goes down, you can walk the graph upward and tell the business **"Payroll is down."** That's called **blast-radius analysis**, and it only works because all three layers (app, server, network) are CIs with relationships between them.

---

## Putting it all together — a scenario

**Monday 9am:** Finance buys a new server to run a new HR app.

1. **Procurement creates an Asset:**
   *Dell PowerEdge R750, serial `PE750-4421`, $8,200, warranty until 2029, received into inventory.*
   → Asset status: `IN_STOCK`.

2. **IT racks the server and the inventory agent discovers it:**
   The agent reports hostname `hr-app-01.acme.com`. The system auto-creates a **CI** linked to that Asset.
   → CI class: Server. Lifecycle: Deployed. Operational: Running. Technical owner: Server Team.

3. **IT installs the HR software and creates an Application:**
   *"HR Onboarding System"*, Criticality = High.
   → This auto-creates a second CI (class: application_instance) and sets it as the Application's `primaryCi`.
   → IT adds a `runs-on` relationship: HR-app-CI → hr-app-01 server CI.

4. **IT documents dependencies:**
   The HR app authenticates via Active Directory, so they add an ApplicationDependency: *HR Onboarding → Active Directory* (type: AUTHENTICATION). Behind the scenes this also becomes a CMDB `uses` relationship between the two app-instance CIs.

**Tuesday 2am:** `core-switch-02` fails.

- The on-call engineer opens the CMDB and sees `core-switch-02` is down.
- They click "Impact" — the graph walks upward: switch → ESXi host → `hr-app-01` → HR Onboarding Application.
- The system flags: **"1 Critical + 2 High-criticality applications affected."**
- They know who to call because the HR Onboarding Application record has the vendor contact, and the CI record has the technical owner.

**Friday:** Finance asks "how much did we spend on HR infrastructure?"

- They query **Assets** filtered by the HR department → see the $8,200 server purchase, warranty info, depreciation. They don't need the CMDB for this.

Three views, one reality, each answering the questions its audience actually asks.

---

## Quick reference — which feature do I use?

| I want to… | Use |
|---|---|
| Track warranty expiry | **Assets** |
| Know who to call when something breaks | **CMDB** (technical owner on the CI) |
| See what business services are at risk during an outage | **Applications** (+ CMDB relationships) |
| Audit depreciation or procurement spend | **Assets** |
| Plan a change and see what it affects | **CMDB** (relationship graph) |
| Document vendor support contact for a system | **Applications** |
| Assign a laptop to a new hire | **Assets** |
| Record that "App A talks to App B" | **Applications** (ApplicationDependency) |
| Record that "Server X is plugged into Switch Y" | **CMDB** (CmdbRelationship) |

---

## Glossary

- **CI (Configuration Item):** A single entry in the CMDB. Anything IT manages — a server, a database, an app deployment, a network switch.
- **CI Class:** The category of CI (Server, Database, Application Instance, Network Device, etc.). Determines which extra fields show up on the form.
- **Lifecycle status** vs **Operational status:** Lifecycle = where it is in its overall life (Planned → Deployed → Retired). Operational = what it's doing right now (Running, Down, Degraded). A CI can be "Deployed" + "Down" at the same time.
- **Primary CI:** The specific CI that "represents" an Application in the CMDB graph. One Application, one primary CI.
- **Blast radius / Impact analysis:** Walking the CMDB relationship graph to figure out what else breaks when one thing breaks.
- **APM ↔ CMDB bridge:** The automatic sync that turns every Application into a CI so it can participate in the dependency graph.
