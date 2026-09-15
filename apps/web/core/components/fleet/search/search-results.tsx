/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Activity, ChevronDown, ChevronRight, Eye } from "lucide-react";
// plane imports
import { Skeleton } from "@plane/propel/skeleton";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TFleetSearchRun, TFleetSearchRunStatus, TFleetSearchSession } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { describeFleetError } from "../json-view";
import type { TMergedSearchResult } from "./search-utils";
import { domainOf, engineLabel, mergeResults } from "./search-utils";

type Props = {
  workspaceSlug: string;
  session: TFleetSearchSession;
  /** Guests cannot queue fleet jobs, so they are not offered watches. */
  canSearch: boolean;
};

const isPending = (status: TFleetSearchRunStatus) => status === "queued" || status === "running";

/** Colour of the small dot in front of an engine tab. */
export const statusDotClass = (status: TFleetSearchRunStatus): string => {
  if (status === "done") return "bg-success-primary";
  if (status === "failed") return "bg-danger-primary";
  return "animate-pulse bg-warning-primary";
};

/** What the dot says, in words, for assistive tech and readers who cannot tell the colours apart. */
export const statusLabel = (status: TFleetSearchRunStatus): string => {
  if (status === "done") return "done";
  if (status === "failed") return "failed";
  return "running";
};

function ResultSkeleton() {
  return (
    <Skeleton className="flex flex-col gap-2 py-3" ariaLabel="Loading results">
      <Skeleton.Item height="12px" width="30%" />
      <Skeleton.Item height="16px" width="60%" />
      <Skeleton.Item height="12px" width="90%" />
    </Skeleton>
  );
}

function ResultCard(props: { workspaceSlug: string; result: TMergedSearchResult; canSearch: boolean }) {
  const { workspaceSlug, result, canSearch } = props;
  // store hooks
  const { createWatch } = useFleet();
  // states
  const [isExpanded, setIsExpanded] = useState(false);
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  // derived values
  const domain = domainOf(result.url);
  const initial = (domain.replace(/^[^a-z0-9]+/i, "")[0] ?? "?").toUpperCase();

  const handleWatch = async (kind: "uptime" | "monitor", label: string) => {
    setPendingKind(kind);
    try {
      await createWatch(workspaceSlug, { kind, target: result.url });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: `${label} added for ${domain}.` });
    } catch (error: unknown) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: describeFleetError(error, `${label} could not be added.`),
      });
    } finally {
      setPendingKind(null);
    }
  };

  return (
    <div className="group flex flex-col gap-1 border-b border-subtle py-3 last:border-b-0">
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-layer-1 text-11 font-medium text-secondary"
        >
          {initial}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-11 text-tertiary">{domain}</span>
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="text-13 font-medium text-primary hover:underline"
          >
            {result.title}
          </a>
        </div>
        {canSearch && (
          <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Tooltip tooltipContent="Watch uptime">
              <button
                type="button"
                aria-label={`Watch uptime for ${domain}`}
                disabled={pendingKind !== null}
                onClick={() => handleWatch("uptime", "Uptime watch")}
                className="rounded p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
              >
                <Activity className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip tooltipContent="Monitor page">
              <button
                type="button"
                aria-label={`Monitor ${domain} for changes`}
                disabled={pendingKind !== null}
                onClick={() => handleWatch("monitor", "Page monitor")}
                className="rounded p-1 text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
      {result.description && <p className="line-clamp-3 text-13 text-secondary">{result.description}</p>}
      <div className="flex flex-wrap items-center gap-1">
        {result.hits.map((hit) => (
          <span
            key={`${hit.engine}-${hit.position}`}
            className="rounded-full border border-subtle px-1.5 py-0.5 text-11 text-tertiary"
          >
            {engineLabel(hit.engine)} #{hit.position}
          </span>
        ))}
      </div>
      {result.content && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={isExpanded}
            className="flex w-fit items-center gap-1 text-11 text-tertiary hover:text-primary"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {isExpanded ? "Hide content" : "Expand content"}
          </button>
          {isExpanded && (
            <pre className="max-h-64 overflow-auto rounded border border-subtle bg-surface-1 p-2 text-11 whitespace-pre-wrap text-secondary">
              {result.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** Engine tabs plus the result list for whichever tab is open. */
export const FleetSearchResults = observer(function FleetSearchResults(props: Props) {
  const { workspaceSlug, session, canSearch } = props;
  // states
  const [selectedTab, setSelectedTab] = useState<string>("all");
  // derived values
  const runs = session.runs;
  const activeRun: TFleetSearchRun | undefined = runs.find((run) => run.engine === selectedTab);
  // the runs array is patched in place, so its identity never changes; this fingerprint
  // is read on every render, which both keeps the observer subscribed and moves the memo on
  const runsKey = runs.map((run) => `${run.engine}:${run.status}:${run.results.length}`).join("|");
  // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- the fingerprint is the real dependency
  const allMerged = useMemo(() => mergeResults(runs), [runsKey]);
  const merged = useMemo(() => (activeRun ? mergeResults([activeRun]) : allMerged), [activeRun, allMerged]);
  const isLoading = activeRun ? isPending(activeRun.status) : runs.some((run) => isPending(run.status));
  const tabs = [
    { key: "all", label: "All", count: allMerged.length, status: undefined },
    ...runs.map((run) => ({
      key: run.engine,
      label: engineLabel(run.engine),
      count: run.results.length,
      status: run.status,
    })),
  ];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map((tab) => {
          const selected = selectedTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-12",
                selected
                  ? "border-subtle bg-layer-1 font-medium text-primary"
                  : "border-transparent text-secondary hover:text-primary"
              )}
            >
              {tab.status && (
                <>
                  <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", statusDotClass(tab.status))} />
                  <span className="sr-only">{statusLabel(tab.status)}</span>
                </>
              )}
              {tab.label}
              <span className="text-tertiary">{tab.count}</span>
            </button>
          );
        })}
      </div>
      {activeRun?.status === "failed" && (
        <p className="rounded border border-subtle bg-surface-1 px-2 py-1.5 text-12 text-danger-primary">
          {activeRun.error ?? `${engineLabel(activeRun.engine)} failed.`}
        </p>
      )}
      {merged.length === 0 && isLoading && (
        <div className="flex flex-col gap-2">
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
        </div>
      )}
      {merged.length === 0 && !isLoading && <p className="text-13 text-tertiary">No results for this search.</p>}
      {merged.map((result) => (
        <ResultCard key={result.key} workspaceSlug={workspaceSlug} result={result} canSearch={canSearch} />
      ))}
    </div>
  );
});
