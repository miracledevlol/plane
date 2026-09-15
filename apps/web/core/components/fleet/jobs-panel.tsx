/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TFleetJobKind } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { JsonView, TEXTAREA_CLASS, describeFleetError, parseJsonObject } from "./json-view";

type Props = {
  workspaceSlug: string;
};

const JOB_KINDS: TFleetJobKind[] = ["scrape", "search", "crawl", "browse"];
/** Statuses after which the fleet will not change a job again. */
const TERMINAL_STATUSES = new Set(["done", "failed", "cancelled", "expired"]);
/** Seconds the fleet holds the create request open before it answers with a queued job. */
const JOB_WAIT_SEC = 45;
const POLL_INTERVAL_MS = 3000;
/** Stop polling a job that never settles; the operator can re-select it to poll again. */
const POLL_MAX_MS = 5 * 60 * 1000;

const defaultPayloadFor = (kind: TFleetJobKind) =>
  JSON.stringify(kind === "search" ? { query: "" } : { url: "" }, null, 2);

export const FleetJobsPanel = observer(function FleetJobsPanel(props: Props) {
  const { workspaceSlug } = props;
  // store hooks
  const { jobs, getJobIds, createJob, fetchJob } = useFleet();
  // states
  const [kind, setKind] = useState<TFleetJobKind>("scrape");
  const [payloadText, setPayloadText] = useState(defaultPayloadFor("scrape"));
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  // derived values
  const jobIds = getJobIds(workspaceSlug);
  const selectedJob = selectedJobId ? jobs[selectedJobId] : undefined;
  const selectedStatus = typeof selectedJob?.status === "string" ? selectedJob.status : "";
  const isSelectedRunning = Boolean(selectedJobId) && !TERMINAL_STATUSES.has(selectedStatus.toLowerCase());

  // keep re-reading the open job until the fleet settles it
  useEffect(() => {
    if (!selectedJobId || !isSelectedRunning) return;
    const jobId = selectedJobId;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > POLL_MAX_MS) {
        window.clearInterval(timer);
        return;
      }
      if (document.hidden) return;
      fetchJob(workspaceSlug, jobId).catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [workspaceSlug, selectedJobId, isSelectedRunning, fetchJob]);

  const handleKindChange = (next: TFleetJobKind) => {
    setKind(next);
    setPayloadText(defaultPayloadFor(next));
  };

  const selectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    fetchJob(workspaceSlug, jobId).catch((error: unknown) =>
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: describeFleetError(error, "Job could not be loaded."),
      })
    );
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseJsonObject(payloadText);
    if (parsed.error) {
      setFormError(parsed.error);
      return;
    }
    setIsCreating(true);
    setFormError(null);
    try {
      const job = await createJob(workspaceSlug, { kind, input: parsed.value ?? {}, wait: JOB_WAIT_SEC });
      if (typeof job.id === "string") setSelectedJobId(job.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Job queued." });
    } catch (error: unknown) {
      setFormError(describeFleetError(error, "Job could not be created."));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="flex w-80 flex-shrink-0 flex-col gap-3 overflow-y-auto border-r border-subtle pr-3">
        <form onSubmit={handleCreate} className="flex flex-col gap-2">
          <label htmlFor="fleet-job-kind" className="text-12 text-secondary">
            Kind
          </label>
          <select
            id="fleet-job-kind"
            className="rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13 text-primary outline-none"
            value={kind}
            onChange={(event) => handleKindChange(event.target.value as TFleetJobKind)}
          >
            {JOB_KINDS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <label htmlFor="fleet-job-payload" className="text-12 text-secondary">
            Payload (JSON)
          </label>
          <textarea
            id="fleet-job-payload"
            className={TEXTAREA_CLASS}
            rows={5}
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
          />
          {formError && <span className="text-12 text-danger-primary">{formError}</span>}
          <Button variant="primary" size="sm" type="submit" loading={isCreating} disabled={isCreating}>
            {isCreating ? "Queuing" : "Create job"}
          </Button>
        </form>
        <span className="text-11 font-semibold tracking-wide text-tertiary uppercase">Jobs this session</span>
        {!jobIds.length && <span className="text-13 text-tertiary">No jobs created yet.</span>}
        {jobIds.map((jobId) => {
          const job = jobs[jobId];
          return (
            <button
              key={jobId}
              type="button"
              onClick={() => selectJob(jobId)}
              className={cn(
                "flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-12 hover:bg-layer-transparent-hover",
                jobId === selectedJobId ? "bg-layer-1 text-primary" : "text-secondary"
              )}
            >
              <span className="font-mono truncate">{jobId}</span>
              <span className="flex-shrink-0 text-tertiary">
                {typeof job?.kind === "string" ? job.kind : "?"} · {typeof job?.status === "string" ? job.status : "?"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
        {selectedJob ? (
          <>
            <span className="text-11 text-tertiary">
              {isSelectedRunning ? `Polling every ${POLL_INTERVAL_MS / 1000} s while the job runs…` : "Job settled."}
            </span>
            <JsonView value={selectedJob} className="max-h-none" />
          </>
        ) : (
          <span className="text-13 text-tertiary">Pick a job to see its details.</span>
        )}
      </div>
    </div>
  );
});
