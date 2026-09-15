# Integrating thefleet into another project

How to give an app (a Next.js site, a Hermes agent, a cron worker, another
AI project) access to the fleet **without giving it the fleet**. The app
holds one key; the fleet decides what that key may touch, meters it, and
answers from cache when it can. This file is written so an AI coding agent
working in the _other_ repo can read it and wire things up — hand it over
whole, or paste §6 into that repo's `CLAUDE.md` / `AGENTS.md`.

```
your app ──bk_ key──▶ thefleet /api/bot/v1/services/:slug ──jobs──▶ boxes
                      (scopes · host policy · quotas · cache · call log)
```

Three surfaces, in the order an app should reach for them:

| Surface                                                 | Use it for                                                                                            | Needs                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Services** `GET/POST /services/:slug`                 | anything on demand — call a slug, get fixed JSON, repeats served from cache                           | a key whose scopes cover the kinds the recipe uses                     |
| **Watches** `GET /watches`, `GET /checks`, `WS /stream` | things the fleet should re-check on its own clock (uptime, price, X profile, gamba leaderboard, rank) | watches assigned to the key (operator) or scope `watch` to add its own |
| **Raw jobs** `POST /jobs`                               | one-off scrape/search/crawl/browse when no recipe fits                                                | job kinds in scope; you parse the raw result yourself                  |

Full wire contract: the fleet's `/docs` page. Client code you can copy:
`integrations/thefleet.ts` and `integrations/thefleet.py` (no dependencies).

---

## 1. One key per app — the restriction is the integration

Every restriction lives on the key, set on the fleet dashboard at
**Agents → new key**. The app cannot loosen any of it; a service cannot
either (a service adds shape and cache, never privilege). Minting a key is
the whole "install" on the fleet side.

Mint it **external** (the default). That tier is a ceiling the dashboard
cannot click past: no `allowJs`, ≤ 8 concurrent, ≤ 2,000 jobs/day, ≤ 50
pages/crawl, ≤ 2 MB/result. `internal` exists for the fleet owner's own
projects (odin-tools) and is not for an integration. Set `project` to the
app's name so its keys group together on **Agents**.

| Scope            | Set it to                                                                                                      | Why                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `kinds`          | only what the app's services need (`scrape` for link checks; add `watch` if the app registers its own watches) | a key without `crawl` cannot cause a crawl by any wording of any request               |
| `hostAllow`      | the registrable domains the app is allowed to touch, e.g. `amazon.com`, `amzn.to`                              | empty means _any public host_ — fine for a general agent, wrong for a site integration |
| `hostDeny`       | your own domains, internal names                                                                               | deny wins over allow                                                                   |
| `maxConcurrent`  | 2–4 for a website, 1 for a cron                                                                                | one stuck loop cannot occupy the fleet                                                 |
| `dailyJobs`      | links × checks-per-day × 1.2                                                                                   | a bug costs a bounded amount                                                           |
| `maxBytesPerJob` | 256 KiB for link checks; larger only for markdown extraction                                                   | result size cap                                                                        |
| `allowJs`        | off                                                                                                            | `browse` `evaluate`/`extract` stay locked                                              |

Redirect hops are re-checked against `hostAllow` on the box, so a short
link that bounces `amzn.to → amazon.com` needs **both** domains allowed.
The check is on the registrable domain; subdomains inherit.

Two keys for one app is normal: a `-web` key (services only, small
`maxConcurrent`) and a `-cron` key (`watch` scope, higher `dailyJobs`).
The call log on **Services** and the ledger on **Agents** are per key, so
the split is visible.

## 2. Build the app's services

**Services → new service**, or **Services → json → paste → import** for a
recipe from `integrations/recipes/`. A service is:

- **params** — the contract the app sees (`required`, `default`, `description`).
  Unknown params are rejected, so the contract is exact.
- **bricks**, top to bottom, the last one is the reply:
  - `job` — runs a scrape/search/crawl/browse _under the calling key_. Output
    is the whole job (`result`, `pages`, `status`, `id`).
  - `pick` — `name = path` lines; missing paths become `null`.
  - `regex` — one pattern over one string; `group` selects, `all` returns
    every match. The only matcher there is.
  - `shape` — the output JSON with `{{path}}` templates. A value that is
    exactly one template keeps its type (numbers stay numbers, `null` stays
    `null`); mixed strings render as text.
- **cache** — `cacheTtlSec` (0 = off) and `cacheShared`. Public pages can
  share across keys; anything containing a per-app id (affiliate tags,
  logged-in views) should be per-key.

