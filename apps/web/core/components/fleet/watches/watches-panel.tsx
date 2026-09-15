/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Plus, Radar, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { TFleetWatch, TFleetWatchKind, TFleetWatchTotals } from "@plane/types";
import { calculateTimeAgo, cn } from "@plane/utils";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { describeFleetError } from "../json-view";
import { FleetButton, FleetCounter, FleetReveal, FleetSegmented, FleetStagger, FleetStaggerItem } from "../ui";
import type { TFleetSegmentOption } from "../ui";
import { FleetAddWatchSheet } from "./add-watch-sheet";
import { FleetCheckTimeline } from "./check-timeline";
import { FleetWatchCard } from "./watch-card";
import { WATCH_KINDS, watchKindMeta } from "./watch-kinds";

type Props = {
  workspaceSlug: string;
};

type Filter = "all" | TFleetWatchKind;

const TOTAL_TILES: { key: keyof TFleetWatchTotals; label: string }[] = [
  { key: "watches", label: "Watches" },
  { key: "followers", label: "Followers tracked" },
  { key: "posts", label: "Posts tracked" },
  { key: "uptimeUrls", label: "Health checks" },
  { key: "priceUrls", label: "Price monitors" },
  { key: "collections", label: "NFT floors" },
  { key: "serpKeywords", label: "Search ranks" },
];

const EMPTY_WATCHES: TFleetWatch[] = [];

const watchKey = (watch: TFleetWatch, index: number) => String(watch.id ?? `${watch.kind}:${watch.target}:${index}`);

/**
 * The Watches tab: what the fleet is keeping an eye on for this workspace,
 * with an operator flow for adding more.
 */
