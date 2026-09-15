/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { ExternalLink, RefreshCw } from "lucide-react";
// plane imports
import type { TFleetCheck, TFleetWatch } from "@plane/types";
import { calculateTimeAgo, cn } from "@plane/utils";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { describeFleetError } from "../json-view";
import { FleetButton, FleetChip, FleetPulse, FleetSheet, FleetStagger, FleetStaggerItem } from "../ui";
import { watchKindMeta, watchStatus } from "./watch-kinds";

type Props = {
  workspaceSlug: string;
  watch: TFleetWatch | null;
  onClose: () => void;
};

const checkKey = (check: TFleetCheck) => `${check.id ?? ""}:${check.checkedAt ?? check.at ?? ""}`;

/** The standings block a leaderboard check carries, when it has one. */
function Standings(props: { check: TFleetCheck }) {
  const { check } = props;
  const rows = (check.standings ?? []).slice(0, 5);
  if (!rows.length) return null;
  return (
    <ol className="mt-2 flex flex-col gap-1 border-t border-subtle pt-2">
      {rows.map((row, index) => (
        <li key={`${row.position ?? ""}-${row.name ?? ""}`} className="flex items-center gap-2 text-11">
          <span className="w-5 text-right text-tertiary tabular-nums">{row.position ?? index + 1}.</span>
          <span className="min-w-0 flex-1 truncate text-primary">{row.name ?? "–"}</span>
          {row.wagered != null && <span className="text-secondary tabular-nums">{String(row.wagered)}</span>}
          {row.prize != null && <span className="text-success-primary tabular-nums">{String(row.prize)}</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * A side sheet with the newest checks for one watch. Loads on open and can be
 * refreshed; the summary line per check comes from the kind catalogue.
 */
export const FleetCheckTimeline = observer(function FleetCheckTimeline(props: Props) {
  const { workspaceSlug, watch, onClose } = props;
  // store hooks
  const { checksByWatch, fetchWatchChecks } = useFleet();
  // states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // derived values
  const watchId = watch?.id !== undefined ? String(watch.id) : null;
  // read straight from the store: the observer re-renders when this slot changes
  const checks: TFleetCheck[] = watchId ? (checksByWatch[workspaceSlug]?.[watchId] ?? []) : [];
  const meta = watch ? watchKindMeta(watch.kind) : null;
  const status = watch ? watchStatus(watch) : null;

  const load = async () => {
    if (!watchId) return;
    setLoading(true);
    setError(null);
    try {
      await fetchWatchChecks(workspaceSlug, watchId);
    } catch (fetchError) {
      setError(describeFleetError(fetchError, "Checks could not be loaded."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!watchId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWatchChecks(workspaceSlug, watchId)
      .catch((fetchError: unknown) => {
        if (!cancelled) setError(describeFleetError(fetchError, "Checks could not be loaded."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, watchId, fetchWatchChecks]);

  const Icon = meta?.icon;

  return (
    <FleetSheet
      open={Boolean(watch)}
      onClose={onClose}
      side="right"
      size="md"
      title={
        <span className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-secondary" />}
          <span className="truncate">{watch && meta ? meta.displayTarget(watch) : "Watch"}</span>
        </span>
      }
      description={meta?.label}
      footer={
        <>
          {watch?.url && (
            <FleetButton
              variant="ghost"
              size="sm"
              icon={<ExternalLink />}
              onClick={() => window.open(watch.url, "_blank", "noopener,noreferrer")}
            >
              Open target
            </FleetButton>
          )}
          <FleetButton variant="secondary" size="sm" icon={<RefreshCw />} loading={loading} onClick={load}>
            Refresh
          </FleetButton>
        </>
      }
    >
      {watch && meta && status && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <FleetChip tone={status.tone} icon={<FleetPulse tone={status.tone} live={status.live} />}>
              {status.label}
            </FleetChip>
            <FleetChip>{meta.short}</FleetChip>
            {watch.lastCheckedAt && <FleetChip>Checked {calculateTimeAgo(watch.lastCheckedAt)}</FleetChip>}
          </div>
          {watch.lastError && (
            <p className="rounded-xl border border-danger-subtle bg-danger-subtle px-3 py-2 text-12 text-danger-primary">
              {watch.lastError}
            </p>
          )}
          {error && (
            <p className="rounded-xl border border-danger-subtle bg-danger-subtle px-3 py-2 text-12 text-danger-primary">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-12 font-semibold tracking-wide text-tertiary uppercase">Recent checks</h3>
            <span className="text-11 text-tertiary">{checks.length ? `${checks.length} shown` : ""}</span>
          </div>

          {!checks.length && !loading && !error && (
            <p className="rounded-xl border border-dashed border-subtle px-3 py-6 text-center text-12 text-placeholder">
              No checks recorded yet. The fleet runs the first one shortly after a watch is added.
            </p>
          )}

          {loading && !checks.length && (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-14 animate-pulse rounded-xl bg-layer-2" />
              ))}
            </div>
          )}

          {checks.length > 0 && (
            <FleetStagger key={watchId ?? "none"} className="relative flex flex-col gap-2">
              <span aria-hidden="true" className="bg-border-subtle absolute top-3 bottom-3 left-[13px] w-px" />
              {checks.map((check) => {
                const summary = meta.summarize(check);
                const okTone = check.ok === false ? "danger" : "success";
                const when = check.checkedAt ?? check.at ?? null;
                return (
                  <FleetStaggerItem key={checkKey(check)} className="relative flex gap-3 pl-1">
                    <span className="relative z-[1] mt-2.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface-1">
                      <FleetPulse tone={summary?.tone ?? okTone} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-subtle bg-layer-1 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-13 font-medium",
                            summary?.tone === "danger" ? "text-danger-primary" : "text-primary"
                          )}
                        >
                          {summary?.headline ?? (check.ok === false ? "Failed" : "Checked")}
                        </span>
                        <span className="flex-shrink-0 text-11 text-tertiary">
                          {when ? calculateTimeAgo(when) : ""}
                        </span>
                      </div>
                      {(summary?.detail || check.error) && (
                        <span className="truncate text-11 text-tertiary">{summary?.detail ?? check.error}</span>
                      )}
                      {watch.kind === "leaderboard" && <Standings check={check} />}
                    </div>
                  </FleetStaggerItem>
                );
              })}
            </FleetStagger>
          )}
        </div>
      )}
    </FleetSheet>
  );
});