Template roots: `params.*`, `vars.*` (bricks saved with `as`),
`last` (previous brick), `steps[n]` (an earlier brick). The editor rejects a
spec that reads an undeclared param, a later step, or `last` in the first
brick.

**Try it** on the same screen runs the recipe as a chosen key and logs the
call like any other, so you see the exact JSON the app will get before the
app exists.

## 3. Wire the app

Environment:

```
THEFLEET_URL=https://thefleet-production.up.railway.app
THEFLEET_KEY=bk_…
```

Copy one client file in. Both expose the same five verbs and never hide a
fleet error code:

```ts
import { TheFleet, FleetError } from "./thefleet";
const fleet = new TheFleet({ url: process.env.THEFLEET_URL!, key: process.env.THEFLEET_KEY! });

const r = await fleet.call("affiliate-check", { url: "https://amzn.to/3abc" });
r.output; // { url, finalUrl, status, title, tag, unavailable, fetchError, jobId }
(r.cached, r.asOf); // where the answer came from and when it was produced
```

```py
from thefleet import TheFleet, FleetError
fleet = TheFleet(os.environ["THEFLEET_URL"], os.environ["THEFLEET_KEY"])
r = fleet.call("affiliate-check", {"url": "https://amzn.to/3abc"})
```

What the client does for you, and what it deliberately does not:

- **202 handling.** A call that outruns `wait` (default 45 s, max 60) comes
  back 202 with a job id. The fleet has parked the call; re-asking with the
  _same params and the same key_ resumes it. `call()` loops on that until
  `timeout` (default 180 s) then throws `FleetError("timeout")` — call again
  later, nothing was lost or billed twice. `callOnce()` hands the 202 back
  to you instead, for request/response frameworks that must not block.
- **`fresh: true`** skips the cache for that one call. The client drops it
  on the resume loop so a retry cannot restart the work.
- **Errors are thrown, never swallowed.** Branch on `err.code`:

| code                                              | status  | meaning / what to do                                                                                  |
| ------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `bad_input`                                       | 400     | your params broke the contract — fix the caller                                                       |
| `unauthorized`, `key_disabled`                    | 401/403 | the key — stop, alert                                                                                 |
| `scope_denied`, `host_denied`                     | 403     | the key's restriction did its job — the app asked for something it may not have; log it, do not retry |
| `not_found`                                       | 404     | no such slug, or disabled                                                                             |
| `quota_concurrent`, `quota_daily`, `rate_limited` | 429     | `retryAfterSec` set; back off (`err.quota`)                                                           |
| `job_failed`                                      | 502     | the target, not the fleet: dead page, blocked fetch, SSRF-guarded host; surface `err.message`         |
| `output_too_large`                                | 502     | recipe output over 8 MB; tighten `charLimit`                                                          |
| `timeout`                                         | client  | still pending after `timeout`; re-call same params later                                              |

The app should treat a 4xx from the fleet as a _property of the request_
and a 5xx as a _property of the target_. Neither means "retry immediately".

## 4. Operate it

- **Services** screen: per-slug calls, cache-hit %, avg latency, errors,
  the newest 200 calls with key, params, job ids. Output never appears
  here — only its size — so the log is safe to leave on.
- **Agents** screen: per-key job ledger and quotas, the same numbers as
  `GET /usage` for that key. `usage.services[]` breaks the key's service
  calls down by slug, so an app can show its own meter.
- **Changing a recipe purges its cache**; consumers see the new shape on
  their next call. Add fields rather than renaming them once an app is live.
- **Disabling a service** returns `not_found` to callers; disabling a key
  returns `key_disabled`. Both are instant and reversible.
- **Result retention**: job results are pruned after 7 days; the service
  cache lives by its own TTL; call and job ledgers are kept.

## 5. Worked example — affiliate link monitor

Goal: every affiliate link a site publishes keeps resolving, keeps its tag
through the redirect chain, and lands on a live product page.

**On the fleet**

1. Key `nudah-affiliate`: kinds `scrape`, `watch`; `hostAllow`
   `amzn.to`, `amazon.com` (plus every network you link to);
   `dailyJobs` = links × 24 × 1.2 for hourly checks; `maxBytesPerJob` 256 KiB.
