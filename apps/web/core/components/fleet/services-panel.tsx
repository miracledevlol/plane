/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import type { TFleetService, TFleetServiceCallResult } from "@plane/types";
import { Input } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { JsonView, TEXTAREA_CLASS, describeFleetError, parseJsonObject } from "./json-view";

type Props = {
  workspaceSlug: string;
};

/** Params object seeded with each declared default so the operator sees what the service accepts. */
const defaultParamsFor = (service: TFleetService) =>
  Object.fromEntries(Object.entries(service.params ?? {}).map(([name, param]) => [name, param.default ?? ""]));

export const FleetServicesPanel = observer(function FleetServicesPanel(props: Props) {
  const { workspaceSlug } = props;
  // store hooks
  const { services, servicesLoader, fetchServices, callService } = useFleet();
  // states
  const [slug, setSlug] = useState("");
  const [paramsText, setParamsText] = useState("{}");
  const [fresh, setFresh] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [result, setResult] = useState<TFleetServiceCallResult | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // derived values
  const list = services[workspaceSlug] ?? [];
  const isLoadingList = servicesLoader[workspaceSlug] === "init-loader";

  useEffect(() => {
    setListError(null);
    fetchServices(workspaceSlug).catch((error: unknown) =>
      setListError(describeFleetError(error, "Services could not be loaded."))
    );
  }, [workspaceSlug, fetchServices]);

  const selectService = (service: TFleetService) => {
    setSlug(service.slug);
    setParamsText(JSON.stringify(defaultParamsFor(service), null, 2));
    setCallError(null);
  };

  const handleCall = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedSlug = slug.trim();
    if (!trimmedSlug || isCalling) return;
    const parsed = parseJsonObject(paramsText);
    if (parsed.error) {
      setCallError(parsed.error);
      return;
    }
    setIsCalling(true);
    setCallError(null);
    setResult(null);
    try {
      setResult(await callService(workspaceSlug, trimmedSlug, { params: parsed.value, fresh }));
    } catch (error: unknown) {
      setCallError(describeFleetError(error, "The call failed."));
    } finally {
      setIsCalling(false);
    }
  };

  const metaLine = result
    ? [
        result.cached !== undefined ? `cached: ${String(result.cached)}` : null,
        result.asOf ? `asOf: ${result.asOf}` : null,
        result.jobId ? `jobId: ${result.jobId}` : null,
      ]
        .filter(Boolean)
        .join("  ·  ")
    : "";

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-64 flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-subtle pr-3">
        <span className="text-11 font-semibold tracking-wide text-tertiary uppercase">Services</span>
        {isLoadingList && <span className="text-13 text-tertiary">Loading services...</span>}
        {!isLoadingList && (listError || !list.length) && (
          <span className="text-12 text-tertiary">
            {listError ? `${listError} ` : ""}The fleet did not list services; enter a slug manually.
          </span>
        )}
        {list.map((service) => (
          <button
            key={service.slug}
            type="button"
            onClick={() => selectService(service)}
            className={cn(
              "flex flex-col rounded px-2 py-1.5 text-left hover:bg-layer-transparent-hover",
              service.slug === slug ? "bg-layer-1" : ""
            )}
          >
            <span className="text-13 font-medium text-primary">{service.name || service.slug}</span>
            <span className="text-11 text-tertiary">{service.slug}</span>
            {service.description && <span className="text-11 text-secondary">{service.description}</span>}
            {service.params && Object.keys(service.params).length > 0 && (
              <span className="text-11 text-tertiary">params: {Object.keys(service.params).join(", ")}</span>
            )}
          </button>
        ))}
      </aside>
      <form onSubmit={handleCall} className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div className="flex flex-col gap-1">
          <label htmlFor="fleet-service-slug" className="text-12 text-secondary">
            Service slug
          </label>
          <Input
            id="fleet-service-slug"
            inputSize="sm"
            placeholder="e.g. hn-top"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            className="w-full max-w-md"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fleet-service-params" className="text-12 text-secondary">
            Params (JSON)
          </label>
          <textarea
            id="fleet-service-params"
            className={TEXTAREA_CLASS}
            rows={6}
            value={paramsText}
            onChange={(event) => setParamsText(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="fleet-service-fresh" className="flex items-center gap-2 text-13 text-primary">
            <input
              id="fleet-service-fresh"
              type="checkbox"
              checked={fresh}
              onChange={(event) => setFresh(event.target.checked)}
            />
            Fresh
          </label>
          <Button variant="primary" size="sm" type="submit" loading={isCalling} disabled={isCalling || !slug.trim()}>
            {isCalling ? "Calling" : "Call"}
          </Button>
          {isCalling && <span className="text-12 text-tertiary">Fleet is working…</span>}
        </div>
        {callError && <span className="text-12 text-danger-primary">{callError}</span>}
        {result && (
          <>
            {metaLine && <span className="text-11 text-tertiary">{metaLine}</span>}
            <JsonView value={result.output !== undefined ? result.output : result} />
          </>
        )}
      </form>
    </div>
  );
});
