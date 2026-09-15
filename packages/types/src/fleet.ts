/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** The workspace's connection to thefleet, as the browser sees it. The key itself is never sent. */
export type TFleetSettings = {
  is_enabled: boolean;
  base_url: string;
  /** Last characters of the stored key, empty when none is set. */
  api_key_hint: string;
  has_key: boolean;
  updated_at: string | null;
};

export type TFleetSettingsPayload = Partial<{
  is_enabled: boolean;
  base_url: string;
  /** Empty string or null clears the stored key. */
  api_key: string | null;
}>;

/** Error body returned by the API for anything fleet-side. `code` follows the fleet's contract. */
export type TFleetError = {
  code?: string;
  error?: string;
  retryAfterSec?: number;
  quota?: Record<string, unknown>;
};

/** Fleet payloads are passed through untouched, so shapes stay loose. */
export type TFleetJson = Record<string, unknown>;

export type TFleetUsage = TFleetJson & {
  services?: Array<TFleetJson & { slug?: string }>;
};

export type TFleetServiceParam = {
  required?: boolean;
  default?: unknown;
  description?: string;
};

export type TFleetService = TFleetJson & {
  slug: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  cacheTtlSec?: number;
  params?: Record<string, TFleetServiceParam>;
};

export type TFleetServiceCallPayload = {
  params?: Record<string, unknown>;
  wait?: number;
  fresh?: boolean;
};

/** A service reply. `pending` is set client-side when the fleet answered 202. */
export type TFleetServiceCallResult = TFleetJson & {
  output?: unknown;
  cached?: boolean;
  asOf?: string;
  jobId?: string;
  pending?: boolean;
};

export type TFleetWatch = TFleetJson & {
  id?: string;
  kind?: string;
  target?: string;
};

export type TFleetCheck = TFleetJson & {
  watchId?: string;
  up?: boolean;
  httpStatus?: number;
  responseMs?: number;
  at?: string;
};

export type TFleetJobKind = "scrape" | "search" | "crawl" | "browse";

export type TFleetJobPayload = TFleetJson & {
  kind: TFleetJobKind;
};

export type TFleetJob = TFleetJson & {
  id?: string;
  kind?: string;
  status?: string;
  result?: unknown;
};

export type TFleetConnectionTest = {
  ok: boolean;
  usage: TFleetUsage;
};
