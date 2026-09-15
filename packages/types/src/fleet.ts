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
  /** The instance has a default key, so enabling works without pasting one. */
  instance_key_available: boolean;
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

/** Every watch kind the fleet re-checks on its own clock. `target` is shaped per kind. */
export type TFleetWatchKind = "uptime" | "xprofile" | "monitor" | "nftfloor" | "leaderboard" | "serp";

/** One row of a leaderboard check. */
export type TFleetLeaderboardStanding = {
  position?: number;
  name?: string;
  wagered?: number | string;
  prize?: number | string;
  vip?: boolean;
};

/**
 * One check of a watch. The shape is shared by every kind; fields that do not
 * apply to a kind come back as `null`.
 */
export type TFleetCheck = TFleetJson & {
  /** Strictly increasing, so it doubles as the `sinceId` cursor. */
  id?: number | string;
  watchId?: number | string;
  ok?: boolean | null;
  error?: string | null;
  httpStatus?: number | null;
  checkedAt?: string;
  /** Older bodies used `at`; newer ones `checkedAt`. */
  at?: string;
  // xprofile
  followers?: number | null;
  following?: number | null;
  posts?: number | null;
  listed?: number | null;
  displayName?: string | null;
  bio?: string | null;
  lastPostAt?: string | null;
  statsSource?: string | null;
  // monitor (price is kept as the exact string the page showed)
  price?: string | null;
  priceSource?: string | null;
  // uptime
  up?: boolean | null;
  responseMs?: number | null;
  // nftfloor
  floorPrice?: string | null;
  floorSymbol?: string | null;
  owners?: number | null;
  volume?: string | number | null;
  // leaderboard
  raceName?: string | null;
  raceStatus?: string | null;
  sponsor?: string | null;
  currency?: string | null;
  prizePool?: string | number | null;
  wagered?: string | number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  players?: number | null;
  standings?: TFleetLeaderboardStanding[] | null;
  prizes?: Array<{ position?: number; amount?: string | number; percentage?: number }> | null;
  // serp
  engine?: string | null;
  keyword?: string | null;
  position?: number | null;
  resultsTotal?: number | null;
};

export type TFleetWatch = TFleetJson & {
  id?: number | string;
  kind?: TFleetWatchKind | string;
  target?: string;
  /** A clickable URL for the target, when the fleet can build one. */
  url?: string;
  /** Operator pause state. */
  enabled?: boolean;
  /** A re-check is in progress. */
  checking?: boolean;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  /** The newest successful check. */
  latest?: TFleetCheck | null;
};

/** Counters the fleet sends alongside `GET /watches`. */
export type TFleetWatchTotals = {
  watches?: number;
  xprofiles?: number;
  priceUrls?: number;
  uptimeUrls?: number;
  collections?: number;
  serpKeywords?: number;
  followers?: number;
  following?: number;
  posts?: number;
};

export type TFleetWatchSnapshot = {
  watches: TFleetWatch[];
  totals: TFleetWatchTotals;
  asOf?: string;
};

/** Body of `POST /watches`. A 200 means the watch was already attached to this key. */
export type TFleetWatchPayload = {
  kind: TFleetWatchKind;
  target: string;
};

export type TFleetJobKind = "scrape" | "search" | "crawl" | "browse";

/** `queued` and `running` are open; every other status is terminal. */
export type TFleetJobStatus = "queued" | "running" | "done" | "failed" | "cancelled" | "expired";

export type TFleetJob = TFleetJson & {
  id?: string;
  kind?: string;
  status?: string;
  input?: TFleetJson;
  result?: unknown;
  error?: string | TFleetJson;
  pages?: number;
  resultBytes?: number;
  durationMs?: number;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  expiresAt?: string;
};

/** Body of `POST /jobs`. `wait` is the seconds (0-60) the fleet holds the request open. */
export type TFleetJobPayload = {
  kind: TFleetJobKind;
  input: TFleetJson;
  wait?: number;
};

/** The fleet runs one engine per search job, so a multi-engine search is one job each. */
export type TFleetSearchEngine = "google" | "bing" | "ddg" | "yahoo";

export type TFleetSearchResult = {
  position: number;
  title: string;
  url: string;
  description: string;
  content?: string;
};

export type TFleetSearchParams = {
  query: string;
  engines: TFleetSearchEngine[];
  limit: number;
  fetchContent: boolean;
};

export type TFleetSearchRunStatus = "queued" | "running" | "done" | "failed";

/** One engine's job inside a search session. */
export type TFleetSearchRun = {
  engine: TFleetSearchEngine;
  jobId?: string;
  status: TFleetSearchRunStatus;
  results: TFleetSearchResult[];
  error?: string;
  durationMs?: number;
  finishedAt?: string;
};

/** One search the operator ran, with a run per engine. */
export type TFleetSearchSession = {
  id: string;
  workspaceSlug: string;
  params: TFleetSearchParams;
  startedAt: string;
  runs: TFleetSearchRun[];
};

export type TFleetConnectionTest = {
  ok: boolean;
  usage: TFleetUsage;
};
