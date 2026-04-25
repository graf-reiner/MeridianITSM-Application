# Claude Implementation Spec: Custom Forms Module for ServiceDesk

## 1. Purpose

Build a **Custom Forms** module inside the existing ServiceDesk application. Administrators must be able to create reusable fields, assemble them into highly configurable forms using a visual layout builder, apply conditional logic and rules, and submit those forms to generate **new helpdesk tickets**.

This module is not a one-off intake page. It is a reusable platform capability.

---

## 2. What Claude Should Build

Claude should implement a production-ready module with these pillars:

1. **Reusable Field Library**
   - Global field definitions reusable across forms
   - Form-level overrides without breaking canonical field identity
   - Field versioning and deprecation status

2. **Form Builder**
   - Visual layout system using responsive rows/columns/sections
   - WYSIWYG-style editing based on a 12-column grid
   - Reorder, duplicate, resize, preview

3. **Conditional / Dependent Fields**
   - Parent field values control child visibility, options, required state, validation, text, and branching
   - Dependency logic must be enforced in both UI and backend validation

4. **Rules Engine Integration**
   - Forms emit structured events to the existing rules engine
   - Rules may run on load, field change, submit validation, and post-submit

5. **Submission → Ticket Creation**
   - Every successful form submission creates a new helpdesk ticket
   - Form answers can map to ticket fields using direct, computed, and conditional mapping

6. **Versioning / Governance**
   - Draft / publish / archive lifecycle
   - Immutable submission snapshot per published version
   - Auditability and rollback-safe edits

---

## 3. Product Goals

### Primary goals
- Let admins design sophisticated intake workflows without code
- Reuse fields and field groups across many forms
- Support serious conditional logic, not just simple show/hide
- Convert submissions into helpdesk tickets reliably
- Keep historical submissions valid even after forms evolve

### Secondary goals
- Allow strong integration with existing ticket, workflow, and rules systems
- Make layout flexible while preserving responsiveness and accessibility
- Keep the design multi-tenant safe and governance-friendly

### Non-goals for MVP
- Absolute-position page designer
- Public anonymous forms with no auth/rate limiting
- Advanced BPM engine replacement
- Full PDF document composition engine
- Full low-code app builder

---

## 4. Key Design Principles

1. **Separate schema from layout from behavior**
   - Schema = field definitions and types
   - Layout = visual placement of components
   - Behavior = conditional logic, validation, mappings, rules

2. **Conditional logic is first-class**
   - Not a UI-only trick
   - Must be validated server-side
   - Must be traceable for debugging and audits

3. **Published versions are immutable**
   - Editing a live form creates a new draft/version
   - Historical submissions continue to resolve against the exact version used

4. **Fields are reusable but overridable**
   - Preserve canonical field identity for governance and reporting
   - Allow per-form label/help/default/required overrides

5. **Ticket creation is explicit**
   - Use a dedicated mapping layer
   - Do not hard-wire the UI submission payload directly to ticket schema

---

## 5. Functional Requirements

## 5.1 Field Library

Implement a global field library with:
- CRUD for reusable fields
- field states: `draft`, `active`, `deprecated`, `archived`
- version history
- usage tracking (which forms use the field)
- field-level permissions if your app supports granular admin roles

### Required field types
- text
- textarea
- static rich text / content block
- number
- decimal
- currency
- percent
- checkbox / toggle
- select
- multiselect
- radio
- date
- time
- datetime
- email
- phone
- url
- file upload
- user picker
- team/group picker
- asset / CI picker
- internal lookup
- external API lookup
- address block
- hidden/system field

### Field definition attributes
Each field definition should support at least:
- `key`
- `label`
- `description/help_text`
- `placeholder`
- `field_type`
- `default_value`
- `is_required`
- `is_read_only`
- `is_hidden`
- `validation_config`
- `option_source_type`
- `option_source_config`
- `dependency_config`
- `tenant_id`
- `status`
- `version`
- `created_by`
- `updated_by`
- timestamps

### Form-level overrides
A field placed onto a form may override:
- label
- help text
- placeholder
- required flag
- read-only flag
- default value
- visibility default
- width/layout metadata

Do **not** allow overrides to change the canonical meaning of the field key.

---

## 5.2 Reusable Field Groups

Implement reusable field groups that bundle related fields.

