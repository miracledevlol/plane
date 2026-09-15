# Agent Development Guide

## Commands

- `pnpm dev` - Start all dev servers (web:3000, admin:3001)
- `pnpm build` - Build all packages and apps
- `pnpm check` - Run all checks (format, lint, types)
- `pnpm check:lint` - OxLint across all packages
- `pnpm check:types` - TypeScript type checking
- `pnpm fix` - Auto-fix format and lint issues
- `pnpm turbo run <command> --filter=<package>` - Target specific package/app
- `pnpm --filter=@plane/ui storybook` - Start Storybook on port 6006

## Code Style

- **Imports**: Use `workspace:*` for internal packages, `catalog:` for external deps
- **TypeScript**: Strict mode enabled, all files must be typed
- **Formatting**: oxfmt, run `pnpm fix:format`
- **Linting**: OxLint with shared `.oxlintrc.json` config
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Error Handling**: Use try-catch with proper error types, log errors appropriately
- **State Management**: MobX stores in `packages/shared-state`, reactive patterns
- **Testing**: All features require unit tests, use existing test framework per package
- **Components**: Build in `@plane/ui` with Storybook for isolated development

## Backend tests (Docker)

The Django/pytest suite for `apps/api` runs in an isolated stack defined by `docker-compose-test.yml` at the repo root.

Prereq (once): `./setup.sh` — generates `apps/api/.env` from `.env.example`.

- Full suite: `docker compose -f docker-compose-test.yml up --build --abort-on-container-exit --exit-code-from api-tests`
- Subset: `docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit`
- Teardown: `docker compose -f docker-compose-test.yml down -v`

See `apps/api/tests/RUNNING_TESTS.md` for the full walkthrough and troubleshooting; see `apps/api/tests/TESTING_GUIDE.md` for test conventions and fixtures.

## thefleet (web data backend)

Workspaces can connect to **thefleet**, an external scrape/search/crawl
service, from the Fleet tab. `docs/thefleet-integration.md` is the fleet's
own integration guide. In this repo:

- The `bk_` bot key is stored encrypted per workspace
  (`WorkspaceFleetIntegration`) and only ever used server-side. The web app
  talks to `/api/workspaces/<slug>/fleet/...`, which proxies to the fleet with
  that key. Never send the key to the browser or log it.
- `plane/utils/thefleet.py` is the only place that builds fleet URLs. Fleet
  error codes (`scope_denied`, `host_denied`, `quota_*`, `job_failed`...) are
  passed through unchanged; they are policy, not bugs.
- A 202 from a service call means the fleet is still working; the web store
  re-posts the same params and never adds `fresh` on a retry.
