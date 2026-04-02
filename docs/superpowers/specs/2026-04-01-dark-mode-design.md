# Dark Mode Design Spec — MeridianITSM

## Summary

Add a three-way theme toggle (Light / Dark / System) to the user profile dropdown across all pages (dashboard, portal, login, signup). Persist preference per-user in the database so it follows across devices. Use CSS custom properties for the color system, with a cookie + inline script to prevent flash of wrong theme on page load.

## Approach

**CSS Custom Properties** — define ~20 semantic color tokens in a global stylesheet. Toggle between light/dark by setting `data-theme="dark"` on `<html>`. Inline styles reference `var(--token-name)`.

## Color Tokens

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | `#ffffff` | `#111827` |
| `--bg-secondary` | `#f9fafb` | `#1f2937` |
| `--bg-tertiary` | `#f3f4f6` | `#374151` |
| `--bg-hover` | `#e5e7eb` | `#4b5563` |
| `--text-primary` | `#111827` | `#f9fafb` |
| `--text-secondary` | `#374151` | `#d1d5db` |
| `--text-muted` | `#6b7280` | `#9ca3af` |
| `--text-placeholder` | `#9ca3af` | `#6b7280` |
| `--border-primary` | `#e5e7eb` | `#374151` |
| `--border-secondary` | `#d1d5db` | `#4b5563` |
| `--accent-primary` | `#0284c7` | `#38bdf8` |
| `--accent-success` | `#059669` | `#34d399` |
| `--accent-warning` | `#d97706` | `#fbbf24` |
| `--accent-danger` | `#dc2626` | `#f87171` |
| `--shadow` | `rgba(0,0,0,0.1)` | `rgba(0,0,0,0.4)` |
| `--input-bg` | `#ffffff` | `#1f2937` |
| `--card-bg` | `#ffffff` | `#1e293b` |
| `--sidebar-bg` | `#0f172a` | `#0b1120` |
| `--table-stripe` | `#f9fafb` | `#1f2937` |
| `--badge-bg` | `#e0f2fe` | `#1e3a5f` |

## Database

Add to User model:
```prisma
themePreference String @default("system") // "light", "dark", "system"
```

## Persistence Flow

1. User clicks toggle -> sets cookie (`meridian-theme`) + `data-theme` attr instantly
2. Background `PATCH /api/v1/users/me/preferences` persists to DB
3. On login from another device: server reads DB -> sets cookie -> correct theme on first render

## Flash Prevention

Inline `<script>` in `<head>` of root layout:
- Reads `meridian-theme` cookie
- If `system`, checks `window.matchMedia('(prefers-color-scheme: dark)')`
- Sets `data-theme` attribute before paint
- Listens for OS preference changes when in `system` mode

## Toggle UI

Three-way segmented control in the user profile dropdown (both dashboard and portal layouts):
- Sun icon = Light
- Moon icon = Dark
- Monitor icon = System
- Current selection highlighted

## Scope

All pages: dashboard/*, portal/*, /login, /signup, /mfa/*

## Migration Strategy

Mechanical replacement of hardcoded hex values in inline styles with `var()` references across all page files.