Examples:
- Employee Identity
- Device Request Details
- Shipping Information
- Approval Block

Each field group should support:
- ordered field members
- optional layout hints
- group-level rules
- versioning
- usage tracking

---

## 5.3 Form Builder

Build an admin-facing form builder.

### Layout primitives
- page
- section
- row
- column
- field instance
- static text block
- divider
- notice/alert block
- spacer

### Phase 2 primitives
- tabs
- stepper / wizard
- conditional sections

### Builder capabilities
- drag-and-drop field placement
- reorder fields/rows/sections
- 12-column responsive widths
- duplicate row/section
- preview desktop/tablet/mobile
- show technical metadata in admin mode
- undo/redo if feasible
- validation preview
- publish diff view if feasible

### Constraint
Use a **responsive grid**, not arbitrary absolute positioning.

---

## 5.4 Conditional / Dependent Field Logic

This is a core requirement.

### Supported dependency modes
1. **Show / hide** child fields or sections
2. **Filter child options** based on parent values
3. **Mutate child field state**
   - required/optional
   - enabled/disabled
   - read-only/editable
   - label/help text changes
   - validation changes
4. **Branch navigation**
   - different section/step/path based on answer
5. **Reset stale data**
   - clear child values when parent changes invalidate prior selections

### Example behaviors
- If `request_type = Hardware`, show `asset_type`, `device_model`, and shipping section
- If `request_type = Access`, hide hardware section and show approval path
- If `employment_type = Contractor`, require `contract_end_date`
- If `device_family = Laptop`, filter device model list to laptop models only

### Required backend guarantees
- Reject invalid submissions that contain child values no longer allowed by dependency conditions
- Recompute rule/dependency graph on submit
- Enforce allowed options server-side
- Enforce required-state server-side
- Clear or reject stale dependent data according to configured reset policy

### Dependency validation safeguards
- detect circular dependencies
- block invalid rule graphs at publish time
- support dependency graph visualization if feasible
- preserve deterministic evaluation order

### Dependency config model
Recommended structure:
- `parent_field_keys`
- `operator`
- `comparison_value`
- `action_type`
- `action_payload`
- `fallback_behavior`
- `reset_policy`
- `priority`

---

## 5.5 Rules Engine Integration

Use the existing rules engine rather than hard-coding advanced runtime logic into the form renderer.

### Emit these events
- `form.eligibility.check`
- `form.load`
- `form.field.change`
- `form.validate.before_submit`
- `form.submission.persisted`
- `form.ticket.before_create`
- `form.ticket.created`
- `form.after_submit`

### Rule scopes
- global
- tenant/workspace
- form
- field group
- field instance
- submission

### Supported rule actions
- show/hide field
- enable/disable field
- require/make optional
- set/clear value
- filter options
- change label/help text
- change validation constraints
- navigate to section/step
- display message
- block submit
- compute derived value
- map ticket field
- set queue/assignment/priority/category
- set tags
- invoke approval
- create child tasks
- trigger webhook/automation flow

### Rule execution principle
- Declarative admin rules first
- Sandboxed scripting optional for advanced cases only
- Every rule execution should be auditable/debuggable

### Minimum observability
Log for each evaluation:
- form id
- form version
- submission id (if present)
- tenant id
- event name
- triggered rules
- final action set
- execution duration
- errors/warnings

---

## 5.6 Ticket Mapping

Every successful form submission must create a helpdesk ticket.

### Ticket mapping modes
- static literal
- direct field mapping
- template/concatenation
- conditional mapping
- rule-computed mapping
- lookup-derived mapping

### Typical target fields
- subject
- description
- category
- subcategory
- type
- source
- priority
- impact
- urgency
- requester
- requested_for
- assignment_group
- assignee
- sla_policy
- tags
- related_asset
- department
- company
- location

### Required persistence
Store both:
1. normalized ticket data
2. immutable raw submission snapshot

This must survive future edits to the form, field library, option lists, and mapping definitions.

---

## 5.7 Versioning / Lifecycle

Implement lifecycle states for forms:
- draft
- published
- archived

### Publishing rules
- a published form is immutable
- editing published form creates a new draft or version
- published version references exact layout + field overrides + rules + mapping config
- submissions always reference exact form version used

### Also version
- field definitions
- field groups
- option lists
- mapping definitions
- dependency/rule bindings

---

