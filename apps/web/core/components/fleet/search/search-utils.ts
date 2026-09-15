/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFleetSearchEngine, TFleetSearchRun } from "@plane/types";

/** The engines a search session can run against, in the order they are offered. */
export const ENGINES: { key: TFleetSearchEngine; label: string }[] = [
  { key: "google", label: "Google" },
  { key: "bing", label: "Bing" },
  { key: "ddg", label: "DuckDuckGo" },
  { key: "yahoo", label: "Yahoo" },
];

export const engineLabel = (engine: TFleetSearchEngine): string =>
  ENGINES.find((option) => option.key === engine)?.label ?? engine;

/** A sorted copy. `Array#toSorted` is not in the TypeScript lib this app builds against yet. */
const sorted = <T>(items: T[], compare: (a: T, b: T) => number): T[] =>
  // oxlint-disable-next-line unicorn/no-array-sort -- the array is already a copy
  [...items].sort(compare);

/** One result as it looks after the same URL from several engines has been folded together. */
export type TMergedSearchResult = {
  key: string;
  url: string;
  title: string;
  description: string;
  content?: string;
  hits: { engine: TFleetSearchEngine; position: number }[];
};

/** A comparable form of a URL: lowercase host, no tracking parameters, no trailing slash. */
export const normalizeUrl = (raw: string): string => {
  const trimmed = (raw ?? "").trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.host = url.host.toLowerCase();
    const trackingKeys = [...url.searchParams.keys()].filter((key) => key.toLowerCase().startsWith("utm_"));
    trackingKeys.forEach((key) => url.searchParams.delete(key));
    const search = url.searchParams.toString();
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.host}${path}${search ? `?${search}` : ""}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
};

/** The hostname a result points at, without the `www.` prefix. */
export const domainOf = (raw: string): string => {
  const trimmed = (raw ?? "").trim();
  try {
    return new URL(trimmed).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split("/")[0] ?? trimmed;
  }
};

/** Fold every engine's results into one list, de-duplicated by normalized URL. */
export const mergeResults = (runs: TFleetSearchRun[]): TMergedSearchResult[] => {
  const merged = new Map<string, TMergedSearchResult>();
  runs.forEach((run) => {
    run.results.forEach((result) => {
      const key = normalizeUrl(result.url);
      const existing = merged.get(key);
      if (existing) {
        existing.hits.push({ engine: run.engine, position: result.position });
        if (!existing.description && result.description) existing.description = result.description;
        if (!existing.content && result.content) existing.content = result.content;
        return;
      }
      merged.set(key, {
        key,
        url: result.url,
        title: result.title || result.url,
        description: result.description ?? "",
        content: result.content,
        hits: [{ engine: run.engine, position: result.position }],
      });
    });
  });
  const entries = [...merged.values()];
  entries.forEach((entry) => {
    entry.hits = sorted(entry.hits, (a, b) => a.position - b.position);
  });
  return sorted(entries, (a, b) => {
    const bestA = Math.min(...a.hits.map((hit) => hit.position));
    const bestB = Math.min(...b.hits.map((hit) => hit.position));
    if (bestA !== bestB) return bestA - bestB;
    return b.hits.length - a.hits.length;
  });
};

/** The domains that appear most often across the merged results, best first. */
export const domainBreakdown = (merged: TMergedSearchResult[]): { domain: string; count: number; best: number }[] => {
  const byDomain = new Map<string, { domain: string; count: number; best: number }>();
  merged.forEach((entry) => {
    const domain = domainOf(entry.url);
    const best = Math.min(...entry.hits.map((hit) => hit.position));
    const existing = byDomain.get(domain);
    if (existing) {
      existing.count += 1;
      existing.best = Math.min(existing.best, best);
      return;
    }
    byDomain.set(domain, { domain, count: 1, best });
  });
  return sorted([...byDomain.values()], (a, b) => b.count - a.count || a.best - b.best).slice(0, 8);
};

export type TEngineOverlap = {
  pairs: { a: TFleetSearchEngine; b: TFleetSearchEngine; overlap: number }[];
  /** URLs every engine in the session returned. */
  sharedByAll: number;
};

/** How much the engines agreed: Jaccard overlap per pair, plus the results everyone returned. */
export const engineOverlap = (runs: TFleetSearchRun[]): TEngineOverlap => {
  const sets = runs.map((run) => ({
    engine: run.engine,
    urls: new Set(run.results.map((result) => normalizeUrl(result.url))),
  }));
  const pairs: TEngineOverlap["pairs"] = [];
  for (let index = 0; index < sets.length; index++) {
    for (let other = index + 1; other < sets.length; other++) {
      const first = sets[index];
      const second = sets[other];
      if (!first || !second) continue;
      const shared = [...first.urls].filter((url) => second.urls.has(url)).length;
      const union = new Set([...first.urls, ...second.urls]).size;
      pairs.push({ a: first.engine, b: second.engine, overlap: union === 0 ? 0 : shared / union });
    }
  }
  // every run counts, so an engine that came back empty leaves nothing shared by all
  const sharedByAll =
    sets.length > 1 ? [...(sets[0]?.urls ?? [])].filter((url) => sets.every((entry) => entry.urls.has(url))).length : 0;
  return { pairs, sharedByAll };
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "you",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "but",
  "not",
  "all",
  "can",
  "how",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "our",
  "out",
  "its",
  "their",
  "they",
  "them",
  "into",
  "about",
  "more",
  "most",
  "other",
  "than",
  "then",
  "there",
  "these",
  "those",
  "will",
  "would",
  "should",
  "could",
  "also",
  "any",
  "get",
  "one",
  "two",
  "new",
  "best",
  "top",
  "use",
  "used",
  "using",
  "may",
  "just",
  "over",
  "such",
  "some",
  "here",
  "help",
  "see",
  "via",
  "com",
  "www",
  "https",
  "http",
]);

/** The terms that repeat across titles and descriptions, minus stopwords and the query's own words. */
export const keywordTerms = (
  merged: TMergedSearchResult[],
  query: string
): { term: string; count: number; share: number }[] => {
  const queryWords = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
  );
  const counts = new Map<string, number>();
  let total = 0;
  merged.forEach((entry) => {
    `${entry.title} ${entry.description}`
      .toLowerCase()
      .split(/[^a-z]+/)
      .forEach((token) => {
        if (token.length < 3 || STOPWORDS.has(token) || queryWords.has(token)) return;
        counts.set(token, (counts.get(token) ?? 0) + 1);
        total += 1;
      });
  });
  const terms = [...counts.entries()].map(([term, count]) => ({
    term,
    count,
    share: total === 0 ? 0 : count / total,
  }));
  return sorted(terms, (a, b) => b.count - a.count || a.term.localeCompare(b.term)).slice(0, 12);
};
