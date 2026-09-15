/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TFleetSearchEngine, TFleetSearchSession, TFleetWatch } from "@plane/types";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { describeFleetError } from "../json-view";
import { domainBreakdown, engineLabel, engineOverlap, keywordTerms, mergeResults } from "./search-utils";

type Props = {
  workspaceSlug: string;
  session: TFleetSearchSession;
  /** Guests cannot queue fleet jobs, so they are not offered rank tracking. */
  canSearch: boolean;
  onSuggestQuery: (query: string) => void;
};

const serpTarget = (engine: TFleetSearchEngine, query: string) => `${engine}:${query}`;

/** The rank a watch last reported, when the fleet sent one. */
const latestPosition = (watch: TFleetWatch): number | undefined => {
  const latest: unknown = watch.latest;
  if (!latest || typeof latest !== "object") return undefined;
  const position = (latest as { position?: unknown }).position;
  return typeof position === "number" ? position : undefined;
};

/** How long the slowest engine took, in seconds. */
const elapsedSeconds = (session: TFleetSearchSession): number | undefined => {
  const durations = session.runs
    .map((run) => run.durationMs)
    .filter((duration): duration is number => typeof duration === "number");
  if (durations.length) return Math.max(...durations) / 1000;
  const finishes = session.runs
    .map((run) => (run.finishedAt ? Date.parse(run.finishedAt) : Number.NaN))
    .filter((value) => !Number.isNaN(value));
  if (!finishes.length) return undefined;
  const startedAt = Date.parse(session.startedAt);
  if (Number.isNaN(startedAt)) return undefined;
  return Math.max(0, (Math.max(...finishes) - startedAt) / 1000);
};

function BriefCard(props: { title: string; children: React.ReactNode }) {
  const { title, children } = props;
  return (
    <section className="flex flex-col gap-2 rounded border border-subtle bg-surface-1 p-3">
      <h3 className="text-11 font-semibold tracking-wide text-tertiary uppercase">{title}</h3>
      {children}
    </section>
  );
}

const TrackRankRow = observer(function TrackRankRow(props: {
  workspaceSlug: string;
  engine: TFleetSearchEngine;
  query: string;
  canSearch: boolean;
}) {
  const { workspaceSlug, engine, query, canSearch } = props;
  // store hooks
  const { watches, createWatch } = useFleet();
  // states
  const [isCreating, setIsCreating] = useState(false);
  // derived values
  const target = serpTarget(engine, query);
  const existing = (watches[workspaceSlug] ?? []).find((watch) => watch.kind === "serp" && watch.target === target);
  const position = existing ? latestPosition(existing) : undefined;

  const handleTrack = async () => {
    setIsCreating(true);
    try {
      await createWatch(workspaceSlug, { kind: "serp", target });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: `Tracking "${query}" on ${engineLabel(engine)}.`,
      });
    } catch (error: unknown) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: describeFleetError(error, "Rank tracking could not be started."),
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-12 text-secondary">{engineLabel(engine)}</span>
      {existing ? (
        <span className="text-12 text-tertiary">{position === undefined ? "Tracking" : `Tracking · #${position}`}</span>
      ) : (
        canSearch && (
          <Button
            variant="secondary"
            size="sm"
            type="button"
            loading={isCreating}
            disabled={isCreating}
            onClick={handleTrack}
          >
            Track
          </Button>
        )
      )}
    </div>
  );
});

/** The sidebar that reads a finished search as a keyword brief. */
export const FleetSearchBrief = observer(function FleetSearchBrief(props: Props) {
  const { workspaceSlug, session, canSearch, onSuggestQuery } = props;
  // store hooks
  const { fetchWatches } = useFleet();
  // derived values
  // the runs array is patched in place, so its identity never changes; this fingerprint
  // is read on every render, which both keeps the observer subscribed and moves the memos on
  const runsKey = session.runs.map((run) => `${run.engine}:${run.status}:${run.results.length}`).join("|");
  // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- the fingerprint is the real dependency
  const merged = useMemo(() => mergeResults(session.runs), [runsKey]);
  const domains = useMemo(() => domainBreakdown(merged), [merged]);
  // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- the fingerprint is the real dependency
  const overlap = useMemo(() => engineOverlap(session.runs), [runsKey]);
  const terms = useMemo(() => keywordTerms(merged, session.params.query), [merged, session.params.query]);
  const elapsed = elapsedSeconds(session);
  const topDomainCount = domains[0]?.count ?? 1;

  // the brief shows which keywords are already tracked, so the watches have to be known
  useEffect(() => {
    fetchWatches(workspaceSlug).catch(() => undefined);
  }, [workspaceSlug, fetchWatches]);

  return (
    <aside className="flex w-full flex-col gap-3 lg:w-80 lg:flex-shrink-0">
      <BriefCard title="Keyword">
        <span className="text-13 font-medium break-words text-primary">{session.params.query}</span>
        <dl className="flex flex-col gap-1 text-12 text-secondary">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-tertiary">Engines</dt>
            <dd>{session.params.engines.map((engine) => engineLabel(engine)).join(", ")}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-tertiary">Unique results</dt>
            <dd>{merged.length}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-tertiary">Elapsed</dt>
            <dd>{elapsed === undefined ? "Running…" : `${elapsed.toFixed(1)} s`}</dd>
          </div>
        </dl>
      </BriefCard>
      <BriefCard title="Track rank">
        {session.runs.map((run) => (
          <TrackRankRow
            key={run.engine}
            workspaceSlug={workspaceSlug}
            engine={run.engine}
            query={session.params.query}
            canSearch={canSearch}
          />
        ))}
      </BriefCard>
      <BriefCard title="Top domains">
        {domains.length === 0 && <span className="text-12 text-tertiary">No results yet.</span>}
        {domains.map((domain) => (
          <div key={domain.domain} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2 text-12">
              <span className="truncate text-secondary">{domain.domain}</span>
              <span className="flex-shrink-0 text-tertiary">
                {domain.count} · best #{domain.best}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-layer-1">
              <div
                className="h-1.5 rounded-full bg-accent-primary"
                style={{ width: `${Math.round((domain.count / topDomainCount) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </BriefCard>
      <BriefCard title="Engine agreement">
        {overlap.pairs.length === 0 ? (
          <span className="text-12 text-tertiary">Run two engines to compare them.</span>
        ) : (
          <>
            {overlap.pairs.map((pair) => (
              <div key={`${pair.a}-${pair.b}`} className="flex items-center justify-between gap-2 text-12">
                <span className="text-secondary">
                  {engineLabel(pair.a)} · {engineLabel(pair.b)}
                </span>
                <span className="text-tertiary">{Math.round(pair.overlap * 100)}%</span>
              </div>
            ))}
            <span className="text-11 text-tertiary">{overlap.sharedByAll} URLs returned by every engine</span>
          </>
        )}
      </BriefCard>
      <BriefCard title="Related terms">
        {terms.length === 0 ? (
          <span className="text-12 text-tertiary">Not enough text to read yet.</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {terms.map((term) => (
              <button
                key={term.term}
                type="button"
                onClick={() => onSuggestQuery(`${session.params.query} ${term.term}`)}
                className="rounded-full border border-subtle px-2 py-0.5 text-11 text-secondary hover:text-primary"
              >
                {term.term}
                <span className="ml-1 text-tertiary">{term.count}</span>
              </button>
            ))}
          </div>
        )}
      </BriefCard>
    </aside>
  );
});
