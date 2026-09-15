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
  // computed
  getSettings: (workspaceSlug: string) => TFleetSettings | undefined;
  isReady: (workspaceSlug: string) => boolean;
  getJobIds: (workspaceSlug: string) => string[];
  // actions
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
    });
    this.fleetService = new FleetService();
  }

  getSettings = computedFn((workspaceSlug: string) => this.settings[workspaceSlug]);

  isReady = computedFn((workspaceSlug: string) => {
    const current = this.settings[workspaceSlug];
    return Boolean(current?.is_enabled && (current?.has_key || current?.instance_key_available));
  });

  getJobIds = computedFn((workspaceSlug: string) => this.jobIdsByWorkspace[workspaceSlug] ?? []);

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
}
