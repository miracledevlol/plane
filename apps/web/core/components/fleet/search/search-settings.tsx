/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
// plane imports
import { Switch } from "@plane/propel/switch";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TFleetSearchEngine } from "@plane/types";
import { CustomSearchSelect, CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { ENGINES, engineLabel } from "./search-utils";

export type TFleetSearchSettings = {
  engines: TFleetSearchEngine[];
  limit: number;
  fetchContent: boolean;
};

const RESULT_LIMITS = [5, 10, 20, 50];
const DEFAULT_SETTINGS: TFleetSearchSettings = { engines: ["ddg"], limit: 10, fetchContent: false };

const storageKey = (workspaceSlug: string) => `fleet-search-settings:${workspaceSlug}`;

const readSettings = (workspaceSlug: string): TFleetSearchSettings => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = window.localStorage.getItem(storageKey(workspaceSlug));
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<TFleetSearchSettings>;
    const engines = Array.isArray(parsed.engines)
      ? parsed.engines.filter((engine) => ENGINES.some((option) => option.key === engine))
      : [];
    return {
      engines: engines.length ? engines : DEFAULT_SETTINGS.engines,
      limit: RESULT_LIMITS.includes(Number(parsed.limit)) ? Number(parsed.limit) : DEFAULT_SETTINGS.limit,
      fetchContent: Boolean(parsed.fetchContent),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

/** The three search settings, kept per workspace in local storage. */
export const useFleetSearchSettings = (workspaceSlug: string) => {
  const [settings, setSettings] = useState<TFleetSearchSettings>(DEFAULT_SETTINGS);

  // read once per workspace; the first render stays on the defaults so the server and client agree
  useEffect(() => {
    setSettings(readSettings(workspaceSlug));
  }, [workspaceSlug]);

  const update = useCallback(
    (partial: Partial<TFleetSearchSettings>) => {
      const next = { ...settings, ...partial };
      setSettings(next);
      try {
        window.localStorage.setItem(storageKey(workspaceSlug), JSON.stringify(next));
      } catch {
        // a browser that refuses local storage only loses the preference
      }
    },
    [settings, workspaceSlug]
  );

  return { settings, update };
};

type Props = {
  settings: TFleetSearchSettings;
  onChange: (partial: Partial<TFleetSearchSettings>) => void;
  disabled?: boolean;
  className?: string;
};

/** Engines, results per engine and the page-content toggle, as one row. */
export function FleetSearchSettingsRow(props: Props) {
  const { settings, onChange, disabled = false, className } = props;
  // derived values
  const engineOptions = ENGINES.map((engine) => ({
    value: engine.key,
    query: engine.label,
    content: engine.label,
  }));
  const enginesLabel =
    settings.engines.length > 2
      ? `${settings.engines.length} engines`
      : settings.engines.map((engine) => engineLabel(engine)).join(", ");

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <CustomSearchSelect
        multiple
        value={settings.engines}
        options={engineOptions}
        disabled={disabled}
        label={<span className="text-12 text-secondary">{enginesLabel || "Pick an engine"}</span>}
        buttonClassName="px-2 py-1.5 rounded border border-subtle bg-surface-1"
        onChange={(value: TFleetSearchEngine[]) => {
          // the fleet needs at least one engine, so an empty pick keeps the current one
          if (!value.length) {
            setToast({
              type: TOAST_TYPE.WARNING,
              title: "Pick at least one engine",
              message: "A search needs one engine.",
            });
            return;
          }
          onChange({ engines: value });
        }}
      />
      <CustomSelect
        value={settings.limit}
        disabled={disabled}
        label={<span className="text-12 text-secondary">{settings.limit} per engine</span>}
        buttonClassName="px-2 py-1.5 rounded border border-subtle bg-surface-1"
        onChange={(value: number) => onChange({ limit: value })}
      >
        {RESULT_LIMITS.map((limit) => (
          <CustomSelect.Option key={limit} value={limit}>
            {limit} per engine
          </CustomSelect.Option>
        ))}
      </CustomSelect>
      <div className="flex items-center gap-2 rounded border border-subtle bg-surface-1 px-2 py-1.5">
        <span className="text-12 text-secondary">Fetch page content</span>
        <Switch
          value={settings.fetchContent}
          disabled={disabled}
          label="Fetch page content"
          onChange={(value) => onChange({ fetchContent: value })}
        />
      </div>
    </div>
  );
}
