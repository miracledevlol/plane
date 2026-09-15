/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// helpers
import { API_BASE_URL } from "@plane/constants";
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
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

const baseUrl = (workspaceSlug: string) => `/api/workspaces/${workspaceSlug}/fleet`;

/** The fleet answers list endpoints either as a bare array or as `{ items | data | results }`. */
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";

const asList = <T>(body: unknown): T[] => {
  if (Array.isArray(body)) return body.filter(isRecord) as T[];
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["items", "data", "results", "services", "watches", "checks"]) {
      const value = record[key];
      if (Array.isArray(value)) return value.filter(isRecord) as T[];
    }
  }
  return [];
};

export class FleetService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getSettings(workspaceSlug: string): Promise<TFleetSettings> {
    return this.get(`${baseUrl(workspaceSlug)}/settings/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async updateSettings(workspaceSlug: string, payload: TFleetSettingsPayload): Promise<TFleetSettings> {
    return this.patch(`${baseUrl(workspaceSlug)}/settings/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async testConnection(workspaceSlug: string): Promise<TFleetConnectionTest> {
    return this.post(`${baseUrl(workspaceSlug)}/test/`, {})
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getUsage(workspaceSlug: string): Promise<TFleetUsage> {
    return this.get(`${baseUrl(workspaceSlug)}/usage/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getServices(workspaceSlug: string): Promise<TFleetService[]> {
    return this.get(`${baseUrl(workspaceSlug)}/services/`)
      .then((res) => asList<TFleetService>(res?.data))
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  /** One call. A 202 from the fleet comes back with `pending: true`; re-call with the same params to resume. */
  async callService(
    workspaceSlug: string,
    serviceSlug: string,
    payload: TFleetServiceCallPayload
  ): Promise<TFleetServiceCallResult> {
    return this.post(`${baseUrl(workspaceSlug)}/services/${serviceSlug}/call/`, payload)
      .then((res) => ({ ...(res?.data as TFleetJson), pending: res?.status === 202 }))
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getWatches(workspaceSlug: string): Promise<TFleetWatch[]> {
    return this.get(`${baseUrl(workspaceSlug)}/watches/`)
      .then((res) => asList<TFleetWatch>(res?.data))
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createWatch(workspaceSlug: string, payload: TFleetJson): Promise<TFleetWatch> {
    return this.post(`${baseUrl(workspaceSlug)}/watches/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getChecks(workspaceSlug: string, query?: Record<string, string>): Promise<TFleetCheck[]> {
    return this.get(`${baseUrl(workspaceSlug)}/checks/`, { params: query })
      .then((res) => asList<TFleetCheck>(res?.data))
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createJob(workspaceSlug: string, payload: TFleetJobPayload): Promise<TFleetJob> {
    return this.post(`${baseUrl(workspaceSlug)}/jobs/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getJob(workspaceSlug: string, jobId: string): Promise<TFleetJob> {
    return this.get(`${baseUrl(workspaceSlug)}/jobs/${jobId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