2. Import `integrations/recipes/affiliate-check.json` on **Services**.
   It scrapes the link as plain text (`onlyMainContent: false`, so a
   "currently unavailable" banner outside `<main>` still counts), pulls
   the affiliate id out of the final URL, pattern-matches dead-page wording,
   and shapes:

   ```json
   {
     "url": "https://amzn.to/3abc",
     "finalUrl": "https://www.amazon.com/dp/B0…?tag=nudah-20&…",
     "status": 200,
     "title": "Product name",
     "tag": "nudah-20",
     "unavailable": null,
     "fetchError": null,
     "jobId": "j_…"
   }
   ```

   Cache is per key (`cacheShared: false` — the tag is yours) with a 1 h
   TTL, so a page that renders the same link ten times costs one job.

3. Optional clock-driven layer: with scope `watch` the app registers each
   link as an `uptime` watch (`POST /watches {kind:"uptime", target}`) and
   the fleet pings it on the monitor interval with no job spend; `up`,
   `httpStatus` and `responseMs` arrive through `GET /checks` or the
   WebSocket. Watches do not follow the tag or read the page, so pair them
   with the service: watches say _down_, the service says _why_.

**In the app** (cron, hourly):

```ts
const fleet = new TheFleet({ url, key, timeout: 120 });
for (const link of links) {
  try {
    const { output: o, cached } = await fleet.call<Affiliate>("affiliate-check", { url: link.url }, { fresh: !cached });
    const bad =
      o.status !== 200 || o.tag?.toLowerCase() !== link.expectedTag || o.unavailable !== null || o.fetchError !== null;
    await save(link.id, { ...o, ok: !bad, checkedAt: new Date() });
    if (bad) await alert(link, o);
  } catch (e) {
    if (e instanceof FleetError && e.quota) break; // over budget: stop the sweep, not the app
    if (e instanceof FleetError && e.code === "host_denied")
      await flagNewNetwork(link); // a domain the key is not allowed — add it on Agents, or the link is off-policy
    else await save(link.id, { ok: false, error: String(e) });
  }
}
```

`type Affiliate = { url: string; finalUrl: string | null; status: number | null; title: string | null; tag: string | null; unavailable: string | null; fetchError: string | null; jobId: string }`.

Verdict table the app can show:

| `status`  | `tag`        | `unavailable` | means                                                |
| --------- | ------------ | ------------- | ---------------------------------------------------- |
| 200       | matches      | null          | healthy                                              |
| 200       | null / other | —             | tag dropped in the redirect chain — earn nothing     |
| 200       | matches      | text          | product gone; link works, page does not              |
| 404 / 410 | —            | —             | dead link                                            |
| null      | —            | —             | `fetchError`: blocked, timed out, or host off-policy |

Budget check: 300 links hourly = 7 200 jobs/day on the key, or 300 with a
1 h cache and a page that re-renders freely. The **Agents** ledger shows
which one you are paying for.

## 6. Paste into the other repo's `CLAUDE.md` / `AGENTS.md`

```markdown
## thefleet (web data backend)

This app reads the web through **thefleet**, never directly. Client:
`lib/thefleet.ts` (copied from thefleet `integrations/`). Env: `THEFLEET_URL`,
`THEFLEET_KEY` (a `bk_` bot key — never commit it, never log it).

- Call **services** by slug (`fleet.call(slug, params)`); do not submit raw jobs
  unless no service fits, and never build URLs to the fleet by hand.
- Services in use: `affiliate-check` → `{url, finalUrl, status, title, tag,
unavailable, fetchError, jobId}`. Ask for a new one rather than
  parsing markdown here.
- The key is restricted on the fleet side (kinds, allowed hosts, daily quota).
  `scope_denied` / `host_denied` are policy, not bugs — surface them, do not
  work around them. `429` carries `retryAfterSec`; back off.
- 202 means the fleet is still working; the client re-asks with the same params.
  Never change params between retries and never add `fresh` on a retry.
- Replies carry `cached` and `asOf`; show `asOf` where freshness matters.
- Spend is metered per key: `fleet.usage()` for today's jobs and per-service calls.
```

## 7. Checklist

- [ ] key minted on **Agents** with `kinds`, `hostAllow`, `dailyJobs` set for _this_ app
- [ ] services imported/built on **Services**, tried with that key, output shape frozen
- [ ] client file copied, `THEFLEET_URL` / `THEFLEET_KEY` in the app's secrets
- [ ] the app branches on `code`, backs off on 429, never retries `host_denied`
- [ ] §6 block in the app's agent instructions, with its slugs and shapes filled in
- [ ] after a week: **Services** hit-rate ≥ what you expected, **Agents** ledger inside `dailyJobs`
