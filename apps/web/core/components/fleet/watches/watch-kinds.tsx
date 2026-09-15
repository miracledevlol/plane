/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Activity, AtSign, Gem, Search, Tag, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
// plane imports
import type { TFleetCheck, TFleetWatch, TFleetWatchKind } from "@plane/types";
// local imports
import type { TFleetTone } from "../ui";

export type TSerpEngine = "google" | "bing" | "ddg" | "yahoo";

export const SERP_ENGINES: { key: TSerpEngine; label: string }[] = [
  { key: "google", label: "Google" },
  { key: "bing", label: "Bing" },
  { key: "ddg", label: "DuckDuckGo" },
  { key: "yahoo", label: "Yahoo" },
];

export const serpEngineLabel = (engine: string | null | undefined): string =>
  SERP_ENGINES.find((option) => option.key === engine)?.label ?? engine ?? "";

/** What a card or timeline row says about one check. */
export type TCheckSummary = {
  headline: string;
  detail?: string;
  tone: TFleetTone;
};

export type TWatchKindMeta = {
  kind: TFleetWatchKind;
  /** The operator-facing name: "Health check", "Follower check"... */
  label: string;
  /** A one-word name for chips. */
  short: string;
  description: string;
  icon: LucideIcon;
  tone: TFleetTone;
  targetLabel: string;
  targetPlaceholder: string;
  targetHint: string;
  /** Turns what the operator typed into the target the fleet expects. */
  normalize: (raw: string) => string;
  /** An error message, or null when the normalized target is acceptable. */
  validate: (target: string) => string | null;
  /** How the target reads on a card. */
  displayTarget: (watch: TFleetWatch) => string;
  summarize: (check: TFleetCheck | null | undefined) => TCheckSummary | null;
};

const URL_PATTERN = /^https?:\/\/[^\s/]+\.[^\s/]+/i;
const HANDLE_PATTERN = /^[a-z0-9_]{1,15}$/i;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

const requireUrl = (target: string) =>
  URL_PATTERN.test(target) ? null : "Enter a full URL, starting with http:// or https://.";

const formatNumber = (value: number | string | null | undefined): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(number)) return String(value);
  return new Intl.NumberFormat().format(number);
};

const compactNumber = (value: number | null | undefined): string | null => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
};

/** A failed check reads the same for every kind. */
const failure = (check: TFleetCheck): TCheckSummary | null => {
  if (check.ok === false) return { headline: "Check failed", detail: check.error ?? undefined, tone: "danger" };
  return null;
};

/** Splits `engine:keyword` into its halves. */
export const parseSerpTarget = (target: string): { engine: TSerpEngine | null; keyword: string } => {
  const separator = target.indexOf(":");
  if (separator <= 0) return { engine: null, keyword: target };
  const engine = target.slice(0, separator).trim().toLowerCase();
  const keyword = target.slice(separator + 1).trim();
  const known = SERP_ENGINES.find((option) => option.key === engine);
  return { engine: known ? known.key : null, keyword };
};