## 5.8 Permissions / Governance

Support these admin permissions if the platform has RBAC:
- manage field library
- manage field groups
- manage forms
- manage layout builder
- manage rules on forms
- publish forms
- archive forms
- view submission history
- view audit logs

Recommended governance features:
- clone form
- compare versions
- impact analysis before field changes
- draft validation before publish
- soft delete / archive only

---

## 6. Technical Architecture

## 6.1 Recommended Modules

1. `custom-forms-domain`
   - entities, validators, versioning logic

2. `custom-forms-builder`
   - admin APIs and UI state for builder

3. `custom-forms-runtime`
   - render form, evaluate dependencies, validate submission

4. `custom-forms-rules-adapter`
   - bridge into existing rules engine

5. `custom-forms-ticket-mapper`
   - convert submission payload to ticket creation input

6. `custom-forms-audit`
   - history, diffing, trace logs

---

## 6.2 Recommended Data Model

This is conceptual. Claude should adapt naming to existing project conventions.

### `form_definitions`
- id
- tenant_id
- key
- name
- description
- status
- current_draft_version_id
- current_published_version_id
- created_by
- updated_by
- created_at
- updated_at

### `form_versions`
- id
- form_definition_id
- version_number
- status
- layout_schema_json
- behavior_schema_json
- mapping_schema_json
- publish_notes
- published_at
- published_by
- checksum
- created_at

### `field_definitions`
- id
- tenant_id
- key
- field_type
- canonical_schema_json
- status
- current_version
- created_by
- updated_by
- created_at
- updated_at

### `field_definition_versions`
- id
- field_definition_id
- version_number
- schema_json
- created_at
- created_by

### `field_groups`
- id
- tenant_id
- key
- name
- description
- status
- created_at
- updated_at

### `field_group_versions`
- id
- field_group_id
- version_number
- schema_json
- created_at
- created_by

### `form_field_instances`
- id
- form_version_id
- field_definition_id
- field_definition_version_id
- instance_key
- override_schema_json
- layout_metadata_json
- sort_order

### `form_rules`
- id
- form_version_id
- scope_type
- scope_ref
- event_name
- priority
- condition_json
- action_json
- created_at

### `form_submissions`
- id
- tenant_id
- form_definition_id
- form_version_id
- requester_id
- status
- rendered_snapshot_json
- submission_payload_json
- normalized_payload_json
- validation_trace_json
- created_ticket_id
- submitted_at

### `form_submission_events`
- id
- submission_id
- event_name
- result_json
- created_at

### `form_option_sources`
- id
- tenant_id
- key
- source_type
- config_json
- cache_policy_json
- created_at
- updated_at

### `form_audit_log`
- id
- tenant_id
- actor_id
- object_type
- object_id
- action
- before_json
- after_json
- created_at

---

## 6.3 Suggested JSON Schema Shapes

