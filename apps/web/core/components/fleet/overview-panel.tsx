/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { TABLE_CLASS, TD_CLASS, TH_CLASS, describeFleetError, primitiveEntries } from "./json-view";

type Props = {
  workspaceSlug: string;
};

export const FleetOverviewPanel = observer(function FleetOverviewPanel(props: Props) {
  const { workspaceSlug } = props;
  // store hooks
  const { usage, fetchUsage } = useFleet();
  // states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // derived values
  const current = usage[workspaceSlug];
  const summary = primitiveEntries(current);
  const services = Array.isArray(current?.services) ? current.services : [];
  const serviceColumns = Array.from(
    new Set(
      services.flatMap((service) => primitiveEntries(service).map(([key]) => key)).filter((key) => key !== "slug")
    )
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await fetchUsage(workspaceSlug);
    } catch (error: unknown) {
      setErrorMessage(describeFleetError(error, "Usage could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, fetchUsage]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-11 font-semibold tracking-wide text-tertiary uppercase">Usage</span>
        <Button variant="secondary" size="sm" type="button" loading={isLoading} disabled={isLoading} onClick={load}>
          Refresh
        </Button>
      </div>
      {errorMessage && <span className="text-12 text-danger-primary">{errorMessage}</span>}
      {!errorMessage && !summary.length && (
        <span className="text-13 text-tertiary">{isLoading ? "Loading usage..." : "The fleet reported no usage."}</span>
      )}
      {summary.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
          {summary.map(([key, value]) => (
            <div key={key} className="flex flex-col rounded border border-subtle bg-surface-1 px-3 py-2">
              <dt className="truncate text-11 text-tertiary">{key}</dt>
              <dd className="truncate text-14 font-medium text-primary">{value || "-"}</dd>
            </div>
          ))}
        </dl>
      )}
      {services.length > 0 && (
        <div className="overflow-x-auto">
          <table className={TABLE_CLASS}>
            <thead>
              <tr>
                <th className={TH_CLASS}>slug</th>
                {serviceColumns.map((column) => (
                  <th key={column} className={TH_CLASS}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((service) => {
                const row = Object.fromEntries(primitiveEntries(service));
                return (
                  <tr key={typeof service.slug === "string" ? service.slug : JSON.stringify(row)}>
                    <td className={`${TD_CLASS} font-medium text-primary`}>{row.slug ?? "-"}</td>
                    {serviceColumns.map((column) => (
                      <td key={column} className={TD_CLASS}>
                        {row[column] ?? ""}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
