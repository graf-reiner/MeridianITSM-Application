# Notification Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a configurable notification rules engine where admins define trigger, conditions (AND/OR), and actions rules that replace hardcoded notification dispatch.

**Architecture:** Prisma models for rules + logs. dispatchNotificationEvent() evaluates rules from Redis cache, executes matched actions via existing BullMQ workers. Condition evaluator uses hybrid AND/OR groups. YAML import/export via yaml npm package.

**Tech Stack:** Prisma, Fastify, Redis, BullMQ, Next.js App Router, TanStack Query, yaml, @mdi/react

**Spec:** docs/superpowers/specs/2026-03-30-notification-rules-engine-design.md

---

## 10 Tasks (execute in order)

### Task 1: Schema + DB Migration
- Add NotificationRule and NotificationRuleLog to Prisma schema
- Create tables via SQL, regenerate Prisma client
- Commit

### Task 2: Condition Evaluator
- Create notification-rules-conditions.ts
- evaluateConditionGroups (OR groups, AND within), evaluateCondition, resolveFieldValue
- All operators: equals, not_equals, in, not_in, contains, greater_than, less_than, between, is_true, is_false, before, after, within_hours
- Commit

### Task 3: Action Executors
- Create notification-rules-actions.ts
- 10 executors: in_app, email, slack, teams, webhook, sms, push, escalate, update_field, webhook_wait
- Dynamic recipient resolution, message template substitution
- Commit

### Task 4: Core Engine (dispatchNotificationEvent)
- Create notification-rules.service.ts
- Load rules from Redis cache (60s TTL), fallback to DB
- No rules = legacy behavior. Evaluate conditions, fire actions, log results
- Cache invalidation on rule CRUD
- Commit

### Task 5: Integration (replace hardcoded notifies)
- Modify ticket.service.ts: replace notifyTicketCreated/Assigned/Commented/Resolved/Updated with dispatchNotificationEvent
- Commit

### Task 6: API Routes (CRUD + reorder + test + logs)
- Create notification-rules.ts route file
- GET list, POST create, GET/:id, PATCH/:id, DELETE/:id, PATCH/reorder, POST/:id/test, GET/:id/logs, POST/generate-defaults
- Register in settings/index.ts
- Commit

### Task 7: YAML Import/Export Routes
- Install yaml package
- Create notification-rules-yaml.ts
- GET export, POST import (preview), POST import/confirm
- Name-based reference resolution
- Commit

### Task 8: UI - Rules List Page
- Add card to settings hub (mdiBellAlert icon)
- Create rules list page with table, filters, active toggle, import/export buttons
- Commit

### Task 9: UI - Rule Editor Page
- Trigger dropdown, condition group builder (AND/OR cards), action cards with type-specific config
- Supporting data queries (queues, categories, groups, alerts)
- Commit

### Task 10: Rebuild, Verify, Push
- Prisma generate, type-check, rebuild web, restart, push