export const WATCH_KINDS: TWatchKindMeta[] = [
  {
    kind: "uptime",
    label: "Health check",
    short: "Uptime",
    description: "Pings a URL on a schedule and records whether it answered and how fast.",
    icon: Activity,
    tone: "success",
    targetLabel: "URL to ping",
    targetPlaceholder: "https://example.com/health",
    targetHint: "Any public http(s) URL. A 2xx or 3xx answer counts as up.",
    normalize: (raw) => raw.trim(),
    validate: requireUrl,
    displayTarget: (watch) => watch.url ?? watch.target ?? "",
    summarize: (check) => {
      if (!check) return null;
      const failed = failure(check);
      if (failed) return failed;
      if (check.up === false) {
        return {
          headline: "Down",
          detail: check.httpStatus ? `HTTP ${check.httpStatus}` : (check.error ?? undefined),
          tone: "danger",
        };
      }
      if (check.up === true) {
        const parts = [
          check.httpStatus ? `HTTP ${check.httpStatus}` : null,
          check.responseMs != null ? `${check.responseMs} ms` : null,
        ];
        return { headline: "Up", detail: parts.filter(Boolean).join(" · ") || undefined, tone: "success" };
      }
      return null;
    },
  },
  {
    kind: "xprofile",
    label: "Follower check",
    short: "X profile",
    description: "Tracks followers, following and post counts for an X (Twitter) account.",
    icon: AtSign,
    tone: "info",
    targetLabel: "Handle",
    targetPlaceholder: "elonmusk",
    targetHint: "The account name without the @.",
    normalize: (raw) =>
      raw
        .trim()
        .replace(/^@+/, "")
        .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
        .split(/[/?#]/)[0] ?? "",
    validate: (target) => (HANDLE_PATTERN.test(target) ? null : "Handles are 1 to 15 letters, numbers or underscores."),
    displayTarget: (watch) => `@${watch.target ?? ""}`,
    summarize: (check) => {
      if (!check) return null;
      const failed = failure(check);
      if (failed) return failed;
      const followers = formatNumber(check.followers);
      if (!followers) return null;
      const parts = [
        check.following != null ? `${formatNumber(check.following)} following` : null,
        check.posts != null ? `${formatNumber(check.posts)} posts` : null,
      ];
      return {
        headline: `${followers} followers`,
        detail: parts.filter(Boolean).join(" · ") || undefined,
        tone: "info",
      };
    },
  },
  {
    kind: "monitor",
    label: "Price monitor",
    short: "Price",
    description: "Reads the price off a product page each time it checks.",
    icon: Tag,
    tone: "warning",
    targetLabel: "Product URL",
    targetPlaceholder: "https://store.example.com/item/123",
    targetHint: "The page that shows the price you want to follow.",
    normalize: (raw) => raw.trim(),
    validate: requireUrl,
    displayTarget: (watch) => watch.url ?? watch.target ?? "",
    summarize: (check) => {
      if (!check) return null;
      const failed = failure(check);
      if (failed) return failed;
      if (!check.price) return null;
      return {
        headline: check.price,
        detail: check.priceSource ? `from ${check.priceSource}` : undefined,
        tone: "warning",
      };
    },
  },
  {
    kind: "nftfloor",
    label: "NFT floor",
    short: "Floor",
    description: "Follows an OpenSea collection's floor price, owners and volume.",
    icon: Gem,
    tone: "accent",
    targetLabel: "OpenSea collection slug",
    targetPlaceholder: "pudgypenguins",
    targetHint: "The last part of the collection's OpenSea URL.",
    normalize: (raw) =>
      raw
        .trim()
        .replace(/^https?:\/\/(www\.)?opensea\.io\/collection\//i, "")
        .split(/[/?#]/)[0] ?? "",
    validate: (target) => (SLUG_PATTERN.test(target) ? null : "Slugs use letters, numbers and dashes only."),
    displayTarget: (watch) => watch.target ?? "",
    summarize: (check) => {
      if (!check) return null;
      const failed = failure(check);
      if (failed) return failed;
      if (!check.floorPrice) return null;
      const parts = [
        check.owners != null ? `${formatNumber(check.owners)} owners` : null,
        check.volume != null ? `${formatNumber(check.volume)} ${check.floorSymbol ?? ""} volume`.trim() : null,
      ];
      return {
        headline: `Floor ${check.floorPrice} ${check.floorSymbol ?? ""}`.trim(),
        detail: parts.filter(Boolean).join(" · ") || undefined,
        tone: "accent",
      };
    },
  },
  {
    kind: "leaderboard",
    label: "Leaderboard",
    short: "Race",
    description: "Tracks a wager race or promo leaderboard: prize pool, players and standings.",
    icon: Trophy,
    tone: "warning",
    targetLabel: "Race id or promo URL",
    targetPlaceholder: "gamba:abc123 or https://promo.example.com/race",
    targetHint: "A Gamba race id is written as gamba:<raceId>. Anything else must be a full URL.",
    normalize: (raw) => {
      const trimmed = raw.trim();
      if (/^gamba:/i.test(trimmed)) return `gamba:${trimmed.slice(6).trim()}`;
      return trimmed;
    },
    validate: (target) => {
      if (/^gamba:/i.test(target)) return target.length > 6 ? null : "Add the race id after gamba:.";
      return requireUrl(target);
    },
    displayTarget: (watch) => watch.url ?? watch.target ?? "",
    summarize: (check) => {
      if (!check) return null;
      const failed = failure(check);
      if (failed) return failed;
      if (!check.raceName && !check.prizePool) return null;
      const pool = formatNumber(check.prizePool);
      const parts = [
        check.raceStatus ?? null,
        pool ? `${pool} ${check.currency ?? ""} pool`.trim() : null,
        check.players != null ? `${formatNumber(check.players)} players` : null,
      ];
      return {
        headline: check.raceName ?? "Race",
        detail: parts.filter(Boolean).join(" · ") || undefined,
        tone: check.raceStatus?.toLowerCase() === "ended" ? "neutral" : "warning",
      };
    },
  },
  {
    kind: "serp",
    label: "Search rank",
    short: "SERP",
    description: "Records where a keyword ranks on a search engine each time it checks.",
    icon: Search,
    tone: "accent",
    targetLabel: "Keyword",
    targetPlaceholder: "best project management tool",
    targetHint: "Pick the engine, then the phrase to look up.",
    normalize: (raw) => raw.trim(),
    validate: (target) => {
      const { engine, keyword } = parseSerpTarget(target);
      if (!engine) return "Pick a search engine.";
      if (!keyword) return "Enter a keyword.";
      return null;
    },
    displayTarget: (watch) => {
      const { engine, keyword } = parseSerpTarget(watch.target ?? "");
      return engine ? `${keyword} on ${serpEngineLabel(engine)}` : (watch.target ?? "");
    },
    summarize: (check) => {
      if (!check) return null;
      const failed = failure(check);
      if (failed) return failed;
      if (check.position == null) {
        return check.ok
          ? {
              headline: "Not ranked",
              detail: check.resultsTotal != null ? `${compactNumber(check.resultsTotal)} results` : undefined,
              tone: "neutral",
            }
          : null;
      }
      return {
        headline: `#${check.position}${check.engine ? ` on ${serpEngineLabel(check.engine)}` : ""}`,
        detail: check.resultsTotal != null ? `${compactNumber(check.resultsTotal)} results` : undefined,
        tone: check.position <= 3 ? "success" : check.position <= 10 ? "accent" : "neutral",
      };
    },
  },
];

const FALLBACK_KIND: TWatchKindMeta = {
  kind: "uptime",
  label: "Watch",
  short: "Watch",
  description: "",
  icon: Activity,
  tone: "neutral",
  targetLabel: "Target",
  targetPlaceholder: "",
  targetHint: "",
  normalize: (raw) => raw.trim(),
  validate: (target) => (target ? null : "Enter a target."),
  displayTarget: (watch) => watch.url ?? watch.target ?? "",
  summarize: (check) => (check ? failure(check) : null),
};

export const watchKindMeta = (kind: string | null | undefined): TWatchKindMeta =>
  WATCH_KINDS.find((meta) => meta.kind === kind) ?? {
    ...FALLBACK_KIND,
    short: kind ?? "Watch",
    label: kind ?? "Watch",
  };

/** The dot colour a watch card shows, and whether it should breathe. */
export const watchStatus = (watch: TFleetWatch): { tone: TFleetTone; live: boolean; label: string } => {
  if (watch.enabled === false) return { tone: "neutral", live: false, label: "Paused" };
  if (watch.checking) return { tone: "accent", live: true, label: "Checking" };
  if (watch.lastError || watch.latest?.ok === false) return { tone: "danger", live: false, label: "Failing" };
  if (watch.kind === "uptime" && watch.latest?.up === false) return { tone: "danger", live: false, label: "Down" };
  if (watch.latest) return { tone: "success", live: true, label: "Healthy" };
  return { tone: "neutral", live: false, label: "Waiting for first check" };
};
