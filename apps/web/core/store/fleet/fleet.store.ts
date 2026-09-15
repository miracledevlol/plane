/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type {
  TFleetCheck,
  TFleetConnectionTest,
  TFleetJob,
  TFleetJobPayload,
  TFleetJson,
  TFleetSearchEngine,
  TFleetSearchParams,
  TFleetSearchResult,
  TFleetSearchRun,
  TFleetSearchRunStatus,
  TFleetSearchSession,
  TFleetService,
  TFleetServiceCallPayload,
  TFleetServiceCallResult,
  TFleetSettings,
  TFleetSettingsPayload,
  TFleetUsage,
  TFleetWatch,
  TLoader,
} from "@plane/types";
import { FleetService } from "@/services/fleet.service";

/** Longest the store keeps re-asking the fleet for a parked (202) service call. */
const CALL_TIMEOUT_MS = 180_000;
/**
 * Seconds the fleet holds a search job open before answering 202. Kept short on
 * purpose: the API worker handling the call is pinned for the whole wait, and one
 * search fans out to a job per engine, so a long wait ties up four workers at once.
 */
const SEARCH_JOB_WAIT_SEC = 8;
/** How often an open search job is re-read. */
const SEARCH_POLL_INTERVAL_MS = 2500;
/** Polls a single engine may attempt before the run is failed: 120 × 2500 ms is five minutes of polling. */
const SEARCH_MAX_POLLS = 120;
/** Consecutive read failures a run tolerates before it gives up; a good read clears the count. */
const SEARCH_MAX_POLL_FAILURES = 3;
/** Search sessions kept per workspace; older ones are dropped. */
const MAX_SEARCH_SESSIONS = 30;
/** The fleet caps a search at fifty results per engine. */
const SEARCH_LIMIT_MIN = 1;
const SEARCH_LIMIT_MAX = 50;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/** Ids only need to be unique in this tab; `randomUUID` is missing on insecure origins. */
const newSessionId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `search-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

/** One readable line for whatever the fleet put in `job.error`. */
const describeJobError = (error: unknown, fallback: string): string => {
  if (typeof error === "string" && error !== "") return error;
  if (isRecord(error)) {
    for (const key of ["message", "error", "code"]) {
      const value = error[key];
      if (typeof value === "string" && value !== "") return value;
    }
  }
  return fallback;
};

/** One readable line for an error body thrown by the service (`{ code, error, retryAfterSec }`). */
const describeThrown = (error: unknown, fallback: string): string => {
  const data = isRecord(error) ? error : {};
  const parts = [data.code, data.error].filter((part): part is string => typeof part === "string" && part !== "");
  let message = parts.length ? parts.join(": ") : fallback;
  if (typeof data.retryAfterSec === "number") message += ` (retry in ${data.retryAfterSec} s)`;
  return message;
};

/**
 * Whether a result link may be rendered. Fleet output ends up in an `href`, so
 * anything that is not plain http(s) — a `javascript:` URL above all — is dropped.
 */
const isHttpUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/** Read `job.result.results` defensively; the fleet owns the shape and it may change. */
const parseSearchResults = (result: unknown): TFleetSearchResult[] => {
  const rows = isRecord(result) ? result.results : undefined;
  if (!Array.isArray(rows)) return [];
  return rows.filter(isRecord).reduce<TFleetSearchResult[]>((acc, row) => {
    const url = asString(row.url);
    if (!url || !isHttpUrl(url)) return acc;
    const position = Number(row.position);
    acc.push({
      position: Number.isFinite(position) ? position : acc.length + 1,
      title: asString(row.title),
      url,
      description: asString(row.description),
      ...(typeof row.content === "string" ? { content: row.content } : {}),
    });
    return acc;
  }, []);
};

/** The run status for a job the fleet is still working on, or nothing once it has settled. */
const toOpenRunStatus = (status: unknown): TFleetSearchRunStatus | undefined => {
  const value = asString(status).toLowerCase();
  if (value === "queued") return "queued";
  if (value === "running") return "running";
  return undefined;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export interface IFleetStore {
  // observables
  settingsLoader: Record<string, TLoader>; // workspaceSlug -> loader
  settings: Record<string, TFleetSettings>; // workspaceSlug -> settings
  usage: Record<string, TFleetUsage>; // workspaceSlug -> usage
  services: Record<string, TFleetService[]>; // workspaceSlug -> services
  servicesLoader: Record<string, TLoader>;
  watches: Record<string, TFleetWatch[]>; // workspaceSlug -> watches
  checks: Record<string, TFleetCheck[]>; // workspaceSlug -> newest checks
  jobs: Record<string, TFleetJob>; // jobId -> job
  jobIdsByWorkspace: Record<string, string[]>; // workspaceSlug -> jobIds, newest first
  searchSessions: Record<string, TFleetSearchSession>; // sessionId -> session
  searchSessionIdsByWorkspace: Record<string, string[]>; // workspaceSlug -> sessionIds, newest first
  activeSearchSessionId: Record<string, string>; // workspaceSlug -> sessionId
  // computed
  getSettings: (workspaceSlug: string) => TFleetSettings | undefined;
  isReady: (workspaceSlug: string) => boolean;
  getJobIds: (workspaceSlug: string) => string[];
  getSearchSessions: (workspaceSlug: string) => TFleetSearchSession[];
  getActiveSearchSession: (workspaceSlug: string) => TFleetSearchSession | undefined;
  // actions
  setActiveSearchSession: (workspaceSlug: string, sessionId: string) => void;
  fetchSettings: (workspaceSlug: string) => Promise<TFleetSettings>;
  updateSettings: (workspaceSlug: string, payload: TFleetSettingsPayload) => Promise<TFleetSettings>;
  testConnection: (workspaceSlug: string) => Promise<TFleetConnectionTest>;
  fetchUsage: (workspaceSlug: string) => Promise<TFleetUsage>;
  fetchServices: (workspaceSlug: string) => Promise<TFleetService[]>;
  callService: (
    workspaceSlug: string,
    serviceSlug: string,
    payload: TFleetServiceCallPayload
  ) => Promise<TFleetServiceCallResult>;
  fetchWatches: (workspaceSlug: string) => Promise<TFleetWatch[]>;
  createWatch: (workspaceSlug: string, payload: TFleetJson) => Promise<TFleetWatch>;
  fetchChecks: (workspaceSlug: string, query?: Record<string, string>) => Promise<TFleetCheck[]>;
  createJob: (workspaceSlug: string, payload: TFleetJobPayload) => Promise<TFleetJob>;
  fetchJob: (workspaceSlug: string, jobId: string) => Promise<TFleetJob>;
  runSearch: (workspaceSlug: string, params: TFleetSearchParams) => Promise<string>;
  cancelSearch: (workspaceSlug: string, sessionId: string) => void;
}

export class FleetStore implements IFleetStore {
  settingsLoader: Record<string, TLoader> = {};
  settings: Record<string, TFleetSettings> = {};
  usage: Record<string, TFleetUsage> = {};
  services: Record<string, TFleetService[]> = {};
  servicesLoader: Record<string, TLoader> = {};
  watches: Record<string, TFleetWatch[]> = {};
  checks: Record<string, TFleetCheck[]> = {};
  jobs: Record<string, TFleetJob> = {};
  jobIdsByWorkspace: Record<string, string[]> = {};
  searchSessions: Record<string, TFleetSearchSession> = {};
  searchSessionIdsByWorkspace: Record<string, string[]> = {};
  activeSearchSessionId: Record<string, string> = {};

  /**
   * Sessions whose polling loops must stop. Cancelling is control state rather
   * than something the panel renders, so it stays outside the observables. Ids
   * are kept after the session itself is gone: a loop may still be mid-request.
   */
  private cancelledSearchSessionIds = new Set<string>();

  // services
  fleetService;

  constructor() {
    makeObservable(this, {
      settingsLoader: observable,
      settings: observable,
      usage: observable,
      services: observable,
      servicesLoader: observable,
      watches: observable,
      checks: observable,
      jobs: observable,
      jobIdsByWorkspace: observable,
      searchSessions: observable,
      searchSessionIdsByWorkspace: observable,
      activeSearchSessionId: observable,
      fetchSettings: action,
      updateSettings: action,
      testConnection: action,
      fetchUsage: action,
      fetchServices: action,
      callService: action,
      fetchWatches: action,
      createWatch: action,
      fetchChecks: action,
      createJob: action,
      fetchJob: action,
      setActiveSearchSession: action,
      runSearch: action,
      cancelSearch: action,
    });
    this.fleetService = new FleetService();
  }

  getSettings = computedFn((workspaceSlug: string) => this.settings[workspaceSlug]);

  isReady = computedFn((workspaceSlug: string) => {
    const current = this.settings[workspaceSlug];
    return Boolean(current?.is_enabled && (current?.has_key || current?.instance_key_available));
  });

  getJobIds = computedFn((workspaceSlug: string) => this.jobIdsByWorkspace[workspaceSlug] ?? []);

  getSearchSessions = computedFn((workspaceSlug: string) =>
    (this.searchSessionIdsByWorkspace[workspaceSlug] ?? [])
      .map((sessionId) => this.searchSessions[sessionId])
      .filter((session): session is TFleetSearchSession => Boolean(session))
  );

  getActiveSearchSession = computedFn((workspaceSlug: string) => {
    const sessionId = this.activeSearchSessionId[workspaceSlug];
    return sessionId ? this.searchSessions[sessionId] : undefined;
  });

  fetchSettings = async (workspaceSlug: string) => {
    const loader: TLoader = this.settings[workspaceSlug] ? "mutation" : "init-loader";
    runInAction(() => set(this.settingsLoader, [workspaceSlug], loader));
    try {
      const response = await this.fleetService.getSettings(workspaceSlug);
      runInAction(() => {
        set(this.settings, [workspaceSlug], response);
        set(this.settingsLoader, [workspaceSlug], "loaded");
      });
      return response;
    } catch (error) {
      runInAction(() => set(this.settingsLoader, [workspaceSlug], "loaded"));
      throw error;
    }
  };

  updateSettings = async (workspaceSlug: string, payload: TFleetSettingsPayload) => {
    const response = await this.fleetService.updateSettings(workspaceSlug, payload);
    runInAction(() => set(this.settings, [workspaceSlug], response));
    return response;
  };

  testConnection = async (workspaceSlug: string) => {
    const response = await this.fleetService.testConnection(workspaceSlug);
    runInAction(() => set(this.usage, [workspaceSlug], response.usage));
    return response;
  };

  fetchUsage = async (workspaceSlug: string) => {
    const response = await this.fleetService.getUsage(workspaceSlug);
    runInAction(() => set(this.usage, [workspaceSlug], response));
    return response;
  };

  fetchServices = async (workspaceSlug: string) => {
    runInAction(() =>
      set(this.servicesLoader, [workspaceSlug], this.services[workspaceSlug] ? "mutation" : "init-loader")
    );
    try {
      const response = await this.fleetService.getServices(workspaceSlug);
      runInAction(() => {
        set(this.services, [workspaceSlug], response);
        set(this.servicesLoader, [workspaceSlug], "loaded");
      });
      return response;
    } catch (error) {
      runInAction(() => set(this.servicesLoader, [workspaceSlug], "loaded"));
      throw error;
    }
  };

  /**
   * Call a service and resume while the fleet answers 202. Retries always
   * re-send the same params and never `fresh`, so a parked call is resumed
   * rather than restarted.
   */
  callService = async (workspaceSlug: string, serviceSlug: string, payload: TFleetServiceCallPayload) => {
    const startedAt = Date.now();
    let result = await this.fleetService.callService(workspaceSlug, serviceSlug, payload);
    const resume: TFleetServiceCallPayload = { params: payload.params, wait: payload.wait };
    while (result.pending && Date.now() - startedAt < CALL_TIMEOUT_MS) {
      // oxlint-disable-next-line no-await-in-loop -- each resume must wait for the previous 202
      result = await this.fleetService.callService(workspaceSlug, serviceSlug, resume);
    }
    if (result.pending) throw { code: "timeout", error: "The fleet is still working. Call again later." };
    return result;
  };

  fetchWatches = async (workspaceSlug: string) => {
    const response = await this.fleetService.getWatches(workspaceSlug);
    runInAction(() => set(this.watches, [workspaceSlug], response));
    return response;
  };

  createWatch = async (workspaceSlug: string, payload: TFleetJson) => {
    const response = await this.fleetService.createWatch(workspaceSlug, payload);
    runInAction(() => set(this.watches, [workspaceSlug], [response, ...(this.watches[workspaceSlug] ?? [])]));
    return response;
  };

  fetchChecks = async (workspaceSlug: string, query?: Record<string, string>) => {
    const response = await this.fleetService.getChecks(workspaceSlug, query);
    runInAction(() => set(this.checks, [workspaceSlug], response));
    return response;
  };

  createJob = async (workspaceSlug: string, payload: TFleetJobPayload) => {
    const response = await this.fleetService.createJob(workspaceSlug, payload);
    const jobId = typeof response.id === "string" ? response.id : undefined;
    if (jobId) {
      runInAction(() => {
        set(this.jobs, [jobId], response);
        set(this.jobIdsByWorkspace, [workspaceSlug], [jobId, ...this.getJobIds(workspaceSlug)]);
      });
    }
    return response;
  };

  fetchJob = async (workspaceSlug: string, jobId: string) => {
    const response = await this.fleetService.getJob(workspaceSlug, jobId);
    runInAction(() => set(this.jobs, [jobId], response));
    return response;
  };

  setActiveSearchSession = (workspaceSlug: string, sessionId: string) => {
    runInAction(() => set(this.activeSearchSessionId, [workspaceSlug], sessionId));
  };

  /**
   * Run one search across every engine the operator picked. The session is
   * registered before the first request so the panel can render its engines as
   * queued, then each engine's job runs on its own and patches its run in
   * place. A single engine never fails the whole search.
   */
  runSearch = async (workspaceSlug: string, params: TFleetSearchParams) => {
    const query = params.query.trim();
    const engines = params.engines.filter((engine, index, all) => all.indexOf(engine) === index);
    const limit = Math.min(SEARCH_LIMIT_MAX, Math.max(SEARCH_LIMIT_MIN, Math.trunc(params.limit) || SEARCH_LIMIT_MIN));
    const session: TFleetSearchSession = {
      id: newSessionId(),
      workspaceSlug,
      params: { query, engines, limit, fetchContent: params.fetchContent },
      startedAt: new Date().toISOString(),
      runs: engines.map((engine) => ({ engine, status: "queued", results: [] })),
    };
    runInAction(() => {
      set(this.searchSessions, [session.id], session);
      const sessionIds = [session.id, ...(this.searchSessionIdsByWorkspace[workspaceSlug] ?? [])];
      set(this.searchSessionIdsByWorkspace, [workspaceSlug], this.evictSearchSessions(sessionIds, session.id));
      set(this.activeSearchSessionId, [workspaceSlug], session.id);
    });
    await Promise.allSettled(
      engines.map((engine) => this.runSearchEngine(workspaceSlug, session.id, engine, session.params))
    );
    return session.id;
  };

  /**
   * Stop a session's polling loops and fail whatever it still had open. The runs
   * that already settled keep their results.
   */
  cancelSearch = (workspaceSlug: string, sessionId: string) => {
    const session = this.searchSessions[sessionId];
    if (!session || session.workspaceSlug !== workspaceSlug) return;
    this.cancelledSearchSessionIds.add(sessionId);
    runInAction(() => {
      session.runs.forEach((run, index) => {
        if (run.status !== "queued" && run.status !== "running") return;
        session.runs[index] = { ...run, status: "failed", error: "Cancelled." };
      });
    });
  };

  /**
   * Trim the session list down to the cap, oldest first, keeping the session the
   * operator is looking at however old it is. A dropped session's loops are
   * cancelled so they stop polling for runs nothing can render any more.
   */
  private evictSearchSessions = (sessionIds: string[], activeSessionId: string): string[] => {
    const kept = [...sessionIds];
    runInAction(() => {
      while (kept.length > MAX_SEARCH_SESSIONS) {
        let index = kept.length - 1;
        while (index >= 0 && kept[index] === activeSessionId) index -= 1;
        if (index < 0) break;
        const [droppedId] = kept.splice(index, 1);
        this.cancelledSearchSessionIds.add(droppedId);
        delete this.searchSessions[droppedId];
      }
    });
    return kept;
  };

  /** Whether a session's loops were told to stop, either by the operator or by eviction. */
  private isSearchCancelled = (sessionId: string): boolean => this.cancelledSearchSessionIds.has(sessionId);

  /** Patch one engine's run so the panel re-renders as that engine settles. */
  private updateSearchRun = (sessionId: string, engine: TFleetSearchEngine, patch: Partial<TFleetSearchRun>) => {
    runInAction(() => {
      const session = this.searchSessions[sessionId];
      if (!session) return;
      const index = session.runs.findIndex((run) => run.engine === engine);
      if (index < 0) return;
      session.runs[index] = { ...session.runs[index], ...patch };
    });
  };

  /** Write a settled job onto its run: results when it is done, an error otherwise. */
  private finishSearchRun = (sessionId: string, engine: TFleetSearchEngine, job: TFleetJob) => {
    const status = asString(job.status).toLowerCase();
    const patch: Partial<TFleetSearchRun> = {
      durationMs: typeof job.durationMs === "number" ? job.durationMs : undefined,
      finishedAt: typeof job.finishedAt === "string" ? job.finishedAt : new Date().toISOString(),
    };
    if (status === "done") {
      this.updateSearchRun(sessionId, engine, { ...patch, status: "done", results: parseSearchResults(job.result) });
      return;
    }
    this.updateSearchRun(sessionId, engine, {
      ...patch,
      status: "failed",
      error: describeJobError(job.error, `Job ${status || "failed"}.`),
    });
  };

  /**
   * Queue one engine's job and follow it until the fleet settles it. The loop
   * gives up after a fixed number of reads rather than after a wall-clock
   * deadline, so a tab left in the background is still followed once it comes
   * back. A cancelled session stops the loop wherever it happens to be.
   */
  private runSearchEngine = async (
    workspaceSlug: string,
    sessionId: string,
    engine: TFleetSearchEngine,
    params: TFleetSearchParams
  ) => {
    if (this.isSearchCancelled(sessionId)) return;
    try {
      let job = await this.createJob(workspaceSlug, {
        kind: "search",
        input: { query: params.query, engine, limit: params.limit, fetchContent: params.fetchContent },
        wait: SEARCH_JOB_WAIT_SEC,
      });
      if (this.isSearchCancelled(sessionId)) return;
      const jobId = typeof job.id === "string" ? job.id : undefined;
      const openStatus = toOpenRunStatus(job.status);
      this.updateSearchRun(sessionId, engine, openStatus ? { jobId, status: openStatus } : { jobId });
      let polls = 0;
      let failures = 0;
      while (toOpenRunStatus(job.status)) {
        if (this.isSearchCancelled(sessionId)) return;
        if (!jobId) {
          this.updateSearchRun(sessionId, engine, {
            status: "failed",
            error: "The fleet did not return a job id.",
          });
          return;
        }
        if (polls >= SEARCH_MAX_POLLS) {
          this.updateSearchRun(sessionId, engine, {
            status: "failed",
            error: "Timed out waiting for the fleet.",
          });
          return;
        }
        // oxlint-disable-next-line no-await-in-loop -- the job is read once per tick, in order
        await sleep(SEARCH_POLL_INTERVAL_MS);
        if (this.isSearchCancelled(sessionId)) return;
        // a hidden tab is throttled anyway, so skip the tick rather than queue requests; a
        // skipped tick costs no attempt, which is what keeps the deadline about polling
        if (typeof document !== "undefined" && document.hidden) continue;
        polls += 1;
        try {
          // oxlint-disable-next-line no-await-in-loop -- each read must follow the previous one
          job = await this.fetchJob(workspaceSlug, jobId);
          failures = 0;
        } catch (error) {
          if (this.isSearchCancelled(sessionId)) return;
          failures += 1;
          // a single failed read is usually the network blinking; only a run of them is fatal
          if (failures >= SEARCH_MAX_POLL_FAILURES) throw error;
          continue;
        }
        if (this.isSearchCancelled(sessionId)) return;
        const nextStatus = toOpenRunStatus(job.status);
        if (nextStatus) this.updateSearchRun(sessionId, engine, { status: nextStatus });
      }
      if (this.isSearchCancelled(sessionId)) return;
      this.finishSearchRun(sessionId, engine, job);
    } catch (error) {
      if (this.isSearchCancelled(sessionId)) return;
      this.updateSearchRun(sessionId, engine, {
        status: "failed",
        error: describeThrown(error, "The search job could not be run."),
      });
    }
  };
}