export const FleetWatchesPanel = observer(function FleetWatchesPanel(props: Props) {
  const { workspaceSlug } = props;
  // store hooks
  const { watches, watchTotals, fetchWatches } = useFleet();
  const { allowPermissions } = useUserPermissions();
  // states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<TFleetWatchKind | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // derived values
  // the fleet only lets operators create watches; guests can look
  const canOperate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE,
    workspaceSlug
  );
  // read straight from the store so a refresh re-renders the observer
  const allWatches = watches[workspaceSlug] ?? EMPTY_WATCHES;
  const totals = watchTotals[workspaceSlug] ?? {};
  const hasLoaded = watches[workspaceSlug] !== undefined;

  const countsByKind = useMemo(() => {
    const counts: Partial<Record<TFleetWatchKind, number>> = {};
    allWatches.forEach((watch) => {
      const kind = watchKindMeta(watch.kind).kind;
      counts[kind] = (counts[kind] ?? 0) + 1;
    });
    return counts;
  }, [allWatches]);

  const visibleWatches = useMemo(
    () => (filter === "all" ? allWatches : allWatches.filter((watch) => watchKindMeta(watch.kind).kind === filter)),
    [allWatches, filter]
  );

  const selectedWatch = useMemo(
    () => (selectedId ? (allWatches.find((watch) => String(watch.id) === selectedId) ?? null) : null),
    [allWatches, selectedId]
  );

  const filterOptions = useMemo<TFleetSegmentOption<Filter>[]>(
    () => [
      { value: "all", label: "All", count: allWatches.length },
      ...WATCH_KINDS.filter((meta) => countsByKind[meta.kind]).map((meta) => {
        const Icon = meta.icon;
        return { value: meta.kind, label: meta.short, icon: <Icon />, count: countsByKind[meta.kind] };
      }),
    ],
    [allWatches.length, countsByKind]
  );

  const tiles = TOTAL_TILES.filter((tile) => typeof totals[tile.key] === "number");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await fetchWatches(workspaceSlug);
      setAsOf(snapshot.asOf ?? new Date().toISOString());
    } catch (fetchError) {
      setError(describeFleetError(fetchError, "Watches could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, fetchWatches]);

  useEffect(() => {
    load();
  }, [load]);

  // a filter that no longer matches anything falls back to everything
  useEffect(() => {
    if (filter !== "all" && !countsByKind[filter]) setFilter("all");
  }, [filter, countsByKind]);

  const openAdd = (kind: TFleetWatchKind | null = null) => {
    setAddKind(kind);
    setAddOpen(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
      <FleetReveal className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-20 font-semibold tracking-tight text-primary">
            <Radar className="h-5 w-5 text-accent-primary" />
            Watches
          </h2>
          <p className="text-13 text-secondary">
            Things the fleet checks on a schedule and keeps history for.
            {asOf && <span className="text-tertiary"> Updated {calculateTimeAgo(asOf)}.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FleetButton variant="secondary" size="md" icon={<RefreshCw />} loading={loading} onClick={load}>
            Refresh
          </FleetButton>
          {canOperate && (
            <FleetButton variant="primary" size="md" icon={<Plus />} onClick={() => openAdd(null)}>
              Add watch
            </FleetButton>
          )}
        </div>
      </FleetReveal>

      {error && (
        <FleetReveal className="rounded-2xl border border-danger-subtle bg-danger-subtle px-4 py-3 text-13 text-danger-primary">
          {error}
        </FleetReveal>
      )}

      {tiles.length > 0 && (
        <FleetStagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <FleetStaggerItem
              key={tile.key}
              className="flex flex-col gap-1 rounded-2xl border border-subtle bg-surface-1 px-4 py-3"
            >
              <span className="text-11 font-medium tracking-wide text-tertiary uppercase">{tile.label}</span>
              <FleetCounter value={totals[tile.key]} className="text-22 font-semibold tracking-tight text-primary" />
            </FleetStaggerItem>
          ))}
        </FleetStagger>
      )}

      {canOperate && (
        <FleetReveal delay={0.05} className="flex flex-col gap-2">
          <span className="text-11 font-medium tracking-wide text-tertiary uppercase">Quick add</span>
          <div className="flex flex-wrap gap-2">
            {WATCH_KINDS.map((meta) => {
              const Icon = meta.icon;
              return (
                <FleetButton
                  key={meta.kind}
                  variant="outline"
                  size="sm"
                  icon={<Icon />}
                  onClick={() => openAdd(meta.kind)}
                >
                  {meta.label}
                </FleetButton>
              );
            })}
          </div>
        </FleetReveal>
      )}

      {allWatches.length > 0 && (
        <FleetReveal delay={0.08} className="flex flex-wrap items-center justify-between gap-3">
          <FleetSegmented
            options={filterOptions}
            value={filter}
            onChange={setFilter}
            aria-label="Filter watches by kind"
          />
          <span className="text-12 text-tertiary">
            {visibleWatches.length === allWatches.length
              ? `${allWatches.length} ${allWatches.length === 1 ? "watch" : "watches"}`
              : `${visibleWatches.length} of ${allWatches.length}`}
          </span>
        </FleetReveal>
      )}

      {!hasLoaded && loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-40 animate-pulse rounded-2xl bg-layer-2" />
          ))}
        </div>
      )}

      {hasLoaded && allWatches.length === 0 && !loading && (
        <FleetReveal
          delay={0.1}
          className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-subtle px-6 py-14 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle text-accent-primary">
            <Radar className="h-6 w-6" />
          </span>
          <h3 className="text-15 font-semibold text-primary">Nothing is being watched yet</h3>
          <p className="max-w-md text-13 text-secondary">
            {canOperate
              ? "Add a health check for a site, follow an X account, or track a price, an NFT floor, a race or a search rank."
              : "Workspace members and admins can add watches. Ask one of them to set something up."}
          </p>
          {canOperate && (
            <FleetButton variant="primary" size="md" icon={<Plus />} onClick={() => openAdd(null)} className="mt-2">
              Add your first watch
            </FleetButton>
          )}
        </FleetReveal>
      )}

      {visibleWatches.length > 0 && (
        <motion.div layout className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {visibleWatches.map((watch, index) => {
              const key = watchKey(watch, index);
              return (
                <motion.div
                  key={key}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 34,
                    mass: 0.7,
                    delay: Math.min(index, 8) * 0.03,
                  }}
                  className={cn("min-w-0")}
                >
                  <FleetWatchCard
                    watch={watch}
                    selected={selectedId !== null && String(watch.id) === selectedId}
                    onSelect={watch.id !== undefined ? (picked) => setSelectedId(String(picked.id)) : undefined}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {hasLoaded && allWatches.length > 0 && visibleWatches.length === 0 && (
        <p className="rounded-2xl border border-dashed border-subtle px-4 py-8 text-center text-13 text-placeholder">
          No watches of that kind.
        </p>
      )}

      <FleetAddWatchSheet
        workspaceSlug={workspaceSlug}
        open={addOpen}
        initialKind={addKind}
        onClose={() => setAddOpen(false)}
        onCreated={(watch) => {
          if (watch.id !== undefined) setSelectedId(String(watch.id));
          load();
        }}
      />
      <FleetCheckTimeline workspaceSlug={workspaceSlug} watch={selectedWatch} onClose={() => setSelectedId(null)} />
    </div>
  );
});
