/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertCircle, Clock3 } from "lucide-react";
// plane imports
import type { TFleetWatch } from "@plane/types";
import { calculateTimeAgo, cn } from "@plane/utils";
// local imports
import { FleetCard, FleetChip, FleetPulse } from "../ui";
import { watchKindMeta, watchStatus } from "./watch-kinds";

type Props = {
  watch: TFleetWatch;
  selected?: boolean;
  onSelect?: (watch: TFleetWatch) => void;
};

/** One watch: its kind, target, status and what the latest check found. */
export function FleetWatchCard(props: Props) {
  const { watch, selected = false, onSelect } = props;
  const meta = watchKindMeta(watch.kind);
  const status = watchStatus(watch);
  const summary = meta.summarize(watch.latest);
  const Icon = meta.icon;
  const lastChecked = watch.lastCheckedAt ?? watch.latest?.checkedAt ?? watch.latest?.at ?? null;

  return (
    <FleetCard
      interactive={Boolean(onSelect)}
      tone={selected ? "accent" : "neutral"}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      onClick={() => onSelect?.(watch)}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(watch);
        }
      }}
      className={cn(
        "focus-visible:ring-accent-primary/60 flex h-full flex-col gap-3 p-4 outline-none focus-visible:ring-2",
        selected && "ring-1 ring-accent-strong"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border",
            meta.tone === "success" && "border-success-subtle bg-success-subtle text-success-primary",
            meta.tone === "info" && "border-info-subtle bg-info-subtle text-info-primary",
            meta.tone === "warning" && "border-warning-subtle bg-warning-subtle text-warning-primary",
            meta.tone === "accent" && "border-accent-subtle bg-accent-subtle text-accent-primary",
            meta.tone === "danger" && "border-danger-subtle bg-danger-subtle text-danger-primary",
            meta.tone === "neutral" && "border-subtle bg-layer-2 text-secondary"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <FleetPulse tone={status.tone} live={status.live} label={status.label} />
            <span className="text-11 font-medium tracking-wide text-tertiary uppercase">{meta.label}</span>
          </span>
          <span className="truncate text-13 font-medium text-primary" title={meta.displayTarget(watch)}>
            {meta.displayTarget(watch)}
          </span>
        </div>
      </div>

      <div className="flex min-h-[2.75rem] flex-col justify-center rounded-xl bg-layer-2 px-3 py-2">
        {summary ? (
          <>
            <span
              className={cn(
                "truncate text-14 font-semibold tracking-tight",
                summary.tone === "danger" ? "text-danger-primary" : "text-primary"
              )}
            >
              {summary.headline}
            </span>
            {summary.detail && <span className="truncate text-11 text-tertiary">{summary.detail}</span>}
          </>
        ) : (
          <span className="text-12 text-placeholder">
            {status.label === "Checking" ? "Checking now" : "No data yet"}
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 text-11 text-tertiary">
        <span className="flex min-w-0 items-center gap-1.5">
          <Clock3 className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{lastChecked ? calculateTimeAgo(lastChecked) : "Never checked"}</span>
        </span>
        {watch.lastError ? (
          <span className="flex min-w-0 items-center gap-1 text-danger-primary" title={watch.lastError}>
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{watch.lastError}</span>
          </span>
        ) : (
          <FleetChip tone={status.tone === "neutral" ? "neutral" : status.tone} className="h-5 px-1.5 text-10">
            {status.label}
          </FleetChip>
        )}
      </div>
    </FleetCard>
  );
}
