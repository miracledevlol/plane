/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TFleetJson } from "@plane/types";
import { Input } from "@plane/ui";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { TABLE_CLASS, TD_CLASS, TH_CLASS, describeFleetError, primitiveEntries } from "./json-view";

type Props = {
  workspaceSlug: string;
};

const WATCH_COLUMNS = ["id", "kind", "target"];
const CHECK_COLUMNS = ["watchId", "up", "httpStatus", "responseMs", "at"];

/** Fixed columns first, then whatever other primitive keys the rows carry. */
const columnsFor = (rows: TFleetJson[], fixed: string[]) => {
  const extra = new Set<string>();
  rows.forEach((row) => {
    primitiveEntries(row).forEach(([key]) => {
      if (!fixed.includes(key)) extra.add(key);
    });
  });
  return [...fixed, ...extra];
};

function RowTable(props: { rows: TFleetJson[]; columns: string[]; empty: string }) {
  const { rows, columns, empty } = props;
  if (!rows.length) return <span className="text-13 text-tertiary">{empty}</span>;
  return (
    <div className="overflow-x-auto">
      <table className={TABLE_CLASS}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className={TH_CLASS}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = Object.fromEntries(primitiveEntries(row));
            return (
              <tr key={typeof row.id === "string" ? row.id : JSON.stringify(values)}>
                {columns.map((column) => (
                  <td key={column} className={TD_CLASS}>
                    {values[column] ?? ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const FleetWatchesPanel = observer(function FleetWatchesPanel(props: Props) {
  const { workspaceSlug } = props;
  // store hooks
  const { watches, checks, fetchWatches, fetchChecks, createWatch } = useFleet();
  // states
  const [kind, setKind] = useState("uptime");
  const [target, setTarget] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // derived values
  const watchRows = watches[workspaceSlug] ?? [];
  const checkRows = checks[workspaceSlug] ?? [];

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const results = await Promise.allSettled([fetchWatches(workspaceSlug), fetchChecks(workspaceSlug)]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected")
      setErrorMessage(describeFleetError(failed.reason, "Watches could not be loaded."));
    setIsLoading(false);
  }, [workspaceSlug, fetchWatches, fetchChecks]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target.trim() || !kind.trim()) return;
    setIsCreating(true);
    try {
      await createWatch(workspaceSlug, { kind: kind.trim(), target: target.trim() });
      setTarget("");
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Watch added." });
    } catch (error: unknown) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: describeFleetError(error, "Watch could not be added."),
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-11 font-semibold tracking-wide text-tertiary uppercase">Watches</span>
        <Button variant="secondary" size="sm" type="button" loading={isLoading} disabled={isLoading} onClick={load}>
          Refresh
        </Button>
      </div>
      {errorMessage && <span className="text-12 text-danger-primary">{errorMessage}</span>}
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="fleet-watch-kind" className="text-12 text-secondary">
            Kind
          </label>
          <Input id="fleet-watch-kind" inputSize="sm" value={kind} onChange={(event) => setKind(event.target.value)} />
        </div>
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <label htmlFor="fleet-watch-target" className="text-12 text-secondary">
            Target
          </label>
          <Input
            id="fleet-watch-target"
            inputSize="sm"
            placeholder="https://example.com/health"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="w-full"
          />
        </div>
        <Button variant="primary" size="sm" type="submit" loading={isCreating} disabled={isCreating || !target.trim()}>
          Add watch
        </Button>
      </form>
      <RowTable rows={watchRows} columns={columnsFor(watchRows, WATCH_COLUMNS)} empty="No watches yet." />
      <span className="text-11 font-semibold tracking-wide text-tertiary uppercase">Newest checks</span>
      <RowTable rows={checkRows} columns={columnsFor(checkRows, CHECK_COLUMNS)} empty="No checks recorded yet." />
    </div>
  );
});