### Layout schema (example)
```json
{
  "pages": [
    {
      "id": "page_main",
      "sections": [
        {
          "id": "section_request",
          "title": "Request Details",
          "rows": [
            {
              "id": "row_1",
              "columns": [
                { "span": 6, "component": { "type": "field", "instanceKey": "request_type" } },
                { "span": 6, "component": { "type": "field", "instanceKey": "requested_for" } }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Behavior schema (example)
```json
{
  "dependencies": [
    {
      "id": "dep_request_type_hardware",
      "parentFieldKeys": ["request_type"],
      "operator": "equals",
      "comparisonValue": "Hardware",
      "actionType": "show_fields",
      "actionPayload": { "fieldKeys": ["asset_type", "device_model"] },
      "fallbackBehavior": "hide_fields",
      "resetPolicy": "clear_hidden_descendants",
      "priority": 100
    }
  ]
}
```

### Mapping schema (example)
```json
{
  "ticketMappings": [
    { "target": "subject", "mode": "template", "value": "{{request_type}} request for {{requested_for}}" },
    { "target": "category", "mode": "direct", "sourceField": "request_type" },
    { "target": "description", "mode": "template", "value": "Submitted from form {{form_name}}\n\n{{submission_summary}}" }
  ]
}
```

---

## 7. API Surface

Claude should adapt to the existing API style (REST, GraphQL, RPC, etc.).

### Admin APIs
- `GET /forms`
- `POST /forms`
- `GET /forms/:id`
- `PATCH /forms/:id`
- `POST /forms/:id/clone`
- `POST /forms/:id/publish`
- `POST /forms/:id/archive`
- `GET /forms/:id/versions`
- `GET /forms/:id/versions/:versionId`
- `POST /forms/:id/versions/:versionId/validate`

- `GET /field-definitions`
- `POST /field-definitions`
- `PATCH /field-definitions/:id`
- `GET /field-definitions/:id/usage`
- `GET /field-definitions/:id/versions`

- `GET /field-groups`
- `POST /field-groups`
- `PATCH /field-groups/:id`

### Runtime APIs
- `GET /portal/forms/:formKey`
- `POST /portal/forms/:formKey/evaluate`
- `POST /portal/forms/:formKey/submit`
- `GET /portal/forms/:formKey/metadata`

### Submission/Audit APIs
- `GET /form-submissions`
- `GET /form-submissions/:id`
- `GET /form-submissions/:id/events`
- `GET /form-submissions/:id/ticket`

---

## 8. UI Requirements

## 8.1 Admin UI

### Pages/screens
- field library list/detail
- field group list/detail
- forms list/detail
- form builder canvas
- rules panel
- ticket mapping panel
- version history panel
- publish validation modal
- submission history viewer

### Admin UX requirements
- clear distinction between draft and published
- clear indication of reusable vs local override values
- dependency editor should be understandable to non-developers
- preview should show resolved conditional behavior
- warnings before deleting/changing fields with downstream usage

## 8.2 End User Runtime UI
- render responsive layout
- evaluate dependencies as user answers questions
- show validation inline
- preserve draft answers if supported by product
- show submission confirmation with ticket reference

### Accessibility requirements
- keyboard usable
- labels properly associated
- no hidden required traps
- screen-reader friendly conditional content updates
- errors announced accessibly

---

## 9. Validation Rules

Publish-time validation must block forms with:
- circular dependencies
- unresolved field references
- layout references to missing field instances
- invalid option source config
- invalid ticket mapping targets
- unsupported rule action/event combinations
- duplicate field keys within same runtime namespace

Submit-time validation must enforce:
- required fields after dependency evaluation
- type validation
- option membership
- lookup legitimacy
- field-level validation constraints
- permission-based field restrictions if applicable
- ticket mapping completeness for mandatory ticket fields

---

## 10. Security / Multi-Tenancy

Claude must preserve existing tenant isolation patterns.

### Requirements
- all reads/writes tenant-scoped
- rule execution tenant-scoped
- option sources must not leak cross-tenant data
- submission payloads validated and sanitized
- HTML/static content blocks sanitized
- external lookup/API connectors permission-controlled
- audit sensitive changes
- file uploads scanned/validated if supported by platform

---

## 11. Performance Expectations

- runtime form load should not require excessive synchronous rule calls
- dependency evaluation should be deterministic and efficient
- option source lookups should support caching where safe
- publish validation can be heavier than runtime evaluation
- large forms should still render acceptably

Recommended implementation:
- precompile dependency graph on publish
- precompile layout/runtime schema for fast render
- cache resolved form versions by tenant + form key + version

---

## 12. Testing Requirements

Claude must add tests.

### Unit tests
- field schema validation
- dependency graph validation
- dependency action evaluation
- rule adapter behavior
- ticket mapping logic
- versioning logic

### Integration tests
- create field → add to form → publish → render → submit → ticket created
- parent field changes child options/visibility
- stale child values cleared/rejected when parent changes
- published version remains immutable after new draft created
- submission snapshot preserved accurately

### UI tests
- builder drag/drop or ordering flows
- conditional fields render correctly
- publish validation errors shown clearly
- submission success path shows ticket reference

### Regression priorities
- server-side conditional validation
- ticket creation from form submission
- versioned schema compatibility
- tenant isolation

---

## 13. Delivery Plan / Epics

## Epic 1: Domain Model + Database Foundation
**Goal:** establish durable versioned schema.

### Tickets
- [ ] Create database tables for forms, versions, field definitions, field groups, submissions, and audit logs
- [ ] Add migrations with rollback strategy
- [ ] Implement domain models and repositories
- [ ] Implement versioning helpers
- [ ] Add tenant scoping and RBAC guards
- [ ] Add seed/dev fixtures for sample forms and fields

### Acceptance criteria
- Draft and published form records can coexist
- A form version can reference a stable snapshot of layout/behavior/mapping
- Multi-tenant isolation enforced in repository/service layer

---

## Epic 2: Field Library
**Goal:** reusable field definitions with overrides.

### Tickets
- [ ] Implement CRUD APIs for field definitions
- [ ] Implement field version history
- [ ] Implement validation for all MVP field types
- [ ] Add field usage tracking
- [ ] Support field deprecation/archival
- [ ] Add admin UI for field library

### Acceptance criteria
- Admin can create a reusable field once and use it in many forms
- Form-level overrides do not alter canonical field definition
- Usage list shows where a field is referenced

---

## Epic 3: Field Groups
**Goal:** reuse bundled field sets.

### Tickets
- [ ] Implement field group schema and CRUD APIs
- [ ] Allow ordered membership of fields in a group
- [ ] Version field groups
- [ ] Add admin UI for field groups
- [ ] Add usage tracking for groups

### Acceptance criteria
- Admin can create a reusable field group and insert it into forms
- Version changes are tracked safely

---

## Epic 4: Form Builder Core
**Goal:** admin can visually assemble a form.

### Tickets
- [ ] Implement form CRUD
- [ ] Implement draft version editing model
- [ ] Implement layout schema editor using rows/columns/sections
- [ ] Support placing field instances and static content blocks
- [ ] Implement responsive preview
- [ ] Implement local validation for missing field/layout references
- [ ] Add clone form flow

### Acceptance criteria
- Admin can build a responsive form visually
- Form draft persists correctly and reloads accurately
- Builder uses a 12-column layout model

---

## Epic 5: Conditional / Dependent Fields
**Goal:** support dynamic behavior driven by parent answers.

### Tickets
- [ ] Implement dependency schema and validator
- [ ] Implement circular dependency detection
- [ ] Implement runtime dependency evaluation engine
- [ ] Support show/hide logic
- [ ] Support option filtering logic
- [ ] Support required/optional and enable/disable mutation
- [ ] Support label/help text mutation
- [ ] Support branch/section navigation hooks
- [ ] Implement reset policy for stale child values
- [ ] Enforce same dependency behavior server-side on submit
- [ ] Add admin UI for dependency editor
- [ ] Add test cases for nested dependency chains

### Acceptance criteria
- Parent field can control child visibility, options, and validation
- Invalid dependent submissions are rejected server-side
- Parent value changes can clear incompatible child answers per reset policy

---

## Epic 6: Rules Engine Adapter
**Goal:** integrate forms with existing rules engine cleanly.

### Tickets
- [ ] Define form event contract for rules engine
- [ ] Implement adapter for rule invocation at supported event times
- [ ] Normalize form context payload for rules engine
- [ ] Capture rule execution trace logs
- [ ] Handle rule failures gracefully with safe defaults
- [ ] Add admin UI for binding rules to forms/scopes if not already present

### Acceptance criteria
- Form runtime can invoke the rules engine on load/change/submit/post-submit
- Rule actions are logged and traceable
- Failures do not corrupt persisted submissions

---

## Epic 7: Ticket Mapping + Submission Pipeline
**Goal:** successful submissions create tickets.

### Tickets
- [ ] Implement runtime submit endpoint
- [ ] Implement client + server validation pipeline
- [ ] Persist immutable submission snapshot
- [ ] Implement ticket mapping engine
- [ ] Create ticket creation service integration
- [ ] Store created ticket reference on submission
- [ ] Add confirmation response payload

### Acceptance criteria
- Successful form submission creates a helpdesk ticket
- Submission snapshot remains queryable even after form changes
- Required ticket fields can be derived via mappings/rules

---

## Epic 8: Publish / Version Lifecycle
**Goal:** make live forms safe to evolve.

### Tickets
- [ ] Implement publish validation pipeline
- [ ] Lock published versions from direct mutation
- [ ] Create new draft from published version
- [ ] Implement archive flow
- [ ] Add version history UI
- [ ] Add compare/diff support if feasible

### Acceptance criteria
- Published versions are immutable
- New edits occur in a separate draft/version
- Historical submissions still resolve against exact published version

---

## Epic 9: Submission History + Auditability
**Goal:** give admins visibility and support debugging.

### Tickets
- [ ] Implement submission history APIs
- [ ] Implement submission detail page
- [ ] Show raw snapshot, normalized values, validation trace, and ticket reference
- [ ] Implement audit log for admin changes
- [ ] Add searchable filters by form/date/status/ticket

### Acceptance criteria
- Admin can inspect what was submitted and how it mapped to a ticket
- Important config changes are auditable

---

## Epic 10: Hardening / QA / Documentation
**Goal:** production readiness.

### Tickets
- [ ] Add unit/integration/UI tests
- [ ] Add performance checks for large forms
- [ ] Add security review checklist
- [ ] Add migration notes
- [ ] Add admin/user documentation
- [ ] Add developer README for extending field types and dependency actions

### Acceptance criteria
- Core workflows are covered by tests
- Documentation is sufficient for future contributors
- Module is safe to deploy behind feature flag if desired

---

## 14. Suggested Build Order

Claude should implement in this order:

1. Domain/database foundation
2. Field library
3. Form draft/version model
4. Builder layout schema editor
5. Runtime renderer
6. Dependency engine
7. Rules engine adapter
8. Submission + ticket mapping
9. Publish lifecycle and audit views
10. Hardening/tests/docs

Reason: the dependency engine and ticket mapping become much easier once the versioned schema model is stable.

---

## 15. Definition of Done

This feature is done when:
- Admin can create reusable fields and field groups
- Admin can build a form using a visual responsive layout editor
- Admin can configure dependent/conditional fields where parent values control child behavior
- Published form can be rendered to an end user
- End user can submit the form successfully
- Submission creates a helpdesk ticket
- Submission snapshot is stored immutably
- Rules engine can participate in load/change/submit/post-submit lifecycle
- Published versions are immutable and historical submissions remain valid
- Tests cover core success and failure flows

---

## 16. Explicit Instructions to Claude

Use this section as the direct implementation prompt.

### Pasteable prompt

```md
You are implementing a Custom Forms module inside an existing multi-tenant ServiceDesk application.

