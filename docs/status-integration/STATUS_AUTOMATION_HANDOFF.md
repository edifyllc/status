# Status Automation — Handoff Document

**Repo:** `edifyllc/status`  
**Live page:** https://edifyllc.github.io/status/  
**Last updated:** 2026-05-31

---

## Overview

This repository is the single source of truth for the uptime status of both **uEdify** (`uedify.com`) and **STEM.net** (`stem.net`). A GitHub Actions workflow runs every 5 minutes, hits every critical endpoint across both platforms, and commits the results back to `main`, which GitHub Pages serves immediately.

Claude (this agent) acts as the intelligent status-update and error-checking agent — it can run ad-hoc checks, interpret failures, update the JSON data files, and push fixes.

---

## File Map

| File | Purpose |
|------|---------|
| `scripts/status-check.mjs` | Node.js script that runs all health checks and writes the four JSON data files |
| `.github/workflows/status-checks.yml` | Scheduled GHA job (every 5 min) that invokes the script and commits results |
| `docs/status-integration/standalone-wired-status.html` | The canonical status page HTML; copied to `index.html` on each run |
| `docs/status-integration/STATUS_AUTOMATION_HANDOFF.md` | This document |
| `status.json` | Current service states (what the page displays) |
| `history.json` | Rolling 24 h of 5-min snapshots (powers the uptime bar) |
| `production-tests.json` | Latest full test-suite run result |
| `production-test-history.json` | Last 200 test runs |
| `index.html` | Served by GitHub Pages — auto-synced from standalone HTML on each CI run |

---

## Services Monitored

### Edify (uedify.com)
| Service ID | Name | Derived from tests |
|---|---|---|
| `edify_health` | Edify API Health | `api_health`, `api_referral`, embed & analytics endpoints |
| `edify_referral` | Edify Referral System | `api_referral`, `referral_dashboard` |
| `edify_ai` | Edify AI Agents | `embed_active`, `embed_config`, `embed_messages` |
| `edify_booking` | Edify Booking Availability | All page tests |
| `stripe_edify` | Stripe (Edify Payments) | `org_credits` |
| `ai_subscriptions` | AI Agent Subscriptions | `embed_messages`, `org_credits` |
| `ai_provider` | AI Provider (Anthropic) | `embed_active`, `embed_config` |

### STEM.net
| Service ID | Name | Derived from tests |
|---|---|---|
| `stem_health` | STEM.net API Health | `stem_health` |
| `stem_educators` | STEM.net Educators | `stem_educators`, `stem_programs` |
| `stripe_stem` | Stripe (STEM Payments) | `stem_health` |

### Infrastructure
| Service ID | Name | Derived from tests |
|---|---|---|
| `database` | Database (PostgreSQL) | `api_health`, `org_analytics`, `org_members` |

---

## Test Suite (33 checks)

### Edify Pages (10)
`page_landing` · `page_login` · `page_signup` · `page_orgs_dir` · `page_ai_agents`  
`page_for_orgs` · `page_org_profile` · `page_instructor` · `page_instructors` · `page_embed`

### Edify API (2)
`api_health` · `api_referral`

### Auth (1)
`auth_bad_creds` — verifies 401 on bad credentials (not 500)

### Embed (3)
`embed_active` · `embed_config` · `embed_messages`

### Org (5)
`org_portal` · `org_analytics` · `org_credits` · `org_members` · `org_public`

### Referral (1)
`referral_dashboard`

### Regressions (3)
`regr_analytics_500` · `regr_embed_cors` · `regr_auth_401`

### STEM.net (5)
`stem_health` · `stem_educators` · `stem_programs` · `stem_claim` · `stem_auth`

---

## Status Levels

| Level | Meaning |
|-------|---------|
| `operational` | All tests for that service passing |
| `degraded` | Some tests failing (below 100 %, above 0 %) |
| `outage` | All mapped tests failing |

Overall status rolls up: any `outage` → `outage`; any `degraded` → `degraded`; else `operational`.

---

## Running Checks Manually

```bash
# From repo root
node scripts/status-check.mjs
```

Writes all four JSON files locally. Commit and push to update the live page.

---

## How Claude Acts as the Status Agent

When invoked in this repo, Claude will:

1. **Check live status** — run `scripts/status-check.mjs` or fetch the JSON files to understand current state
2. **Diagnose failures** — inspect which test IDs are failing and map them to affected services
3. **Update data files** — write corrected `status.json` / `history.json` entries if manual override is needed (e.g., marking a known incident as `degraded` with a message)
4. **Push to GitHub** — commit and push to `main` so GitHub Pages reflects the change within seconds
5. **Report** — summarise what changed and what is still failing

### Incident response workflow
1. Failure detected in CI → GitHub Actions commits updated JSON automatically
2. If the issue needs a human note or override, invoke Claude in this repo
3. Claude runs checks, confirms failure, updates status, pushes
4. When resolved, Claude runs checks again, confirms green, pushes final state

---

## GitHub Pages Setup

- Branch: `main`
- Root: `/` (serves `index.html`)
- No build step — pure static files

To enable: **Settings → Pages → Source → Deploy from branch → `main` / `/ (root)`**

---

## Adding a New Service or Test

1. Add the fetch call in `scripts/status-check.mjs` under `runTests()` with a unique `id`
2. Map the new `id` into a service entry in `deriveServices()`
3. If the service needs a visual group on the page, add it to `SERVICE_GROUPS` in `standalone-wired-status.html`
4. Commit and push — the workflow picks it up on the next run
