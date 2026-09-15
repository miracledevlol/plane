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
import type { TFleetSettingsPayload } from "@plane/types";
import { Input } from "@plane/ui";
// hooks
import { useFleet } from "@/hooks/store/use-fleet";
// local imports
import { describeFleetError, primitiveEntries } from "./json-view";

type Props = {
  workspaceSlug: string;
};

type FieldErrors = Partial<Record<"base_url" | "api_key" | "is_enabled" | "form", string>>;

/** Turn a thrown `{field: [...]}` map or `{error, code}` body into per-field messages. */
const toFieldErrors = (error: unknown, fallback: string): FieldErrors => {
  const data = (error ?? {}) as Record<string, unknown>;
  const result: FieldErrors = {};
  for (const field of ["base_url", "api_key", "is_enabled"] as const) {
    const value = data[field];
    if (Array.isArray(value) && value.length) result[field] = String(value[0]);
    else if (typeof value === "string") result[field] = value;
  }
  if (!Object.keys(result).length) result.form = describeFleetError(error, fallback);
  return result;
};

export const FleetSettingsForm = observer(function FleetSettingsForm(props: Props) {
  const { workspaceSlug } = props;
  // store hooks
  const { getSettings, updateSettings, testConnection } = useFleet();
  // derived values
  const settings = getSettings(workspaceSlug);
  // states
  const [baseUrl, setBaseUrl] = useState(settings?.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [isEnabled, setIsEnabled] = useState(settings?.is_enabled ?? false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // pick up server values once they arrive or change
  useEffect(() => {
    setBaseUrl(settings?.base_url ?? "");
    setIsEnabled(settings?.is_enabled ?? false);
    setApiKey("");
    setErrors({});
  }, [workspaceSlug, settings?.base_url, settings?.is_enabled]);

  const submit = async (payload: TFleetSettingsPayload, successMessage: string) => {
    setIsSaving(true);
    setErrors({});
    try {
      await updateSettings(workspaceSlug, payload);
      setApiKey("");
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: successMessage });
    } catch (error: unknown) {
      setErrors(toFieldErrors(error, "Fleet settings could not be saved."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const payload: TFleetSettingsPayload = { base_url: baseUrl.trim(), is_enabled: isEnabled };
    if (apiKey.trim()) payload.api_key = apiKey.trim();
    submit(payload, "Fleet settings saved.");
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await testConnection(workspaceSlug);
      const jobsToday = result.usage?.jobsToday;
      const summary = primitiveEntries(result.usage)
        .slice(0, 3)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      let message = "Connected";
      if (jobsToday !== undefined) message = `Connected. Jobs today: ${String(jobsToday)}.`;
      else if (summary) message = `Connected. ${summary}`;
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Fleet reachable", message });
    } catch (error: unknown) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: describeFleetError(error, "Connection failed.") });
    } finally {
      setIsTesting(false);
    }
  };

  const hasAnyKey = Boolean(settings?.has_key || settings?.instance_key_available);
  const keyPlaceholder = settings?.has_key
    ? `bk_…${settings.api_key_hint} (leave blank to keep)`
    : settings?.instance_key_available
      ? "Using the instance key (paste one to override)"
      : "bk_…";

  return (
    <form onSubmit={handleSave} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="fleet-base-url" className="text-12 text-secondary">
          Fleet URL
        </label>
        <Input
          id="fleet-base-url"
          name="base_url"
          type="url"
          inputSize="sm"
          placeholder="https://fleet.example.com"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          hasError={Boolean(errors.base_url)}
          className="w-full"
        />
        {errors.base_url && <span className="text-11 text-danger-primary">{errors.base_url}</span>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="fleet-api-key" className="text-12 text-secondary">
          Bot key
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="fleet-api-key"
            name="api_key"
            type="password"
            inputSize="sm"
            placeholder={keyPlaceholder}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            hasError={Boolean(errors.api_key)}
            autoComplete="off"
            className="w-full"
          />
          {settings?.has_key && (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={isSaving}
              onClick={() => submit({ api_key: "" }, "Fleet key cleared.")}
            >
              Clear key
            </Button>
          )}
        </div>
        {errors.api_key && <span className="text-11 text-danger-primary">{errors.api_key}</span>}
        <span className="text-11 text-tertiary">
          {settings?.instance_key_available && !settings?.has_key
            ? "This instance has a shared fleet key. Paste a workspace key here to use its own quotas and host policy."
            : "Mint an external key on the fleet’s Agents screen with only the kinds and hosts this workspace needs."}
        </span>
      </div>
      <label htmlFor="fleet-enabled" className="flex items-center gap-2 text-13 text-primary">
        <input
          id="fleet-enabled"
          name="is_enabled"
          type="checkbox"
          checked={isEnabled}
          onChange={(event) => setIsEnabled(event.target.checked)}
        />
        Enabled
      </label>
      {errors.is_enabled && <span className="text-11 text-danger-primary">{errors.is_enabled}</span>}
      {errors.form && <span className="text-12 text-danger-primary">{errors.form}</span>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" type="submit" loading={isSaving} disabled={isSaving || !baseUrl.trim()}>
          {isSaving ? "Saving" : "Save"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          loading={isTesting}
          disabled={isTesting || !hasAnyKey}
          onClick={handleTest}
        >
          {isTesting ? "Testing" : "Test connection"}
        </Button>
      </div>
    </form>
  );
});