Build the module in a production-ready way using the existing project architecture, coding conventions, RBAC model, API style, and UI stack.

Core requirements:
- Admins can create reusable field definitions and reusable field groups
- Admins can build forms using a visual responsive layout builder based on rows/columns/sections
- Forms support conditional/dependent field behavior as a first-class feature
- Parent fields must be able to control child visibility, child options, required state, enabled/disabled state, label/help text, validation, and section/branch navigation
- Dependent behavior must be enforced both in the UI and on the backend at submit time
- Every successful submission must create a helpdesk ticket
- The form system must integrate with the existing rules engine using structured lifecycle events
- Published form versions must be immutable
- Every submission must preserve an immutable snapshot of the exact form version and submitted answers

Implementation constraints:
- Preserve tenant isolation and existing RBAC/security patterns
- Do not use absolute-position layout; use a responsive grid model
- Use a dedicated mapping layer between form answers and ticket fields
- Detect and block circular dependencies at publish time
- Add tests for dependency evaluation, server-side validation, versioning, and ticket creation
- Prefer modular services with clear boundaries between schema, layout, behavior, runtime, and ticket mapping

Deliver the work in incremental commits or logical slices if operating interactively:
1. database/domain foundation
2. field library + field groups
3. form builder schema and admin APIs/UI
4. dependency engine
5. rules engine adapter
6. submission pipeline + ticket mapping
7. versioning/audit/history
8. tests/docs

For each major slice:
- implement code
- add/update tests
- add migrations where needed
- update docs/README
- avoid breaking unrelated modules

If project gaps or ambiguous assumptions exist, choose the most maintainable option and document it in code comments or a short implementation note.
```

---

## 17. Nice-to-Have Phase 2 Items

- tabs
- multi-step wizard
- repeatable section blocks / table rows
- saved drafts for end users
- reusable form templates
- external data connectors with cache controls
- simulation mode for rules/dependencies
- diff viewer between versions
- analytics on field drop-off and submission completion

---

## 18. Final Guidance

The most important thing Claude must not miss is this:

**Conditional/dependent field behavior is not optional sugar. It is foundational.**

If the parent answer changes, the system must be able to reliably:
- show different questions
- change the next available options
- require or unrequire child fields
- clear invalid child values
- validate the final submission safely
- still create a correct ticket

That behavior is one of the main differentiators of this module and should be treated as core architecture, not a small add-on.
