# Fleet integration

A short guide for anyone working on or with the **Fleet** tab. It explains what
thefleet is, why it lives inside Plane, and how each part behaves. The fleet's
own API guide is in `docs/thefleet-integration.md`; this file is the Plane side.

## What thefleet is

thefleet is a separate web-data backend. It runs **jobs** (scrape a page,
search the web, crawl a site, browse with a real browser), publishes
**services** (named, cached JSON feeds such as "top stories"), and keeps
**watches** (uptime checks on URLs with a history of results). Every caller is
a _bot_ identified by a `bk_...` key, and each key carries a scope: which job
kinds it may run, which hosts it may touch, and a daily quota.

## Why it is in Plane

Teams already plan and track work in Plane. The Fleet tab gives each workspace
a small, self-contained console for the fleet so people can pull web data
without leaving Plane, without sharing a raw bot key, and without a second
login. A workspace admin turns it on; members use it; guests can look.

## How it works

```
browser  ->  Plane API  ->  thefleet
         (session auth)   (Bearer bk_... added server-side)
```

- The web app never talks to the fleet directly. It calls
  `/api/workspaces/<slug>/fleet/...` and the API forwards the request with the
  workspace's key.
- The key is stored encrypted on `WorkspaceFleetIntegration` and only its last
  four characters are ever shown. If the workspace has no key of its own, the
  API falls back to the instance key from `THEFLEET_DEFAULT_KEY`.
- Fleet error codes (`scope_denied`, `host_denied`, `quota_*`, `job_failed`,
  `retryAfterSec`) are passed through unchanged. They describe policy on the
  fleet side, not bugs in Plane.
- If Fleet is disabled for the workspace the API answers `409 fleet_disabled`.

## The tabs

| Tab      | What it does                                                                                                                                                                                                                                                                                                                                                                                                               | Who                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Search   | A search-engine style page. One query runs as one `search` job per chosen engine (Google, Bing, DuckDuckGo, Yahoo), the store polls each job and merges results by URL, and a brief sidebar shows top domains, engine agreement, related terms and a **Track** button that creates a `serp` watch (`engine:keyword`). Result cards can add `uptime` and `monitor` watches. Settings persist per workspace in localStorage. | search: admin, member |
| Overview | Shows the bot's usage and quota for today.                                                                                                                                                                                                                                                                                                                                                                                 | everyone              |
| Services | Lists the fleet's services and calls one with JSON params. A `202` means the fleet is still working; the store re-posts the same params until a result arrives (up to three minutes) and never adds `fresh` on a retry. `Fresh` bypasses the cache.                                                                                                                                                                        | call: admin, member   |
| Watches  | Lists uptime watches and their recent checks; creates a new watch.                                                                                                                                                                                                                                                                                                                                                         | create: admin, member |
| Jobs     | Queues a scrape, search, crawl or browse job and polls its status every three seconds for up to five minutes.                                                                                                                                                                                                                                                                                                              | create: admin, member |
| Settings | Fleet URL, bot key, enabled flag, connection test.                                                                                                                                                                                                                                                                                                                                                                         | admin                 |

## Enabling it

1. Open Fleet in the workspace sidebar, then Settings.
2. Tick **Enabled** and save. The instance key is used automatically.
3. Optionally paste a workspace key minted on the fleet's Agents screen. It
   overrides the instance key and gives the workspace its own quota and host
   policy. **Clear key** goes back to the instance key.
4. **Test connection** should report the fleet's usage.

## Where the code lives

| Piece               | Path                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Model and migration | `apps/api/plane/db/models/fleet.py`, `apps/api/plane/db/migrations/0124_workspacefleetintegration.py` |
| Fleet client        | `apps/api/plane/utils/thefleet.py` (the only place that builds fleet URLs)                            |
| Endpoints           | `apps/api/plane/app/views/workspace/fleet.py`, `apps/api/plane/app/urls/fleet.py`                     |
| Types               | `packages/types/src/fleet.ts`                                                                         |
| Service and store   | `apps/web/core/services/fleet.service.ts`, `apps/web/core/store/fleet/fleet.store.ts`                 |
| UI                  | `apps/web/core/components/fleet/`                                                                     |
| Page and route      | `apps/web/app/(all)/[workspaceSlug]/(projects)/fleet/`, `apps/web/app/routes/core.ts`                 |
| Railway variables   | `deployments/railway/README.md`, section "thefleet integration"                                       |

## Rules when changing it

- Never send the key to the browser or write it to logs.
- Keep every fleet URL inside `plane/utils/thefleet.py`.
- Keep fleet error codes intact so operators can act on them.
- New passthrough query parameters go in the allowlist in the views, not in
  the client.
